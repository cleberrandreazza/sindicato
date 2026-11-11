import type { Id } from '../../../../convex/_generated/dataModel'

/**
 * A operação que o BACKEND criou (ou recuperou). Valores e prazo são os oficiais devolvidos por
 * `public/payments:createOperation`; o navegador não calcula nada disto. Vive só em memória
 * (`JourneyProvider`): o `accessToken` é a credencial da operação e nunca vai para armazenamento
 * do navegador nem para a URL.
 */
export interface CreatedOperation {
  operationId: Id<'paymentOperations'>
  /** Credencial para consultar e pagar ESTA operação (`getOperation`, `startPayment`). */
  accessToken: string
  /** Data de calendário `YYYY-MM-DD`. */
  usageDate: string
  quantity: number
  unitAmountCents: number
  totalAmountCents: number
  /** Instante oficial (UTC, ms) em que o prazo de pagamento termina; calculado no backend. */
  expiresAt: number
  people: { name: string; role: string }[]
  /** `true` quando a operação já existia e foi recuperada pela mesma solicitação. */
  recovered: boolean
}

/**
 * A tentativa lógica de confirmação em andamento. O `requestId` (UUID) fica em memória e é
 * reutilizado, sem trocar, enquanto o resultado da criação for desconhecido (timeout, queda de
 * conexão). Só vale para os mesmos dados: outra data ou outras pessoas são outra tentativa.
 */
export interface ConfirmationRequest {
  requestId: string
  usageDate: string
  linkIds: readonly Id<'householdLinks'>[]
}

export function isSameRequest(
  request: ConfirmationRequest | null,
  usageDate: string,
  linkIds: readonly Id<'householdLinks'>[],
): request is ConfirmationRequest {
  if (!request || request.usageDate !== usageDate) return false
  const current = new Set<string>(request.linkIds)
  return current.size === linkIds.length && linkIds.every((linkId) => current.has(linkId))
}
