import { v } from 'convex/values'
import { internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from '../_generated/server'
import { LATE_PAYMENT_MESSAGE } from '../domain/messages'
import { maskEmail, maskPhone } from '../domain/privacy'
import { formatCentsBRL, formatPaidAtBR, formatUsageDateBR } from '../receipts/format'
import { ensureReceiptPdf } from '../payments/receipts'
import { getProviders } from '../providers/registry'
import { ProviderError } from '../providers/errors'

/**
 * Pós-confirmação: PDF + outbox de e-mail + registro WhatsApp `not_configured`.
 * Agendado após `applyConfirmation` / aprovação de análise. Nunca altera estado financeiro.
 */

async function latestNotification(
  ctx: MutationCtx,
  operationId: Id<'paymentOperations'>,
  kind: 'receipt' | 'payment_under_review',
  channel: 'email' | 'whatsapp',
) {
  const rows = await ctx.db
    .query('notifications')
    .withIndex('by_operation', (q) => q.eq('operationId', operationId))
    .collect()
  return rows
    .filter((row) => row.kind === kind && row.channel === channel)
    .sort((a, b) => b._creationTime - a._creationTime)[0]
}

async function insertWhatsAppNotConfigured(
  ctx: MutationCtx,
  params: {
    operationId: Id<'paymentOperations'>
    kind: 'receipt' | 'payment_under_review'
    receiptId?: Id<'receipts'>
    phone?: string
  },
) {
  const existing = await latestNotification(ctx, params.operationId, params.kind, 'whatsapp')
  if (existing && existing.status === 'not_configured') return existing._id
  return await ctx.db.insert('notifications', {
    operationId: params.operationId,
    kind: params.kind,
    ...(params.receiptId !== undefined ? { receiptId: params.receiptId } : {}),
    channel: 'whatsapp',
    recipientMasked: params.phone ? maskPhone(params.phone) : '********',
    status: 'not_configured',
    failureReason: 'Provedor de WhatsApp ainda nao configurado pelo sindicato.',
  })
}

/** Agenda PDF + e-mail do comprovante (e marca WhatsApp como não configurado). */
export const afterConfirmed = internalMutation({
  args: {
    operationId: v.id('paymentOperations'),
    receiptId: v.id('receipts'),
  },
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId)
    const receipt = await ctx.db.get(args.receiptId)
    if (!operation || !receipt) return
    if (
      operation.operationalStatus !== 'confirmed' ||
      (operation.financialStatus !== 'paid' && operation.financialStatus !== 'paid_late')
    ) {
      return
    }

    await ensureReceiptPdf(ctx, args.receiptId)

    const member = await ctx.db.get(operation.memberId)
    await insertWhatsAppNotConfigured(ctx, {
      operationId: args.operationId,
      kind: 'receipt',
      receiptId: args.receiptId,
      phone: member?.phone,
    })

    const existingEmail = await latestNotification(ctx, args.operationId, 'receipt', 'email')
    if (existingEmail?.status === 'sent' || existingEmail?.status === 'pending') {
      return
    }

    const notificationId = await ctx.db.insert('notifications', {
      operationId: args.operationId,
      kind: 'receipt',
      receiptId: args.receiptId,
      channel: 'email',
      recipientMasked: member?.email ? maskEmail(member.email) : '***@***',
      status: 'pending',
    })

    await ctx.scheduler.runAfter(0, internal.notifications.outbox.deliverReceiptEmail, {
      notificationId,
    })
  },
})

/** Atualização de pagamento em análise: e-mail (mock) + WhatsApp não configurado. Sem PDF. */
export const afterUnderReview = internalMutation({
  args: {
    operationId: v.id('paymentOperations'),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId)
    if (!operation || operation.operationalStatus !== 'under_review') return

    const member = await ctx.db.get(operation.memberId)
    await insertWhatsAppNotConfigured(ctx, {
      operationId: args.operationId,
      kind: 'payment_under_review',
      phone: member?.phone,
    })

    const existingEmail = await latestNotification(
      ctx,
      args.operationId,
      'payment_under_review',
      'email',
    )
    if (existingEmail?.status === 'sent' || existingEmail?.status === 'pending') return

    const notificationId = await ctx.db.insert('notifications', {
      operationId: args.operationId,
      kind: 'payment_under_review',
      channel: 'email',
      recipientMasked: member?.email ? maskEmail(member.email) : '***@***',
      status: 'pending',
    })

    await ctx.scheduler.runAfter(0, internal.notifications.outbox.deliverUnderReviewEmail, {
      notificationId,
    })
  },
})

function sanitizeFailure(error: unknown): string {
  if (error instanceof ProviderError) {
    if (error.code === 'configuration') return 'Provedor de e-mail nao configurado.'
    if (error.code === 'invalid_request') return 'Destinatario invalido.'
    return 'Falha temporaria no envio de e-mail.'
  }
  return 'Falha temporaria no envio de e-mail.'
}

export const deliverReceiptEmail = internalAction({
  args: { notificationId: v.id('notifications') },
  handler: async (ctx, args) => {
    const payload = await ctx.runQuery(internal.notifications.outbox.loadReceiptDelivery, {
      notificationId: args.notificationId,
    })
    if (!payload) return
    if (payload.status !== 'pending') return

    try {
      if (!payload.email) {
        throw new ProviderError('invalid_request', 'Associado sem e-mail cadastrado.')
      }
      const providers = getProviders()
      const result = await providers.notifications.sendReceiptEmail({
        to: payload.email,
        content: {
          receiptNumber: payload.receiptNumber,
          memberName: payload.memberName,
          usageDate: payload.usageDate,
          peopleNames: payload.peopleNames,
          totalAmountCents: payload.totalAmountCents,
          paidAt: payload.paidAt,
          ...(payload.receiptUrl ? { receiptUrl: payload.receiptUrl } : {}),
        },
      })
      await ctx.runMutation(internal.notifications.outbox.markSent, {
        notificationId: args.notificationId,
        providerMessageId: result.providerMessageId,
      })
    } catch (error) {
      await ctx.runMutation(internal.notifications.outbox.markFailed, {
        notificationId: args.notificationId,
        failureReason: sanitizeFailure(error),
      })
    }
  },
})

export const deliverUnderReviewEmail = internalAction({
  args: { notificationId: v.id('notifications') },
  handler: async (ctx, args) => {
    const payload = await ctx.runQuery(internal.notifications.outbox.loadUnderReviewDelivery, {
      notificationId: args.notificationId,
    })
    if (!payload || payload.status !== 'pending') return

    try {
      if (!payload.email) {
        throw new ProviderError('invalid_request', 'Associado sem e-mail cadastrado.')
      }
      const providers = getProviders()
      await providers.notifications.sendPaymentUpdateEmail({
        to: payload.email,
        content: {
          memberName: payload.memberName,
          usageDate: payload.usageDate,
          message: payload.message,
        },
      })
      await ctx.runMutation(internal.notifications.outbox.markSent, {
        notificationId: args.notificationId,
        providerMessageId: `update_${args.notificationId}`,
      })
    } catch (error) {
      await ctx.runMutation(internal.notifications.outbox.markFailed, {
        notificationId: args.notificationId,
        failureReason: sanitizeFailure(error),
      })
    }
  },
})

export const loadReceiptDelivery = internalQuery({
  args: { notificationId: v.id('notifications') },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId)
    if (!notification || notification.kind !== 'receipt' || !notification.receiptId) return null
    const operation = await ctx.db.get(notification.operationId)
    const receipt = await ctx.db.get(notification.receiptId)
    if (!operation || !receipt) return null
    const member = await ctx.db.get(operation.memberId)
    const people = await ctx.db
      .query('operationPeople')
      .withIndex('by_operation', (q) => q.eq('operationId', operation._id))
      .collect()
    const holder = people.find((p) => p.role === 'holder')
    let receiptUrl: string | undefined
    if (receipt.fileStorageId) {
      receiptUrl = (await ctx.storage.getUrl(receipt.fileStorageId)) ?? undefined
    }
    return {
      status: notification.status,
      email: member?.email,
      receiptNumber: receipt.receiptNumber,
      memberName: holder?.name ?? 'Associado',
      usageDate: operation.usageDate,
      peopleNames: people.map((p) => p.name),
      totalAmountCents: operation.totalAmountCents,
      paidAt: operation.paidAt ?? operation.updatedAt,
      receiptUrl,
      // só para logs internos de teste — valores formatados não vão ao provedor além do contrato
      summary: {
        totalLabel: formatCentsBRL(operation.totalAmountCents),
        usageLabel: formatUsageDateBR(operation.usageDate),
        paidLabel: formatPaidAtBR(operation.paidAt ?? operation.updatedAt),
      },
    }
  },
})

export const loadUnderReviewDelivery = internalQuery({
  args: { notificationId: v.id('notifications') },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId)
    if (!notification || notification.kind !== 'payment_under_review') return null
    const operation = await ctx.db.get(notification.operationId)
    if (!operation) return null
    const member = await ctx.db.get(operation.memberId)
    const people = await ctx.db
      .query('operationPeople')
      .withIndex('by_operation', (q) => q.eq('operationId', operation._id))
      .collect()
    const holder = people.find((p) => p.role === 'holder')
    return {
      status: notification.status,
      email: member?.email,
      memberName: holder?.name ?? 'Associado',
      usageDate: operation.usageDate,
      message: LATE_PAYMENT_MESSAGE,
    }
  },
})

export const markSent = internalMutation({
  args: {
    notificationId: v.id('notifications'),
    providerMessageId: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.notificationId)
    if (!row || row.status === 'sent') return
    await ctx.db.patch(args.notificationId, {
      status: 'sent',
      providerMessageId: args.providerMessageId,
      sentAt: Date.now(),
      failureReason: undefined,
    })
  },
})

export const markFailed = internalMutation({
  args: {
    notificationId: v.id('notifications'),
    failureReason: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.notificationId)
    if (!row || row.status === 'sent') return
    await ctx.db.patch(args.notificationId, {
      status: 'failed',
      failureReason: args.failureReason,
    })
  },
})

/** Nova tentativa controlada de e-mail do comprovante (não reemite PDF). */
export const enqueueReceiptEmailRetry = internalMutation({
  args: {
    operationId: v.id('paymentOperations'),
    receiptId: v.id('receipts'),
  },
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId)
    if (!operation || operation.operationalStatus !== 'confirmed') return { queued: false as const }
    const existing = await latestNotification(ctx, args.operationId, 'receipt', 'email')
    if (existing?.status === 'sent' || existing?.status === 'pending') {
      return { queued: false as const, status: existing.status as 'sent' | 'pending' }
    }
    const member = await ctx.db.get(operation.memberId)
    const notificationId = await ctx.db.insert('notifications', {
      operationId: args.operationId,
      kind: 'receipt',
      receiptId: args.receiptId,
      channel: 'email',
      recipientMasked: member?.email ? maskEmail(member.email) : '***@***',
      status: 'pending',
    })
    await ctx.scheduler.runAfter(0, internal.notifications.outbox.deliverReceiptEmail, {
      notificationId,
    })
    return { queued: true as const, status: 'pending' as const }
  },
})
