import { defineConfig, type UserConfig } from 'vite';
import type { InlineConfig } from 'vitest/node';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

interface VitestConfigExport extends UserConfig {
  test?: InlineConfig;
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Self-hosted font files must be precached too, or the offline app falls back to system fonts
      workbox: { globPatterns: ['**/*.{js,css,html,woff2}'], maximumFileSizeToCacheInBytes: 4 * 1024 * 1024 },
      manifest: {
        name: 'Violin Coach PWA',
        short_name: 'ViolinCoach',
        display: 'standalone',
        background_color: '#f2f3ee',
        theme_color: '#f2f3ee',
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
  },
} as VitestConfigExport);

