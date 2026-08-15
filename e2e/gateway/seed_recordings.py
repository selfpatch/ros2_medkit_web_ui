#!/usr/bin/env python3
# Copyright 2026 mfaferek93
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Leave one fault holding two black-box recordings, for the browser to click on.

Everything below the fault report is real: the fault manager runs its own
capture, records a topic that is genuinely being published, and writes two
separate bags to disk. Only the trigger is a service call rather than a sensor
detecting its own misconfiguration - the subject of these specs is the web UI,
and the demo nodes that detect faults on their own are not shipped in the
gateway image.

The fault is confirmed, acknowledged, then confirmed again: that is the sequence
that used to leave a single recording behind, because the second one overwrote
the first (ros2_medkit#620).
"""

import sys
import time

import rclpy
from rclpy.node import Node
from rclpy.qos import HistoryPolicy, QoSProfile, ReliabilityPolicy
from ros2_medkit_msgs.msg import Fault
from ros2_medkit_msgs.srv import ClearFault, ReportFault
from std_msgs.msg import Float32

FAULT_CODE = 'E2E_FLAPPING_SENSOR'
SOURCE_ID = '/e2e/probe_publisher'
PROBE_TOPIC = '/e2e/probe'
# Must exceed the configured duration_sec so the ring buffer holds a full window
# before each confirmation; a bag flushed from an empty buffer has no content.
FILL_SECONDS = 3.0


class Seeder(Node):
    def __init__(self):
        super().__init__('e2e_rosbag_seeder')
        qos = QoSProfile(
            reliability=ReliabilityPolicy.BEST_EFFORT,
            history=HistoryPolicy.KEEP_LAST,
            depth=10,
        )
        self.pub = self.create_publisher(Float32, PROBE_TOPIC, qos)
        self.report = self.create_client(ReportFault, '/fault_manager/report_fault')
        self.clear = self.create_client(ClearFault, '/fault_manager/clear_fault')

    def wait_for_services(self, timeout=90.0):
        for client, name in ((self.report, 'report_fault'), (self.clear, 'clear_fault')):
            if not client.wait_for_service(timeout_sec=timeout):
                raise SystemExit(f'{name} service never appeared')

    def publish_for(self, seconds, rate_hz=20.0):
        msg = Float32()
        msg.data = 1.0
        deadline = time.time() + seconds
        period = 1.0 / rate_hz
        while time.time() < deadline:
            self.pub.publish(msg)
            rclpy.spin_once(self, timeout_sec=0.0)
            time.sleep(period)

    def call(self, client, request):
        future = client.call_async(request)
        rclpy.spin_until_future_complete(self, future, timeout_sec=20.0)
        if future.result() is None:
            raise SystemExit('service call timed out')
        return future.result()

    def confirm(self):
        request = ReportFault.Request()
        request.fault_code = FAULT_CODE
        request.event_type = ReportFault.Request.EVENT_FAILED
        request.severity = Fault.SEVERITY_ERROR
        request.description = 'Intermittent sensor dropout seen twice'
        request.source_id = SOURCE_ID
        return self.call(self.report, request)

    def acknowledge(self):
        request = ClearFault.Request()
        request.fault_code = FAULT_CODE
        return self.call(self.clear, request)


def main():
    rclpy.init()
    node = Seeder()
    node.wait_for_services()

    # First occurrence.
    node.publish_for(FILL_SECONDS)
    node.confirm()
    node.publish_for(FILL_SECONDS)   # post-roll window, then finalize
    node.acknowledge()

    # Second occurrence. Before #620 this one replaced the first recording
    # outright, so the fault ended up with exactly one bag either way.
    node.publish_for(FILL_SECONDS)
    node.confirm()
    node.publish_for(FILL_SECONDS)

    # Deliberately NOT acknowledged: a cleared fault drops out of the default
    # CONFIRMED-only listing, so acknowledging this one too would leave the specs
    # with two bags on disk and no fault on screen pointing at them.
    print('SEEDED', flush=True)
    node.destroy_node()
    rclpy.shutdown()
    return 0


if __name__ == '__main__':
    sys.exit(main())
