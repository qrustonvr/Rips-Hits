import { defineConfig } from 'vite';

export default defineConfig({
  // Serve GLSL files as raw strings via ?raw imports (built into Vite).
  build: {
    target: 'es2020',
  },
  server: {
    // --host flag exposes on LAN so you can test on your phone.
    port: 5173,
  },
});
