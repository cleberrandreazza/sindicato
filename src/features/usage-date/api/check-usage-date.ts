import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import type { CheckDuplicatesResult } from '../../../../convex/public/payments'
import { BackendNotConfiguredError, convexClient } from '@/lib/convex-client'
import { withTimeout } from '@/lib/with-timeout'

/**
 * ÚNICO ponto da feature que conhece o Convex. Usa o contrato público que já existe,
 * `public/payments:checkDuplicates`: no servidor ele valida a data (formato e "não passada"),
 * revalida a seleção de pessoas e informa quais delas já têm operação incompatível na data.
 * Não existe função pública só para a data, e nenhuma foi criada.
 */

export type { CheckDuplicatesResult }

export interface CheckUsageDateInput {
  memberId: Id<'members'>
  /** Prova de identificação emitida pelo `lookup` (só em memória). */
  identificationToken: string
  /** Vínculos escolhidos na etapa anterior. */
  linkIds: Id<'householdLinks'>[]
  /** Data de calendário `YYYY-MM-DD`, exatamente como o associado a escolheu. */
  usageDate: string
}

export type CheckUsageDateFn = (input: CheckUsageDateInput) => Promise<CheckDuplicatesResult>

/** Tempo máximo de espera antes de oferecer nova tentativa. */
export const CHECK_USAGE_DATE_TIMEOUT_MS = 20_000

export const checkUsageDate: CheckUsageDateFn = (input) => {
  if (!convexClient) return Promise.reject(new BackendNotConfiguredError())
  return withTimeout(
    convexClient.query(api.public.payments.checkDuplicates, input),
    CHECK_USAGE_DATE_TIMEOUT_MS,
  )
}
