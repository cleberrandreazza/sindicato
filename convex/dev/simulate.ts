import { ConvexError, v } from 'convex/values'
import { internalAction } from '../_generated/server'
import { allowsMockProviders } from '../providers/appEnv'
import { getPaymentProvider } from '../providers/registry'
import {
  executeMockPaymentSimulation,
  type SimulationOutcome,
  type SimulationResult,
} from './mockSimulation'

/**
 * SIMULAÇÃO DE PAGAMENTO (CLI / painel), ambientes com mocks permitidos.
 *
 * É `internalAction`: não existe para o navegador. Execute pelo painel do Convex ou pela CLI:
 *
 *   npx convex run dev/simulate:simulatePayment '{"operationId":"…","outcome":"approved"}'
 *
 * Recusa rodar fora de `APP_ENV=development|demonstration` ou com provider diferente do mock.
 * Na demonstração hospedada, o navegador usa `public/payments:simulateDemoPayment` (só
 * `APP_ENV=demonstration` + accessToken), que reutiliza o mesmo núcleo.
 *
 * Resultados (`outcome`):
 * - `approved`: recebimento agora (se o prazo já passou, é tardio, como na vida real);
 * - `declined`: cobrança recusada (nenhum recebimento);
 * - `pending`: confirma que segue pendente (nenhuma mudança);
 * - `approved_after_expiry`: recebimento com `occurredAt` depois do prazo → `paid_late` + análise.
 *
 * Repetir com o mesmo `eventId` simula reenvio do provedor; omitir gera um evento novo.
 */

export type { SimulationOutcome, SimulationResult }

export const simulatePayment = internalAction({
  args: {
    operationId: v.id('paymentOperations'),
    outcome: v.union(
      v.literal('approved'),
      v.literal('declined'),
      v.literal('pending'),
      v.literal('approved_after_expiry'),
    ),
    eventId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<SimulationResult> => {
    if (!allowsMockProviders()) {
      throw new ConvexError({ code: 'simulation_disabled' })
    }
    let providerName: string
    try {
      providerName = getPaymentProvider().name
    } catch {
      throw new ConvexError({ code: 'simulation_disabled' })
    }
    if (providerName !== 'mock') throw new ConvexError({ code: 'simulation_disabled' })

    return await executeMockPaymentSimulation(ctx, args)
  },
})
