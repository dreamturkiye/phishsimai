import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // ARCH-FIX: Ensure Vite build emits /assets/*.css to fix homepage styled (CSS + assets)
    outDir: 'build',
    assetsDir: 'assets',
  },
});