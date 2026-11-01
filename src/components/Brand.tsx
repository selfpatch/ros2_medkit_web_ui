import wordmarkUrl from '@/assets/selfpatch-wordmark.svg';

// The wordmark's own proportions (its viewBox), so it keeps its shape at any height
const RATIO = 4471 / 1020;

/**
 * The selfpatch wordmark in graphite, at the top of the sidebar and of the phone bar.
 */
export function Brand({ height = 17 }: { height?: number }) {
    return <img src={wordmarkUrl} alt="selfpatch" width={Math.round(height * RATIO)} height={height} />;
}
