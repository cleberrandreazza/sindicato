import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    // Testes de funções Convex declaram `// @vitest-environment edge-runtime` no topo do arquivo;
    // testes de componentes React declaram `// @vitest-environment jsdom`.
    server: { deps: { inline: ['convex-test'] } },
  },
})
