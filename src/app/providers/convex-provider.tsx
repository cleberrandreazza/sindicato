import { ConvexProvider } from 'convex/react'
import type { ReactNode } from 'react'
import { convexClient } from '@/lib/convex-client'

export function AppConvexProvider({ children }: { children: ReactNode }) {
  if (!convexClient) return <>{children}</>
  return <ConvexProvider client={convexClient}>{children}</ConvexProvider>
}
