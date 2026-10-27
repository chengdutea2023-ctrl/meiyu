import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default defineConfig({
  plugins: [react()],
  // Shared courseware code must resolve the web app's declared dependency even
  // when npm installs it inside this workspace instead of hoisting it.
  resolve: { alias: [{ find: /^fflate$/, replacement: require.resolve('fflate/browser') }] },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
