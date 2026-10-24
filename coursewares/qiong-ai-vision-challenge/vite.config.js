import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], base: './', cacheDir: '../../output/qiong-vision-vite-cache', build: { outDir: 'static', emptyOutDir: true }, server: { strictPort: true, proxy: { "/api": "http://127.0.0.1:4198" } } });
