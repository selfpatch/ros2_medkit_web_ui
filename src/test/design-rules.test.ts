import { describe, expect, it } from 'vitest';

// Every source file, as text. Tests are left out: they may quote class strings.
const sources = import.meta.glob(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}'], {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>;

// A quoted class string: '...', "..." or `...` on one line.
const LITERAL = /(['"`])((?:(?!\1).)*)\1/g;

/** Where a class string on a line of a source breaks a rule, as `path:line` */
function breaches(rule: (classes: string) => boolean): string[] {
    const found: string[] = [];
    for (const [path, text] of Object.entries(sources)) {
        text.split('\n').forEach((line, i) => {
            for (const [, , classes] of line.matchAll(LITERAL)) {
                if (rule(classes!)) found.push(`${path}:${i + 1}`);
            }
        });
    }
    return found;
}

// Tailwind's own colour scales; the app's colours are the tokens in src/index.css.
const PALETTE =
    /\b(?:text|bg|border|ring|fill|stroke|outline|from|to|via|divide|accent|caret|decoration)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;

describe('design rules', () => {
    it('reads some sources', () => {
        expect(Object.keys(sources).length).toBeGreaterThan(20);
    });

    /**
     * Tailwind 4 compiles `outline-none` to `--tw-outline-style: none` and
     * `focus-visible:outline-2` to `outline-style: var(--tw-outline-style)`, so a control
     * that has both draws no focus ring at all unless the style is set back to solid.
     */
    it('sets the outline style wherever a focus-visible outline width is set', () => {
        expect(
            breaches(
                (classes) =>
                    /focus-visible:outline-\d/.test(classes) && !classes.includes('focus-visible:outline-solid')
            )
        ).toEqual([]);
    });

    // Colour is for states, through the state-* tokens; everything else is graphite.
    it("colours with the app's tokens, never Tailwind's palette", () => {
        expect(breaches((classes) => PALETTE.test(classes))).toEqual([]);
    });
});
