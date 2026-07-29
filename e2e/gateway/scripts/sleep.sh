#!/usr/bin/env bash
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
# Kept short on purpose: the gateway's concurrency cap is 5 and it is global,
# not per script. A stopped-but-still-running execution (e.g. from a test run
# interrupted mid-scenario) holds its slot until this sleep exits naturally,
# and a running execution cannot be deleted - so a handful of interrupted runs
# inside a long sleep window would block every execution the suite tries to
# start afterwards, with no reset short of destroying the stack. 30 seconds is
# still ample for the "stop a running script" scenario, which stops it within
# a second or two of starting.
sleep 30
