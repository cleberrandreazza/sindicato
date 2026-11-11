import type { ReactNode } from 'react'
import { AppConvexProvider } from './convex-provider'

export function AppProviders({ children }: { children: ReactNode }) {
  return <AppConvexProvider>{children}</AppConvexProvider>
}
