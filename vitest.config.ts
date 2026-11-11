import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Testes de funções Convex declaram `// @vitest-environment edge-runtime` no topo do arquivo.
    server: { deps: { inline: ['convex-test'] } },
  },
})
