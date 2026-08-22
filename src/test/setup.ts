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

/**
 * Recent Node versions ship an experimental global `localStorage` backed by a
 * file that vitest-environment-jsdom's globals never get a chance to
 * override, since it already occupies the slot before the environment is
 * installed. Left in place, it throws "Cannot read properties of undefined
 * (reading 'setItem')" the moment anything (e.g. zustand's persist
 * middleware) touches it - jsdom's own window.localStorage works fine, it is
 * only the copy merged onto the global object that is broken. Replace it
 * with a minimal in-memory Storage only when it is actually broken, so this
 * is a no-op on Node versions where jsdom's localStorage already works.
 */
function storageWorks(): boolean {
    try {
        globalThis.localStorage.setItem('__storage_probe__', '1');
        globalThis.localStorage.removeItem('__storage_probe__');
        return true;
    } catch {
        return false;
    }
}

if (!storageWorks()) {
    class MemoryStorage implements Storage {
        private readonly store = new Map<string, string>();
        get length(): number {
            return this.store.size;
        }
        clear(): void {
            this.store.clear();
        }
        getItem(key: string): string | null {
            return this.store.has(key) ? this.store.get(key)! : null;
        }
        key(index: number): string | null {
            return Array.from(this.store.keys())[index] ?? null;
        }
        removeItem(key: string): void {
            this.store.delete(key);
        }
        setItem(key: string, value: string): void {
            this.store.set(key, String(value));
        }
    }

    for (const prop of ['localStorage', 'sessionStorage'] as const) {
        Object.defineProperty(globalThis, prop, { configurable: true, value: new MemoryStorage() });
    }
}
