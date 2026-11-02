import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/lib/store';
import type { FaultTopicRead, SovdResourceEntityType } from '@/lib/types';

const READ_EVERY_MS = 5000;

export interface LiveFaultReadings {
    /** Each topic's newest message that answered, by topic */
    values: ReadonlyMap<string, unknown>;
    /** When each topic last answered, by topic */
    answeredAt: ReadonlyMap<string, number>;
    /** When the newest round in which some topic answered ended; null until one did */
    readAt: number | null;
    /** Topics whose latest read failed while `values` keeps an older answer */
    stale: ReadonlySet<string>;
    /** The latest round got no answer from any topic */
    failing: boolean;
    /** A round of reads has finished, so a topic without an answer was asked and did not give one */
    asked: boolean;
}

const NOTHING: LiveFaultReadings = {
    values: new Map(),
    answeredAt: new Map(),
    readAt: null,
    stale: new Set(),
    failing: false,
    asked: false,
};

/**
 * What the topics a fault's snapshots caught read now, through the app that reports the
 * fault, every few seconds while `enabled`. A hidden tab is not read; a topic that does
 * not answer keeps its last answer, marked stale.
 */
export function useLiveFaultReadings(
    entityType: SovdResourceEntityType,
    entityId: string,
    topics: readonly string[],
    enabled: boolean
): LiveFaultReadings {
    const readFaultTopic = useAppStore((state) => state.readFaultTopic);
    const [live, setLive] = useState<{ key: string; readings: LiveFaultReadings }>({ key: '', readings: NOTHING });
    // What has been said in the console already: the first failure of each topic of each entity.
    const warned = useRef(new Set<string>());
    // One string, so a new array of the same topics does not start the reads over.
    const key = enabled && topics.length > 0 ? JSON.stringify([entityType, entityId, topics]) : '';

    useEffect(() => {
        if (!key) return;
        const [type, id, wanted] = JSON.parse(key) as [SovdResourceEntityType, string, string[]];
        // Called off when the page closes or turns to another fault, read still out included.
        const controller = new AbortController();
        let reading = false;
        // One topic at a time, and no new round while one is still out: a medkit gateway serves
        // every client from a small pool of threads (6 by default), and a topic it is not yet
        // sampling can hold one for seconds, so these reads never hold more than one of them.
        const read = async () => {
            if (reading || document.visibilityState === 'hidden') return;
            reading = true;
            try {
                const answers: FaultTopicRead[] = [];
                for (const topic of wanted) {
                    if (controller.signal.aborted) return;
                    answers.push(await readFaultTopic(type, id, topic, controller.signal));
                }
                if (controller.signal.aborted) return;
                const at = Date.now();
                answers.forEach((answer, i) => {
                    const said = `${type}/${id}#${wanted[i]}`;
                    if (!('failed' in answer) || warned.current.has(said)) return;
                    warned.current.add(said);
                    console.warn(`[faults] ${wanted[i]} of ${type}/${id} does not answer: ${answer.failed}`);
                });
                setLive((was) => {
                    const before = was.key === key ? was.readings : NOTHING;
                    const values = new Map(before.values);
                    const answeredAt = new Map(before.answeredAt);
                    const stale = new Set<string>();
                    let answered = false;
                    answers.forEach((answer, i) => {
                        const topic = wanted[i]!;
                        if ('message' in answer) {
                            values.set(topic, answer.message);
                            answeredAt.set(topic, at);
                            answered = true;
                        } else if (values.has(topic)) {
                            stale.add(topic);
                        }
                    });
                    const readAt = answered ? at : before.readAt;
                    return { key, readings: { values, answeredAt, readAt, stale, failing: !answered, asked: true } };
                });
            } finally {
                reading = false;
            }
        };
        void read();
        const timer = window.setInterval(() => void read(), READ_EVERY_MS);
        return () => {
            controller.abort();
            window.clearInterval(timer);
        };
    }, [key, readFaultTopic]);

    return live.key === key && key !== '' ? live.readings : NOTHING;
}
