import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function parseSpaceSeparated(value?: string): string[] {
  return (value || '').split(/\s+/).map(h => h.trim()).filter(Boolean);
}

function resolveAllowedHosts(env: Record<string, string | undefined>, serviceKey: string): string[] {
  const shared = parseSpaceSeparated(env.GATEWAY_SHARED_HOSTS);
  const service = parseSpaceSeparated(env[serviceKey]);
  const extra = (env.VITE_ALLOWED_HOSTS || '').split(',').map(h => h.trim()).filter(Boolean);
  return [...new Set([...shared, ...service, ...extra])];
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env } as Record<string, string | undefined>;
  return {
    base: '/app/',
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'prompt',
        injectRegister: 'auto',
        scope: '/app/',
        base: '/app/',
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2}'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        },
        manifest: {
          name: 'DRCAE — Inspecções',
          short_name: 'DRCAE',
          description: 'Aplicação de inspecções e fiscalização para agentes de campo',
          start_url: '/app/',
          scope: '/app/',
          display: 'standalone',
          orientation: 'portrait-primary',
          theme_color: '#1d4ed8',
          background_color: '#0f172a',
          lang: 'pt',
          categories: ['government', 'productivity'],
          icons: [
            {
              src: '/app/img/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: '/app/img/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: '/app/img/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      allowedHosts: resolveAllowedHosts(env, 'GATEWAY_APP_HOSTS'),
    },
  };
});
