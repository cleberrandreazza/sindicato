import type { Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import type {
  EventActor,
  FinancialStatus,
  OperationEventType,
  OperationalStatus,
} from '../domain/statuses'

/** Registra no histórico (append-only) uma mudança de estado da operação. */
export async function recordEvent(
  ctx: MutationCtx,
  event: {
    operationId: Id<'paymentOperations'>
    type: OperationEventType
    actor: EventActor
    financialStatus: FinancialStatus
    operationalStatus: OperationalStatus
    note?: string
  },
): Promise<void> {
  await ctx.db.insert('operationEvents', event)
}
