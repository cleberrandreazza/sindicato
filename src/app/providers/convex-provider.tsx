import { ConvexProvider, ConvexReactClient } from 'convex/react'
import type { ReactNode } from 'react'
import { env } from '@/lib/env'

// Sem URL configurada o cliente não é criado e a aplicação segue sem backend.
const convexClient = env.convexUrl ? new ConvexReactClient(env.convexUrl) : null

export function AppConvexProvider({ children }: { children: ReactNode }) {
  if (!convexClient) return <>{children}</>
  return <ConvexProvider client={convexClient}>{children}</ConvexProvider>
}
