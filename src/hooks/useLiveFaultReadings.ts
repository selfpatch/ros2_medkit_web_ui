import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import type { SovdResourceEntityType } from '@/lib/types';

const READ_EVERY_MS = 5000;

export interface LiveFaultReadings {
    /** Each topic's newest message, by topic */
    values: ReadonlyMap<string, unknown>;
    /** When the topics were last read, or null before the first answer */
    readAt: number | null;
}

const NOTHING: LiveFaultReadings = { values: new Map(), readAt: null };

/**
 * What the topics a fault's snapshots caught read now, through the app that reports the
 * fault, every few seconds while `enabled`. A hidden tab is not read; a topic that does
 * not answer keeps its last value.
 */
export function useLiveFaultReadings(
    entityType: SovdResourceEntityType,
    entityId: string,
    topics: string[],
    enabled: boolean
): LiveFaultReadings {
    const readFaultTopic = useAppStore((state) => state.readFaultTopic);
    const [live, setLive] = useState<{ key: string; readings: LiveFaultReadings }>({ key: '', readings: NOTHING });
    // One string, so a new array of the same topics does not start the reads over.
    const key = enabled && topics.length > 0 ? `${entityType}/${entityId}|${topics.join('|')}` : '';

    useEffect(() => {
        if (!key) return;
        let stopped = false;
        let reading = false;
        const wanted = key.split('|').slice(1);
        // One topic at a time, and no new round while one is still out: a medkit gateway serves
        // every client from a small pool of threads (6 by default) and a topic it is not yet
        // sampling can hold one for seconds, so this page never takes more than one of them.
        const read = async () => {
            if (reading || document.visibilityState === 'hidden') return;
            reading = true;
            try {
                const answers: unknown[] = [];
                for (const topic of wanted) {
                    if (stopped) return;
                    answers.push(await readFaultTopic(entityType, entityId, topic));
                }
                if (stopped) return;
                setLive((was) => {
                    const values = new Map(was.key === key ? was.readings.values : []);
                    answers.forEach((answer, i) => {
                        if (answer !== null && answer !== undefined) values.set(wanted[i]!, answer);
                    });
                    return { key, readings: { values, readAt: Date.now() } };
                });
            } finally {
                reading = false;
            }
        };
        void read();
        const timer = window.setInterval(() => void read(), READ_EVERY_MS);
        return () => {
            stopped = true;
            window.clearInterval(timer);
        };
    }, [key, entityType, entityId, readFaultTopic]);

    return live.key === key && key !== '' ? live.readings : NOTHING;
}
