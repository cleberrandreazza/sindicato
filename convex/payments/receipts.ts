import type { Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { businessCalendarDate } from '../domain/time'

/** Prefixo provisório da numeração; o formato definitivo depende do sindicato. */
const RECEIPT_PREFIX = 'SC'

function formatReceiptNumber(year: string, sequence: number): string {
  return `${RECEIPT_PREFIX}-${year}-${String(sequence).padStart(6, '0')}`
}

async function nextReceiptNumber(ctx: MutationCtx, nowMs: number): Promise<string> {
  const year = businessCalendarDate(nowMs).slice(0, 4)
  // A leitura do final do índice entra no conjunto de leitura da transação: duas emissões
  // simultâneas conflitam e uma delas é reexecutada, o que impede números repetidos.
  const last = await ctx.db.query('receipts').withIndex('by_receipt_number').order('desc').first()
  const match = last ? /^[A-Z]+-(\d{4})-(\d+)$/.exec(last.receiptNumber) : null
  const sequence = match && match[1] === year ? Number(match[2]) + 1 : 1
  return formatReceiptNumber(year, sequence)
}

/** Emite o comprovante da operação. Idempotente: devolve o existente se já houver um. */
export async function issueReceipt(
  ctx: MutationCtx,
  params: {
    operationId: Id<'paymentOperations'>
    transactionId: Id<'paymentTransactions'>
    nowMs: number
  },
): Promise<Id<'receipts'>> {
  const existing = await ctx.db
    .query('receipts')
    .withIndex('by_operation', (q) => q.eq('operationId', params.operationId))
    .first()
  if (existing) return existing._id

  return await ctx.db.insert('receipts', {
    operationId: params.operationId,
    transactionId: params.transactionId,
    receiptNumber: await nextReceiptNumber(ctx, params.nowMs),
  })
}
