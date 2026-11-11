import { v } from 'convex/values'
import type { Doc, Id } from '../_generated/dataModel'
import { internalMutation, internalQuery } from '../_generated/server'
import { chargeIdempotencyKey, checkOperationPayable, planCharge } from '../domain/charges'
import { CHARGE_ATTEMPT_STALE_AFTER_MS, MAX_CHARGE_ATTEMPTS_PER_OPERATION } from '../domain/limits'
import { publicError } from '../domain/publicErrors'
import {
  paymentMethod,
  paymentProviderName,
  pixQrCode,
  transactionStatus,
} from '../domain/statuses'
import type { PaymentMethod } from '../domain/statuses'
import { buildStartPaymentResult, type StartPaymentResult } from './chargeView'
import { ingestProviderEvent } from './providerEvents'

/**
 * Etapas INTERNAS da criação de cobrança (`public/payments:startPayment`).
 *
 * A criação é uma action (fala com o provedor) dividida em três passos transacionais:
 *   1. `begin`    valida a operação e REGISTRA a tentativa (`chargeAttempts`) antes de qualquer
 *                 chamada externa; é o ponto de exclusão entre chamadas simultâneas;
 *   2. (action)   chama o provedor com o valor lido da operação e uma chave de idempotência;
 *   3. `complete` grava a transação local e, se o provedor já decidiu (cartão aprovado/recusado),
 *                 entrega o resultado à PORTA ÚNICA de eventos (`ingestProviderEvent`), que
 *                 aplica as regras de prazo, valor e análise. `fail` registra a falha do passo 2.
 *
 * Nada aqui é público. Nenhuma destas funções recebe valor monetário de fora: o valor sempre
 * vem de `paymentOperations.totalAmountCents`.
 */

export type BeginResult =
  | { kind: 'existing'; result: StartPaymentResult }
  | {
      kind: 'create'
      attemptId: Id<'chargeAttempts'>
      idempotencyKey: string
      operationId: Id<'paymentOperations'>
      amountCents: number
      expiresAt: number
      description: string
    }

function describeCharge(operation: Doc<'paymentOperations'>): string {
  const people = operation.quantity === 1 ? '1 pessoa' : `${operation.quantity} pessoas`
  return `Taxa médica das piscinas - ${people} - ${operation.usageDate}`
}

/**
 * Passo 1. Valida e decide (via `planCharge`) se cria, retoma, reaproveita ou recusa.
 *
 * Concorrência: a leitura de `chargeAttempts.by_operation` e de `paymentTransactions.by_operation`
 * entra no conjunto de leitura desta transação. Duas chamadas simultâneas para a mesma operação
 * conflitam: a reexecutada enxerga a tentativa `creating` da primeira e responde
 * `payment_in_progress`, ou a cobrança já criada e a reaproveita. Nunca há duas tentativas
 * ativas para a mesma operação.
 */
export const begin = internalMutation({
  args: {
    operationId: v.id('paymentOperations'),
    /** Hash do `accessToken` apresentado (o token em claro não chega a esta função). */
    accessTokenHash: v.string(),
    method: paymentMethod,
  },
  handler: async (ctx, args): Promise<BeginResult> => {
    const operation = await ctx.db.get(args.operationId)
    // Inexistente e credencial incorreta: mesma resposta.
    if (!operation || operation.accessTokenHash !== args.accessTokenHash) {
      throw publicError('operation_not_found')
    }

    const now = Date.now()
    const people = await ctx.db
      .query('operationPeople')
      .withIndex('by_operation', (q) => q.eq('operationId', operation._id))
      .collect()

    const payable = checkOperationPayable(operation, people.length, now)
    if (!payable.ok) throw publicError(payable.code)

    const attempts = await ctx.db
      .query('chargeAttempts')
      .withIndex('by_operation', (q) => q.eq('operationId', operation._id))
      .collect()
    const transactions = await ctx.db
      .query('paymentTransactions')
      .withIndex('by_operation', (q) => q.eq('operationId', operation._id))
      .collect()

    const plan = planCharge({
      method: args.method,
      attempts,
      transactions,
      nowMs: now,
      staleAfterMs: CHARGE_ATTEMPT_STALE_AFTER_MS,
      maxAttempts: MAX_CHARGE_ATTEMPTS_PER_OPERATION,
    })

    switch (plan.kind) {
      case 'reuse_existing': {
        const live = transactions.find((tx) => tx.status === 'pending' && tx.method === args.method)
        if (!live) throw publicError('payment_in_progress')
        return { kind: 'existing', result: buildStartPaymentResult(operation, live, true, now) }
      }
      case 'conflict':
        throw publicError('payment_method_conflict')
      case 'in_progress':
        throw publicError('payment_in_progress', { retryAfterSeconds: 2 })
      case 'too_many_attempts':
        throw publicError('payment_attempts_exceeded')
      case 'create': {
        const idempotencyKey = chargeIdempotencyKey(operation._id, args.method, plan.attempt)
        let attemptId: Id<'chargeAttempts'>
        const resumed = plan.resume
          ? attempts.find((attempt) => attempt.attempt === plan.attempt)
          : undefined
        if (resumed) {
          attemptId = resumed._id
          await ctx.db.patch(attemptId, { state: 'creating', startedAt: now, errorCode: undefined })
        } else {
          attemptId = await ctx.db.insert('chargeAttempts', {
            operationId: operation._id,
            method: args.method,
            attempt: plan.attempt,
            idempotencyKey,
            state: 'creating',
            startedAt: now,
          })
        }
        return {
          kind: 'create',
          attemptId,
          idempotencyKey,
          operationId: operation._id,
          amountCents: operation.totalAmountCents,
          expiresAt: operation.expiresAt,
          description: describeCharge(operation),
        }
      }
    }
  },
})

/**
 * Passo 3. Grava a transação local e entrega o resultado à porta única de eventos.
 *
 * Idempotente: se a tentativa já foi concluída (uma retomada terminou antes), devolve a mesma
 * cobrança; se o provedor devolveu uma cobrança que já temos (mesma chave de idempotência), não
 * duplica a linha.
 *
 * A transação nasce sempre `pending`. Se o provedor já decidiu (cartão aprovado, recusado...),
 * o resultado entra por `ingestProviderEvent` com `occurredAt = agora`, de modo que um cartão
 * aprovado DEPOIS do prazo vira `paid_late` + análise, nunca liberação automática.
 */
export const complete = internalMutation({
  args: {
    attemptId: v.id('chargeAttempts'),
    provider: paymentProviderName,
    charge: v.object({
      providerTransactionId: v.string(),
      status: transactionStatus,
      amountCents: v.number(),
      pixCopyPasteCode: v.optional(v.string()),
      qrCode: v.optional(pixQrCode),
      chargeExpiresAt: v.optional(v.number()),
      failureReason: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args): Promise<StartPaymentResult> => {
    const attempt = await ctx.db.get(args.attemptId)
    if (!attempt) throw new Error('Tentativa de cobrança inexistente.')
    const operation = await ctx.db.get(attempt.operationId)
    if (!operation) throw new Error('Operação inexistente.')

    const now = Date.now()
    if (attempt.state === 'created' && attempt.transactionId) {
      const done = await ctx.db.get(attempt.transactionId)
      if (done) return buildStartPaymentResult(operation, done, true, now)
    }

    const { charge } = args
    const known = await ctx.db
      .query('paymentTransactions')
      .withIndex('by_provider_transaction', (q) =>
        q.eq('provider', args.provider).eq('providerTransactionId', charge.providerTransactionId),
      )
      .unique()

    const transactionId =
      known?._id ??
      (await ctx.db.insert('paymentTransactions', {
        operationId: operation._id,
        provider: args.provider,
        providerTransactionId: charge.providerTransactionId,
        method: attempt.method,
        amountCents: charge.amountCents,
        status: 'pending',
        updatedAt: now,
        ...(charge.pixCopyPasteCode !== undefined
          ? { pixCopyPasteCode: charge.pixCopyPasteCode }
          : {}),
        ...(charge.qrCode !== undefined ? { qrCode: charge.qrCode } : {}),
        ...(charge.chargeExpiresAt !== undefined
          ? { chargeExpiresAt: charge.chargeExpiresAt }
          : {}),
        ...(charge.failureReason !== undefined ? { failureReason: charge.failureReason } : {}),
      }))

    await ctx.db.patch(attempt._id, { state: 'created', transactionId, errorCode: undefined })

    if (charge.status !== 'pending') {
      await ingestProviderEvent(ctx, {
        provider: args.provider,
        eventId: `created:${charge.providerTransactionId}`,
        providerTransactionId: charge.providerTransactionId,
        status: charge.status,
        amountCents: charge.amountCents,
        occurredAt: now,
      })
    }

    const transaction = await ctx.db.get(transactionId)
    const freshOperation = await ctx.db.get(operation._id)
    if (!transaction || !freshOperation) throw new Error('Registro de cobrança inconsistente.')
    return buildStartPaymentResult(freshOperation, transaction, false, now)
  },
})

/** Passo 2 falhou. A retomada (mesma forma de pagamento) reaproveita a chave de idempotência. */
export const fail = internalMutation({
  args: { attemptId: v.id('chargeAttempts'), errorCode: v.string() },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId)
    if (!attempt || attempt.state !== 'creating') return
    await ctx.db.patch(attempt._id, { state: 'error', errorCode: args.errorCode })
  },
})

export interface ChargeSnapshot {
  transactionId: Id<'paymentTransactions'>
  provider: Doc<'paymentTransactions'>['provider']
  providerTransactionId: string
  method: PaymentMethod
  status: Doc<'paymentTransactions'>['status']
  amountCents: number
  operationExpiresAt: number
}

/**
 * Cobrança alvo de uma simulação de desenvolvimento: a pendente mais recente da operação ou,
 * não havendo, a mais recente. Interna: usada só por `dev/simulate`.
 */
export const latestCharge = internalQuery({
  args: { operationId: v.id('paymentOperations') },
  handler: async (ctx, args): Promise<ChargeSnapshot | null> => {
    const operation = await ctx.db.get(args.operationId)
    if (!operation) return null
    const transactions = await ctx.db
      .query('paymentTransactions')
      .withIndex('by_operation', (q) => q.eq('operationId', operation._id))
      .order('desc')
      .collect()
    const target = transactions.find((tx) => tx.status === 'pending') ?? transactions[0]
    if (!target) return null
    return {
      transactionId: target._id,
      provider: target.provider,
      providerTransactionId: target.providerTransactionId,
      method: target.method,
      status: target.status,
      amountCents: target.amountCents,
      operationExpiresAt: operation.expiresAt,
    }
  },
})
