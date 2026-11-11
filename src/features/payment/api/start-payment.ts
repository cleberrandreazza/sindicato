import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import type { PaymentMethod } from '../../../../convex/domain/statuses'
import type { StartPaymentResult } from '../../../../convex/payments/chargeView'
import type {
  DemoSimulationOutcome,
  OperationView,
  SimulateDemoPaymentResult,
} from '../../../../convex/public/payments'
import { BackendNotConfiguredError, convexClient } from '@/lib/convex-client'
import { withTimeout } from '@/lib/with-timeout'

/**
 * ÚNICO ponto da feature de pagamento que conhece o Convex. Usa só contratos públicos:
 *
 * - `public/payments:startPayment`: cria (ou reutiliza) a cobrança Pix/cartão.
 * - `public/payments:getOperation`: estado oficial da operação e da cobrança mais recente.
 * - `public/payments:simulateDemoPayment`: só em APP_ENV=demonstration + mock; exige
 *   accessToken e outcome simbólico (nunca status financeiro do cliente).
 *
 * O navegador NUNCA envia `payment_status=paid`. Em produção a simulação pública é recusada.
 */

export type {
  StartPaymentResult,
  OperationView,
  PaymentMethod,
  DemoSimulationOutcome,
  SimulateDemoPaymentResult,
}

export interface StartPaymentInput {
  operationId: Id<'paymentOperations'>
  accessToken: string
  paymentMethod: PaymentMethod
  /** Só cartão: token do SDK do provedor (no mock: `tok_mock_*`). Nunca dados de cartão. */
  paymentMethodToken?: string
}

export interface GetOperationInput {
  operationId: Id<'paymentOperations'>
  accessToken: string
}

export interface SimulateDemoPaymentInput {
  operationId: Id<'paymentOperations'>
  accessToken: string
  outcome: DemoSimulationOutcome
}

export type StartPaymentFn = (input: StartPaymentInput) => Promise<StartPaymentResult>
export type GetOperationFn = (input: GetOperationInput) => Promise<OperationView>
export type SimulateDemoPaymentFn = (
  input: SimulateDemoPaymentInput,
) => Promise<SimulateDemoPaymentResult>

export const PAYMENT_TIMEOUT_MS = 20_000

export const startPayment: StartPaymentFn = (input) => {
  if (!convexClient) return Promise.reject(new BackendNotConfiguredError())
  return withTimeout(
    convexClient.action(api.public.payments.startPayment, {
      operationId: input.operationId,
      accessToken: input.accessToken,
      paymentMethod: input.paymentMethod,
      ...(input.paymentMethodToken !== undefined
        ? { paymentMethodToken: input.paymentMethodToken }
        : {}),
    }),
    PAYMENT_TIMEOUT_MS,
  )
}

export const getOperation: GetOperationFn = (input) => {
  if (!convexClient) return Promise.reject(new BackendNotConfiguredError())
  return withTimeout(
    convexClient.query(api.public.payments.getOperation, input),
    PAYMENT_TIMEOUT_MS,
  )
}

export const simulateDemoPayment: SimulateDemoPaymentFn = (input) => {
  if (!convexClient) return Promise.reject(new BackendNotConfiguredError())
  return withTimeout(
    convexClient.action(api.public.payments.simulateDemoPayment, {
      operationId: input.operationId,
      accessToken: input.accessToken,
      outcome: input.outcome,
    }),
    PAYMENT_TIMEOUT_MS,
  )
}
