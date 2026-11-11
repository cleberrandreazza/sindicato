import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import type { ValidateSelectionResult } from '../../../../convex/public/members'
import { BackendNotConfiguredError, convexClient } from '@/lib/convex-client'
import { withTimeout } from '@/lib/with-timeout'

/**
 * ÚNICO ponto da feature que conhece o Convex: chama `public/members:validateSelection`, o
 * contrato público que confere, no servidor, se as pessoas escolhidas podem ser selecionadas.
 */

export type { ValidateSelectionResult }

export interface ValidateSelectionInput {
  memberId: Id<'members'>
  /** Prova de identificação emitida pelo `lookup` (só em memória). */
  identificationToken: string
  /** Vínculos escolhidos. O navegador nunca envia nomes, papéis nem valores. */
  linkIds: Id<'householdLinks'>[]
}

export type ValidateSelectionFn = (
  input: ValidateSelectionInput,
) => Promise<ValidateSelectionResult>

/** Tempo máximo de espera pela validação antes de oferecer nova tentativa. */
export const VALIDATE_SELECTION_TIMEOUT_MS = 20_000

export const validateSelection: ValidateSelectionFn = (input) => {
  if (!convexClient) return Promise.reject(new BackendNotConfiguredError())
  return withTimeout(
    convexClient.query(api.public.members.validateSelection, input),
    VALIDATE_SELECTION_TIMEOUT_MS,
  )
}
