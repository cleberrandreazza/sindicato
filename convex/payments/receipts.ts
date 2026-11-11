import type { Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { businessCalendarDate } from '../domain/time'
import {
  formatCentsBRL,
  formatPaidAtBR,
  formatUsageDateBR,
  operationPublicRef,
  paymentMethodLabel,
} from '../receipts/format'
import { buildReceiptPdf } from '../receipts/pdfDocument'
import type { PaymentMethod } from '../domain/statuses'

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

/**
 * Gera o PDF e grava no File Storage se ainda não existir.
 * Idempotente: reprocessamento reutiliza o mesmo `fileStorageId`.
 * Só deve ser chamada para operações `paid` + `confirmed`.
 */
export async function ensureReceiptPdf(
  ctx: MutationCtx,
  receiptId: Id<'receipts'>,
): Promise<Id<'_storage'>> {
  const receipt = await ctx.db.get(receiptId)
  if (!receipt) throw new Error('Comprovante inexistente.')
  if (receipt.fileStorageId) return receipt.fileStorageId

  const operation = await ctx.db.get(receipt.operationId)
  const transaction = await ctx.db.get(receipt.transactionId)
  if (!operation || !transaction) throw new Error('Operação/cobrança do comprovante inexistente.')
  // Definitivo só com utilização liberada. `paid_late` + `confirmed` ocorre após análise
  // administrativa aprovada; `under_review` nunca chega aqui.
  if (
    operation.operationalStatus !== 'confirmed' ||
    (operation.financialStatus !== 'paid' && operation.financialStatus !== 'paid_late')
  ) {
    throw new Error('PDF definitivo só para operação confirmada com recebimento válido.')
  }

  const people = await ctx.db
    .query('operationPeople')
    .withIndex('by_operation', (q) => q.eq('operationId', operation._id))
    .collect()

  const paidAt = operation.paidAt ?? operation.updatedAt
  const bytes = buildReceiptPdf({
    receiptNumber: receipt.receiptNumber,
    operationRef: operationPublicRef(operation._id),
    paidAtLabel: formatPaidAtBR(paidAt),
    usageDateLabel: formatUsageDateBR(operation.usageDate),
    quantity: operation.quantity,
    peopleLines: people.map((person) => `${person.name} (${person.role})`),
    unitAmountLabel: formatCentsBRL(operation.unitAmountCents),
    totalAmountLabel: formatCentsBRL(operation.totalAmountCents),
    paymentMethodLabel: paymentMethodLabel(transaction.method as PaymentMethod),
  })

  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const storageId = await ctx.storage.store(
    new Blob([copy.buffer as ArrayBuffer], { type: 'application/pdf' }),
  )
  await ctx.db.patch(receipt._id, { fileStorageId: storageId })
  return storageId
}
