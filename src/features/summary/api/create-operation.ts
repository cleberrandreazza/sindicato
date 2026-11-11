import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import type { CreateOperationResult, OperationView } from '../../../../convex/public/payments'
import { BackendNotConfiguredError, convexClient } from '@/lib/convex-client'
import { withTimeout } from '@/lib/with-timeout'

/**
 * ÚNICO ponto da feature que conhece o Convex. Usa só contratos públicos que já existem:
 *
 * - `public/payments:createOperation`: autoridade final. Revalida prova de identificação,
 *   titular, seleção, data e duplicidade, calcula valores e prazo e cria a operação. O `requestId`
 *   torna a repetição segura (devolve a operação original).
 * - `public/payments:getOperation`: estado oficial de uma operação já criada.
 *
 * O navegador nunca envia valores nem prazo.
 */

export type { CreateOperationResult, OperationView }

export interface CreateOperationInput {
  memberId: Id<'members'>
  /** Prova de identificação emitida pelo `lookup` (só em memória). */
  identificationToken: string
  linkIds: Id<'householdLinks'>[]
  /** Data de calendário `YYYY-MM-DD`, como escolhida. */
  usageDate: string
  /** UUID desta tentativa lógica; o mesmo valor em toda repetição dela. */
  requestId: string
}

export interface GetOperationInput {
  operationId: Id<'paymentOperations'>
  accessToken: string
}

export type CreateOperationFn = (input: CreateOperationInput) => Promise<CreateOperationResult>
export type GetOperationFn = (input: GetOperationInput) => Promise<OperationView>

/**
 * Tempo máximo de espera. Ao estourar, o RESULTADO É DESCONHECIDO (a mutation pode ter rodado):
 * a tela repete a MESMA solicitação, com o mesmo `requestId`, em vez de afirmar que falhou.
 */
export const CREATE_OPERATION_TIMEOUT_MS = 20_000

export const createOperation: CreateOperationFn = (input) => {
  if (!convexClient) return Promise.reject(new BackendNotConfiguredError())
  return withTimeout(
    convexClient.mutation(api.public.payments.createOperation, input),
    CREATE_OPERATION_TIMEOUT_MS,
  )
}

export const getOperation: GetOperationFn = (input) => {
  if (!convexClient) return Promise.reject(new BackendNotConfiguredError())
  return withTimeout(
    convexClient.query(api.public.payments.getOperation, input),
    CREATE_OPERATION_TIMEOUT_MS,
  )
}
