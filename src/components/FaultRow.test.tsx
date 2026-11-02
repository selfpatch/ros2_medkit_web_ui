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

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FaultRow } from './FaultRow';
import type { Fault, FaultResponse } from '@/lib/types';

const overheat: Fault = {
    code: 'MOTOR_OVERHEAT',
    message: 'Motor too hot',
    severity: 'error',
    status: 'active',
    timestamp: '2026-08-20T10:00:00Z',
    entity_id: 'motor',
    entity_type: 'app',
};

function row(fault: Fault, environmentData?: FaultResponse['environment_data']) {
    render(
        <FaultRow
            fault={fault}
            onClear={vi.fn()}
            isClearing={false}
            isExpanded
            onToggle={vi.fn()}
            environmentData={environmentData}
            isLoadingDetails={false}
        />
    );
}

describe('FaultRow', () => {
    it('says there is no environment data when the gateway sends both records empty and no snapshot', () => {
        // What the gateway sends for a fault without records.
        row(overheat, { extended_data_records: { first_occurrence: '', last_occurrence: '' }, snapshots: [] });

        expect(screen.getByText('No environment data available')).toBeInTheDocument();
        expect(screen.queryByText('Extended Data Records')).not.toBeInTheDocument();
    });

    it('lists the records it has', () => {
        row(overheat, {
            extended_data_records: { first_occurrence: '2026-08-20T10:00:00Z', last_occurrence: '' },
            snapshots: [],
        });

        expect(screen.getByText('Extended Data Records')).toBeInTheDocument();
        expect(screen.getByText('First Occurrence')).toBeInTheDocument();
        expect(screen.queryByText('Last Occurrence')).not.toBeInTheDocument();
    });

    it('offers Clear on an open fault only', () => {
        row(overheat);
        expect(screen.getByTitle('Clear fault')).toBeInTheDocument();
    });

    it('offers no Clear on a fault that ended', () => {
        row({ ...overheat, status: 'healed' });
        expect(screen.queryByTitle('Clear fault')).not.toBeInTheDocument();
        expect(screen.getByText('MOTOR_OVERHEAT')).toBeInTheDocument();
    });
});
