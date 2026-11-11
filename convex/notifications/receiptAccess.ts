import { v } from 'convex/values'
import type { Id } from '../_generated/dataModel'
import { internalQuery } from '../_generated/server'

/**
 * Autorização de download/reenvio: mesma credencial da operação (`accessToken` hasheado).
 * Nunca devolve URL aqui — só metadados; a action pública chama `storage.getUrl`.
 */

export type ReceiptAccess =
  | { kind: 'not_found' }
  | { kind: 'unavailable' }
  | { kind: 'not_ready'; receiptId: Id<'receipts'>; receiptNumber: string }
  | {
      kind: 'ready'
      receiptId: Id<'receipts'>
      receiptNumber: string
      storageId: Id<'_storage'>
    }

export const resolveDownload = internalQuery({
  args: {
    operationId: v.id('paymentOperations'),
    accessTokenHash: v.string(),
  },
  handler: async (ctx, args): Promise<ReceiptAccess> => {
    const operation = await ctx.db.get(args.operationId)
    if (!operation || operation.accessTokenHash !== args.accessTokenHash) {
      return { kind: 'not_found' }
    }
    if (operation.operationalStatus !== 'confirmed') {
      return { kind: 'unavailable' }
    }
    if (operation.financialStatus !== 'paid' && operation.financialStatus !== 'paid_late') {
      return { kind: 'unavailable' }
    }

    const receipt = await ctx.db
      .query('receipts')
      .withIndex('by_operation', (q) => q.eq('operationId', operation._id))
      .first()
    if (!receipt) return { kind: 'unavailable' }
    if (!receipt.fileStorageId) {
      return {
        kind: 'not_ready',
        receiptId: receipt._id,
        receiptNumber: receipt.receiptNumber,
      }
    }
    return {
      kind: 'ready',
      receiptId: receipt._id,
      receiptNumber: receipt.receiptNumber,
      storageId: receipt.fileStorageId,
    }
  },
})
