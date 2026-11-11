import { createFileRoute, Navigate, useNavigate } from '@tanstack/react-router'
import { useJourney } from '@/app/providers/journey-context'
import { SummaryPage } from '@/features/summary/components/summary-page'

export const Route = createFileRoute('/resumo')({
  component: SummaryRoute,
})

function SummaryRoute() {
  const journey = useJourney()
  const navigate = useNavigate()

  // Cada guarda leva ao passo que falta. Nada disso é a validação oficial: o backend revalida
  // tudo ao criar a operação.
  if (!journey.member) {
    return <Navigate to="/" search={{ motivo: 'identificacao-necessaria' }} replace />
  }
  // Operação já criada: não se cria outra pela mesma jornada.
  if (journey.operation) return <Navigate to="/pagamento" replace />
  if (journey.selectedLinkIds.length === 0) return <Navigate to="/pessoas" replace />
  if (journey.usageDate === null) return <Navigate to="/data" replace />

  return (
    <SummaryPage
      member={journey.member}
      selectedLinkIds={journey.selectedLinkIds}
      usageDate={journey.usageDate}
      request={journey.confirmRequest}
      onRequestChange={journey.setConfirmRequest}
      onCreated={async (operation) => {
        journey.setOperation(operation)
        await navigate({ to: '/pagamento' })
      }}
      onBack={() => navigate({ to: '/data' })}
      onReviewPeople={() => navigate({ to: '/pessoas' })}
      onChangeDate={() => navigate({ to: '/data' })}
      onSessionExpired={async () => {
        await navigate({ to: '/', search: { motivo: 'sessao-expirada' }, replace: true })
        journey.end()
      }}
    />
  )
}
