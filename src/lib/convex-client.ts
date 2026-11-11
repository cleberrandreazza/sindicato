import { ConvexReactClient } from 'convex/react'
import { env } from '@/lib/env'

/**
 * Cliente Convex único da aplicação. Sem `VITE_CONVEX_URL` ele não existe e a aplicação segue
 * sem backend; quem precisar dele deve tratar o `null` (ver `features/identification`).
 */
export const convexClient: ConvexReactClient | null = env.convexUrl
  ? new ConvexReactClient(env.convexUrl)
  : null
