// Copyright 2026 bburda
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * Client-side role hint.
 *
 * This app has no authentication or role context today, so this is a best-effort
 * UX hint only. It controls visibility of Pro-tier affordances (e.g. the
 * compliance export). The authoritative gate is server-side: the gateway only
 * serves /compliance/export to the configurator/admin (Pro) tier and rejects
 * everyone else regardless of what this hint says.
 *
 * An operator can override the local hint via
 * localStorage.setItem('medkit_user_role', 'viewer' | 'operator' | 'configurator' | 'admin').
 */

export type UserRole = 'viewer' | 'operator' | 'configurator' | 'admin';

const ROLE_STORAGE_KEY = 'medkit_user_role';
const VALID_ROLES: readonly UserRole[] = ['viewer', 'operator', 'configurator', 'admin'];

/**
 * Read the current role hint. Defaults to 'admin' for the single-operator local
 * console so Pro features stay discoverable; downgrade via localStorage to see
 * the gate hide them. Carries no security weight (see module comment).
 */
export function getUserRole(): UserRole {
    try {
        const stored = localStorage.getItem(ROLE_STORAGE_KEY);
        if (stored && (VALID_ROLES as readonly string[]).includes(stored)) {
            return stored as UserRole;
        }
    } catch {
        // localStorage unavailable (e.g. SSR / privacy mode) - fall through
    }
    return 'admin';
}

/** Pro tier (configurator/admin) may export the compliance timeline. */
export function canExportCompliance(role: UserRole): boolean {
    return role === 'configurator' || role === 'admin';
}
