import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/Neuro-lens-meeting-agent/',
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
});
