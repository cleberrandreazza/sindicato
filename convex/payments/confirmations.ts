import type { Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { decideConfirmation } from '../domain/confirmation'
import type { PaymentProviderName, ReviewReason, TransactionStatus } from '../domain/statuses'
import { reacquireClaims } from './claims'
import { recordEvent } from './events'
import { issueReceipt } from './receipts'

export type ConfirmationOutcome =
  | { outcome: 'unknown_transaction' }
  | { outcome: 'ignored'; operationId: Id<'paymentOperations'> }
  | { outcome: 'transaction_updated'; operationId: Id<'paymentOperations'> }
  | { outcome: 'confirmed'; operationId: Id<'paymentOperations'>; receiptId: Id<'receipts'> }
  | {
      outcome: 'under_review'
      operationId: Id<'paymentOperations'>
      reviewId: Id<'paymentReviews'>
      reason: ReviewReason
    }

export interface ConfirmationInput {
  provider: PaymentProviderName
  providerTransactionId: string
  status: TransactionStatus
  amountCents: number
  /** Instante (UTC, ms) em que o provedor diz que o evento ocorreu. */
  occurredAt: number
}

/**
 * Aplica uma notificação de pagamento já autenticada e normalizada
 * (`PaymentProvider.processConfirmation`). A decisão vem de `decideConfirmation` (função pura);
 * aqui ela é executada de forma atômica.
 *
 * NÃO é uma mutation: só é chamada por `providerEvents.ingest`, que antes registra o evento
 * recebido. Assim nenhuma notificação é aplicada sem deixar registro.
 *
 * Só confirma uma operação se encontrar uma transação NOSSA (criada por `createCharge`) que
 * corresponda a `provider` + `providerTransactionId`. Sem ela, retorna `unknown_transaction` e
 * não altera nada: nada é confirmado nem liberado.
 *
 * Idempotência e concorrência: a transação (`paymentTransactions`) é lida e alterada na mesma
 * mutation. Duas notificações simultâneas da mesma cobrança conflitam; a segunda é reexecutada,
 * encontra a transação já `succeeded` e é ignorada.
 */
export async function applyConfirmation(
  ctx: MutationCtx,
  args: ConfirmationInput,
): Promise<ConfirmationOutcome> {
  const transaction = await ctx.db
    .query('paymentTransactions')
    .withIndex('by_provider_transaction', (q) =>
      q.eq('provider', args.provider).eq('providerTransactionId', args.providerTransactionId),
    )
    .unique()
  // O provedor conhece uma cobrança que não temos. `providerEvents.ingest` registra e alerta;
  // não lançamos erro para evitar laço infinito de reenvios.
  if (!transaction) return { outcome: 'unknown_transaction' }

  const operation = await ctx.db.get(transaction.operationId)
  if (!operation) return { outcome: 'unknown_transaction' }

  const now = Date.now()
  const decision = decideConfirmation({
    operation,
    transaction,
    confirmation: {
      status: args.status,
      amountCents: args.amountCents,
      occurredAt: args.occurredAt,
    },
  })

  if (decision.kind === 'ignore') {
    return { outcome: 'ignored', operationId: operation._id }
  }

  if (decision.kind === 'update_transaction') {
    await ctx.db.patch(transaction._id, { status: decision.status, updatedAt: now })
    return { outcome: 'transaction_updated', operationId: operation._id }
  }

  // Há recebimento: registrar a transação como `succeeded` vem antes de qualquer outra coisa.
  await ctx.db.patch(transaction._id, { status: 'succeeded', updatedAt: now })

  let reason: ReviewReason | null = null
  let financialStatus = decision.kind === 'review' ? decision.financialStatus : 'paid'
  let escalate = decision.kind === 'review' ? decision.escalateOperation : false
  const notes: string[] = []

  if (decision.reclaimClaims) {
    const { conflicts } = await reacquireClaims(ctx, operation._id)
    if (conflicts.length > 0) {
      notes.push(`reservas já ocupadas por outra operação: ${conflicts.join(', ')}`)
      if (decision.kind === 'settle') {
        reason = 'claim_conflict'
        financialStatus = 'paid'
        escalate = true
      }
    }
  }

  if (decision.kind === 'review') reason = decision.reason

  if (reason === null) {
    // Recebido no prazo, valor correto, reservas garantidas.
    await ctx.db.patch(operation._id, {
      financialStatus: 'paid',
      operationalStatus: 'confirmed',
      paidAt: args.occurredAt,
      updatedAt: now,
    })
    const receiptId = await issueReceipt(ctx, {
      operationId: operation._id,
      transactionId: transaction._id,
      nowMs: now,
    })
    await recordEvent(ctx, {
      operationId: operation._id,
      type: 'payment_confirmed',
      actor: 'provider',
      financialStatus: 'paid',
      operationalStatus: 'confirmed',
    })
    return { outcome: 'confirmed', operationId: operation._id, receiptId }
  }

  // Análise administrativa: nada é liberado e nenhum reembolso é iniciado.
  const nextFinancial = financialStatus ?? operation.financialStatus
  const nextOperational = escalate ? 'under_review' : operation.operationalStatus
  if (escalate) {
    await ctx.db.patch(operation._id, {
      financialStatus: nextFinancial,
      operationalStatus: 'under_review',
      paidAt: args.occurredAt,
      updatedAt: now,
    })
  }
  const reviewId = await ctx.db.insert('paymentReviews', {
    operationId: operation._id,
    transactionId: transaction._id,
    reason,
    status: 'open',
  })
  await recordEvent(ctx, {
    operationId: operation._id,
    type: 'review_opened',
    actor: 'provider',
    financialStatus: nextFinancial,
    operationalStatus: nextOperational,
    note: [`motivo: ${reason}`, ...notes].join('; '),
  })
  return { outcome: 'under_review', operationId: operation._id, reviewId, reason }
}
