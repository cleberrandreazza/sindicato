import { describe, expect, it } from 'vitest'

/**
 * Guarda da superfície pública. Funções Convex só são alcançáveis pelo navegador se forem
 * registradas com `query`, `mutation`, `action` ou `httpAction`. A regra do projeto: isso só
 * pode acontecer em `convex/public/`, e a lista de funções públicas é fechada. Quem adicionar
 * uma função pública precisa atualizar este teste, o que força uma revisão de segurança.
 */

const sources = import.meta.glob('../../convex/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const files = Object.entries(sources).filter(([path]) => !path.includes('/_generated/'))

const PUBLIC_REGISTRATION = /export\s+const\s+(\w+)\s*=\s*(query|mutation|action|httpAction)\s*\(/g

function publicFunctions(): { file: string; name: string; kind: string }[] {
  const found: { file: string; name: string; kind: string }[] = []
  for (const [path, source] of files) {
    for (const match of source.matchAll(PUBLIC_REGISTRATION)) {
      found.push({
        file: path.replace('../../convex/', ''),
        name: match[1] ?? '',
        kind: match[2] ?? '',
      })
    }
  }
  return found
}

describe('superfície pública do backend', () => {
  it('há funções para analisar (o glob encontrou os arquivos)', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it('funções públicas existem somente em convex/public/', () => {
    const outside = publicFunctions().filter(({ file }) => !file.startsWith('public/'))
    expect(outside).toEqual([])
  })

  it('a lista de funções públicas é exatamente a esperada', () => {
    const list = publicFunctions()
      .map(({ file, name, kind }) => `${file.replace('.ts', '')}:${name} (${kind})`)
      .sort()
    expect(list).toEqual([
      'public/members:lookup (action)',
      'public/members:validateSelection (query)',
      'public/payments:checkDuplicates (query)',
      'public/payments:createOperation (mutation)',
      'public/payments:getOperation (query)',
      'public/payments:getReceiptDownloadUrl (action)',
      'public/payments:requestReceiptEmail (action)',
      'public/payments:simulateDemoPayment (action)',
      'public/payments:startPayment (action)',
    ])
  })

  it('simulação CLI e confirmação financeira permanecem internal*; demo pública é gated', () => {
    const internalOnly = [
      ['dev/simulate.ts', /export const simulatePayment = internalAction\(/],
      ['payments/webhookProcessor.ts', /export const processNotification = internalAction\(/],
      ['payments/providerEvents.ts', /export const ingest = internalMutation\(/],
      ['payments/charges.ts', /export const begin = internalMutation\(/],
      ['payments/charges.ts', /export const complete = internalMutation\(/],
      ['payments/charges.ts', /export const authorizeDemoSimulation = internalMutation\(/],
    ] as const
    for (const [file, pattern] of internalOnly) {
      const entry = files.find(([path]) => path.endsWith(`/convex/${file}`))
      expect(entry, file).toBeDefined()
      expect(entry?.[1] ?? '', file).toMatch(pattern)
    }
    const demo = files.find(([path]) => path.endsWith('/convex/public/payments.ts'))?.[1] ?? ''
    expect(demo).toMatch(/export const simulateDemoPayment = action\(/)
    expect(demo).toMatch(/isDemonstrationEnv/)
    expect(demo).not.toMatch(/financialStatus:\s*args\./)
    expect(demo).toMatch(/outcome: v\.union\(v\.literal\('approved'\), v\.literal\('declined'\)\)/)
  })

  it('o código de simulação só roda com APP_ENV mock-allowed e provider mock', () => {
    const source = files.find(([path]) => path.endsWith('/convex/dev/simulate.ts'))?.[1] ?? ''
    expect(source).toMatch(/allowsMockProviders/)
    expect(source).toMatch(/providerName !== 'mock'/)
  })

  it('não há rotas HTTP nem webhook público nesta etapa', () => {
    expect(files.some(([path]) => path.endsWith('/http.ts'))).toBe(false)
    expect(files.some(([, source]) => /httpRouter\s*\(/.test(source))).toBe(false)
  })

  it('nenhuma função pública altera estado financeiro/operacional diretamente', () => {
    for (const [path, source] of files) {
      if (!path.includes('/public/')) continue
      expect(source, path).not.toMatch(/ctx\.db\.patch\([^)]*(financialStatus|operationalStatus)/)
      expect(source, path).not.toMatch(/applyConfirmation|providerEvents|reviews\.resolve/)
    }
  })
})
