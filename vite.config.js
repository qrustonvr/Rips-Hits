import { defineConfig } from 'vite';

// Project page lives at https://qrustonvr.github.io/Rips-Hits/, so the
// production build needs that path as its base. Dev/preview stay at root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Rips-Hits/' : '/',
  // Serve GLSL files as raw strings via ?raw imports (built into Vite).
  build: {
    target: 'es2020',
  },
  server: {
    // --host flag exposes on LAN so you can test on your phone.
    port: 5173,
  },
}));
