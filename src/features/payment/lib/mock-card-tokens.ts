/**
 * Tokens fictícios do PaymentProvider mock. Devem coincidir com
 * `convex/providers/mock/mockPaymentProvider.ts`. NUNCA são dados de cartão: o backend só recebe
 * este texto opaco, e a tela deixa explícito que se trata de simulação.
 */
export const MOCK_CARD_TOKEN_APPROVED = 'tok_mock_approved'
export const MOCK_CARD_TOKEN_DECLINED = 'tok_mock_declined'
export const MOCK_CARD_TOKEN_PENDING = 'tok_mock_pending'
export const MOCK_CARD_TOKEN_UNAVAILABLE = 'tok_mock_unavailable'

export type MockCardScenario = 'approved' | 'declined' | 'pending' | 'unavailable'

export const MOCK_CARD_SCENARIOS: readonly {
  scenario: MockCardScenario
  token: string
  label: string
  description: string
}[] = [
  {
    scenario: 'approved',
    token: MOCK_CARD_TOKEN_APPROVED,
    label: 'Simular cartão aprovado',
    description: 'O mock responde como se o cartão tivesse sido aprovado na hora.',
  },
  {
    scenario: 'declined',
    token: MOCK_CARD_TOKEN_DECLINED,
    label: 'Simular cartão recusado',
    description: 'O mock responde como se o cartão tivesse sido recusado. Nada é cobrado.',
  },
  {
    scenario: 'pending',
    token: MOCK_CARD_TOKEN_PENDING,
    label: 'Simular cartão pendente',
    description: 'O mock deixa a cobrança pendente (como um 3-D Secure).',
  },
  {
    scenario: 'unavailable',
    token: MOCK_CARD_TOKEN_UNAVAILABLE,
    label: 'Simular provedor indisponível',
    description: 'O mock falha como se o provedor estivesse fora do ar.',
  },
]
