import { defineConfig } from 'vitest/config';

// Configuração própria, separada do `vite.config.ts`: os testes cobrem lógica
// pura de `src/lib` e não precisam do plugin PWA, do Tailwind nem do carregamento
// de envs que o build de produção faz.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
