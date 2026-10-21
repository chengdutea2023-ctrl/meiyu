import { build } from 'vite';
import { rm } from 'node:fs/promises';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await rm(resolve(root, 'static/app'), { recursive: true, force: true });
await build({ configFile: false, root: resolve(root, 'client'), base: './', plugins: [react()], build: { outDir: resolve(root, 'static'), emptyOutDir: false, assetsDir: 'app', sourcemap: false, chunkSizeWarningLimit: 1200 } });
