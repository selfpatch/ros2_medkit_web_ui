import '@testing-library/jest-dom/vitest';

// jsdom's Blob lacks .text() - polyfill it so download tests can read blob contents
if (typeof Blob !== 'undefined' && !Blob.prototype.text) {
    Blob.prototype.text = function () {
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsText(this);
        });
    };
}

// jsdom has no ResizeObserver, which Radix's floating layer (tooltip, popover)
// constructs as soon as it opens - without it those components throw on render
// rather than failing an assertion.
if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    };
}
