import { createFileRoute } from '@tanstack/react-router'
import { IdentificationPage } from '@/features/identification/components/identification-page'

export const Route = createFileRoute('/')({
  component: IdentificationRoute,
})

function IdentificationRoute() {
  return <IdentificationPage />
}
