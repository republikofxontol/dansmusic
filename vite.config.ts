import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR IS DISABLED IN AI STUDIO VIA DISABLE_HMR ENV VAR.
      // DO NOT MODIFYÂFILE WATCHING IS DISABLED TO PREVENT FLICKERING DURING AGENT EDITS.
      hmr: process.env.DISABLE_HMR !== 'true',
      // DISABLE FILE WATCHING WHEN DISABLE_HMR IS TRUE TO SAVE CPU DURING AGENT EDITS.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
