#!/usr/bin/env python3
# Copyright 2026 bburda
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

"""Data items for the data-values specs.

/e2e/counter changes on every message, /e2e/zero always carries 0, and
/e2e/silent has a subscriber but no publisher, so the gateway has no sample.
"""

import rclpy
from rclpy.node import Node
from std_msgs.msg import Int32, String

NODE_NAME = 'e2e_data_source'
PERIOD_SEC = 0.2


class DataSource(Node):
    def __init__(self):
        super().__init__(NODE_NAME)
        self._counter_pub = self.create_publisher(Int32, '/e2e/counter', 10)
        self._zero_pub = self.create_publisher(Int32, '/e2e/zero', 10)
        self._silent_sub = self.create_subscription(String, '/e2e/silent', lambda _msg: None, 10)
        self._count = 0
        self._timer = self.create_timer(PERIOD_SEC, self._publish)

    def _publish(self):
        self._count += 1
        self._counter_pub.publish(Int32(data=self._count))
        self._zero_pub.publish(Int32(data=0))


def main():
    rclpy.init()
    node = DataSource()
    try:
        rclpy.spin(node)
    finally:
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == '__main__':
    main()
