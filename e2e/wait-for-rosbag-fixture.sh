#!/usr/bin/env bash
#
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
#
# Blocks until the rosbag stack holds the fixture rosbag-recordings.spec.ts
# needs, and exits non-zero if it never does.
#
# The specs skip themselves when the fixture is missing, which is right for a
# developer who did not bring the second stack up, but in CI a skip is
# indistinguishable from a pass. This script is what makes the difference
# visible.
#
# It judges the SAME app the specs will judge: appHoldingTheFault() takes the
# first app whose fault list carries the code and never looks further, so this
# stops there too. Scanning on to a later app that happens to hold enough bags
# would let this pass while the specs skip on the first one.
#
# Seeding is not instant. The fault has to confirm, be acknowledged and confirm
# again before a second bag exists, so the wait is a real one, not a formality.

set -euo pipefail

GATEWAY_PORT="${E2E_ROSBAG_GATEWAY_PORT:-8081}"
GATEWAY_URL="${E2E_ROSBAG_GATEWAY_URL:-http://localhost:${GATEWAY_PORT}/api/v1}"
FAULT_CODE="${E2E_ROSBAG_FAULT_CODE:-E2E_FLAPPING_SENSOR}"
TIMEOUT_SEC="${E2E_ROSBAG_FIXTURE_TIMEOUT:-240}"

# Two, because the whole point of the specs is a fault that kept more than the
# newest recording. One bag means the gateway is up but the fixture is half
# seeded, which would skip the specs just as surely as no bag at all.
REQUIRED_RECORDINGS=2

deadline=$((SECONDS + TIMEOUT_SEC))
last_state="nothing answered on ${GATEWAY_URL}"

# Anything that is not a plain count means the gateway is not serving what the
# specs will parse. They call .json() on these same bodies and throw on a bad
# one, so a malformed answer is a fixture that is not ready yet - never an app
# to step over on the way to a healthier one.
is_count() {
    [[ $1 =~ ^[0-9]+$ ]]
}

expired() {
    ((SECONDS >= deadline))
}

while ! expired; do
    if ! apps=$(curl -fsS --max-time 5 "${GATEWAY_URL}/apps" 2>/dev/null); then
        sleep 2
        continue
    fi

    if ! app_ids=$(jq -r '.items[]?.id' <<<"${apps}" 2>/dev/null); then
        last_state="${GATEWAY_URL} answered /apps with something jq could not read"
        sleep 2
        continue
    fi

    # The likeliest failure is a gateway that answers perfectly while the seeder
    # never confirms the fault, so the no-fault case gets its own message rather
    # than falling back to the "nothing answered" one.
    saw_fault=0
    unusable=0

    # Read line by line: an id is one line, and word splitting would break an id
    # containing whitespace and glob-expand one containing * or ?.
    while IFS= read -r app; do
        [[ -n ${app} ]] || continue
        if expired; then
            unusable=1
            last_state="${GATEWAY_URL} was still being scanned when the deadline passed"
            break
        fi

        if ! faults=$(curl -fsS --max-time 5 "${GATEWAY_URL}/apps/${app}/faults" 2>/dev/null); then
            unusable=1
            last_state="${GATEWAY_URL} did not serve faults for ${app}"
            break
        fi

        hits=$(jq --arg fc "${FAULT_CODE}" '[.items[]? | select(.fault_code == $fc)] | length' <<<"${faults}" 2>/dev/null) || hits=''
        if ! is_count "${hits}"; then
            unusable=1
            last_state="${GATEWAY_URL} answered faults for ${app} with something the specs cannot parse"
            break
        fi
        ((hits > 0)) || continue
        saw_fault=1

        if ! bags=$(curl -fsS --max-time 5 "${GATEWAY_URL}/apps/${app}/bulk-data/rosbags" 2>/dev/null); then
            unusable=1
            last_state="${GATEWAY_URL} did not serve rosbags for ${app}"
            break
        fi

        count=$(jq --arg fc "${FAULT_CODE}" \
            '[.items[]? | select((."x-medkit".fault_codes // []) | index($fc))] | length' <<<"${bags}" 2>/dev/null) || count=''
        if ! is_count "${count}"; then
            unusable=1
            last_state="${GATEWAY_URL} answered rosbags for ${app} with something the specs cannot parse"
            break
        fi

        # Checked again here, not only on entry: the two requests above can each
        # take up to five seconds, so a scan that began in time can finish out of
        # it, and a wait that reports success past its own deadline is not one.
        if ((count >= REQUIRED_RECORDINGS)) && ! expired; then
            echo "${app} holds ${count} recordings for ${FAULT_CODE}"
            exit 0
        fi

        last_state="${app} holds ${count} recording(s) for ${FAULT_CODE}, need ${REQUIRED_RECORDINGS}"
        # The specs stop at the first app whose faults carry the code, so this
        # stops there too. Scanning on to a healthier app would let this pass
        # while they skip on this one.
        break
    done <<<"${app_ids}"

    ((saw_fault || unusable)) || last_state="${GATEWAY_URL} answered, but no app reports ${FAULT_CODE} yet"

    sleep 2
done

echo "Timed out after ${TIMEOUT_SEC}s waiting for the rosbag fixture: ${last_state}" >&2
exit 1
