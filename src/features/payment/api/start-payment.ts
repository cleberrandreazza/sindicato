import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import type { PaymentMethod } from '../../../../convex/domain/statuses'
import type { StartPaymentResult } from '../../../../convex/payments/chargeView'
import type { OperationView } from '../../../../convex/public/payments'
import { BackendNotConfiguredError, convexClient } from '@/lib/convex-client'
import { withTimeout } from '@/lib/with-timeout'

/**
 * ÚNICO ponto da feature de pagamento que conhece o Convex. Usa só contratos públicos existentes:
 *
 * - `public/payments:startPayment`: cria (ou reutiliza) a cobrança Pix/cartão; valor e prazo vêm
 *   da operação no servidor.
 * - `public/payments:getOperation`: estado oficial da operação e da cobrança mais recente.
 *
 * O navegador NUNCA confirma pagamento (`paid: true` etc.): isso só entra por notificação
 * autenticada do provedor (no mock, `dev/simulate:simulatePayment`, função interna).
 */

export type { StartPaymentResult, OperationView, PaymentMethod }

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

export type StartPaymentFn = (input: StartPaymentInput) => Promise<StartPaymentResult>
export type GetOperationFn = (input: GetOperationInput) => Promise<OperationView>

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
