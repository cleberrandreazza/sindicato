import { createFileRoute, Navigate, useNavigate } from '@tanstack/react-router'
import { useJourney } from '@/app/providers/journey-context'
import { SelectionPage } from '@/features/selection/components/selection-page'

export const Route = createFileRoute('/pessoas')({
  component: SelectionRoute,
})

function SelectionRoute() {
  const journey = useJourney()
  const navigate = useNavigate()

  // Sem identificação em memória (ex.: página recarregada ou aberta direto): volta ao início.
  if (!journey.member) {
    return <Navigate to="/" search={{ motivo: 'identificacao-necessaria' }} replace />
  }

  return (
    <SelectionPage
      member={journey.member}
      selectedLinkIds={journey.selectedLinkIds}
      onSelectionChange={journey.setSelectedLinkIds}
      // Primeiro navega, depois encerra: encerrar antes faria esta rota (já sem associado)
      // redirecionar por conta própria, em paralelo.
      onBack={async () => {
        await navigate({ to: '/' })
        journey.end()
      }}
      onSessionExpired={async () => {
        await navigate({ to: '/', search: { motivo: 'sessao-expirada' }, replace: true })
        journey.end()
      }}
    />
  )
}
