import { api } from '../../../../convex/_generated/api'
import type { LookupResult } from '../../../../convex/public/members'
import { convexClient } from '@/lib/convex-client'
import { withTimeout } from '../lib/with-timeout'

/**
 * ÚNICO ponto da feature que conhece o Convex: chama `public/members:lookup`, o contrato
 * público do backend. Não há dados nem regras de negócio aqui; o resultado (e os erros) são
 * interpretados em `lib/lookup-outcome.ts`.
 */

export type { LookupResult }

export interface LookupInput {
  membershipNumber: string
  /** Apenas dígitos. */
  cpf: string
}

export type LookupFn = (input: LookupInput) => Promise<LookupResult>

/** Lançado quando a aplicação está sem `VITE_CONVEX_URL`; tratado como serviço indisponível. */
export class BackendNotConfiguredError extends Error {
  constructor() {
    super('Backend não configurado.')
    this.name = 'BackendNotConfiguredError'
  }
}

/** Tempo máximo de espera pela consulta antes de oferecer nova tentativa. */
export const LOOKUP_TIMEOUT_MS = 20_000

export const lookupMember: LookupFn = (input) => {
  if (!convexClient) return Promise.reject(new BackendNotConfiguredError())
  return withTimeout(convexClient.action(api.public.members.lookup, input), LOOKUP_TIMEOUT_MS)
}
