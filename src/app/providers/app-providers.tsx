import type { ReactNode } from 'react'
import { AppConvexProvider } from './convex-provider'
import { JourneyProvider } from './journey-provider'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AppConvexProvider>
      <JourneyProvider>{children}</JourneyProvider>
    </AppConvexProvider>
  )
}
