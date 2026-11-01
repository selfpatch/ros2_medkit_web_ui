import { defineConfig, type Rollup } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const REACT_PACKAGES = /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/;
const NODE_MODULES = /[\\/]node_modules[\\/]/;

// Rollup passes the same meta object for every module of one build.
const eagerModulesByBuild = new WeakMap<Rollup.ManualChunkMeta, Set<string>>();

// Modules the entry reaches through static imports only.
function eagerModules(meta: Rollup.ManualChunkMeta): Set<string> {
    let eager = eagerModulesByBuild.get(meta);
    if (eager) return eager;
    eager = new Set();
    const queue = [...meta.getModuleIds()].filter((id) => meta.getModuleInfo(id)?.isEntry);
    while (queue.length > 0) {
        const id = queue.pop()!;
        if (eager.has(id)) continue;
        eager.add(id);
        queue.push(...(meta.getModuleInfo(id)?.importedIds ?? []));
    }
    eagerModulesByBuild.set(meta, eager);
    return eager;
}

// Splits eager dependencies into react and vendor chunks.
// Dependencies used only behind a dynamic import stay in that lazy chunk.
function manualChunks(id: string, meta: Rollup.ManualChunkMeta): string | undefined {
    if (!NODE_MODULES.test(id) || !eagerModules(meta).has(id)) return undefined;
    return REACT_PACKAGES.test(id) ? 'react' : 'vendor';
}

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        host: true,
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks,
            },
        },
    },
});
