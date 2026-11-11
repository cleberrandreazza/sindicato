/**
 * Ambientes em que providers **mock** e a simulação interna de pagamento são permitidos.
 *
 * - `development`: máquina local / deployment de desenvolvimento.
 * - `demonstration`: deployment Convex dedicado à demonstração institucional (dados fictícios).
 *
 * Qualquer outro valor (incluindo ausência) **recusa** mocks: produção não cai em simulação
 * por omissão. Funções públicas nunca confirmam pagamento; a simulação continua `internal`.
 */
export const MOCK_ALLOWED_APP_ENVS = ['development', 'demonstration'] as const

export type MockAllowedAppEnv = (typeof MOCK_ALLOWED_APP_ENVS)[number]

export function allowsMockProviders(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const value = env.APP_ENV
  return typeof value === 'string' && (MOCK_ALLOWED_APP_ENVS as readonly string[]).includes(value)
}
