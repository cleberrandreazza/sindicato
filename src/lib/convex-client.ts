import { ConvexReactClient } from 'convex/react'
import { env } from '@/lib/env'

/**
 * Cliente Convex único da aplicação. Sem `VITE_CONVEX_URL` ele não existe e a aplicação segue
 * sem backend; quem precisar dele deve tratar o `null` (ver `features/identification`).
 */
export const convexClient: ConvexReactClient | null = env.convexUrl
  ? new ConvexReactClient(env.convexUrl)
  : null

/** Lançado quando a aplicação está sem `VITE_CONVEX_URL`; tratado como serviço indisponível. */
export class BackendNotConfiguredError extends Error {
  constructor() {
    super('Backend não configurado.')
    this.name = 'BackendNotConfiguredError'
  }
}
