import { createFileRoute, Navigate, useNavigate } from '@tanstack/react-router'
import { useJourney } from '@/app/providers/journey-context'
import { UsageDatePage } from '@/features/usage-date/components/usage-date-page'

export const Route = createFileRoute('/data')({
  component: UsageDateRoute,
})

function UsageDateRoute() {
  const journey = useJourney()
  const navigate = useNavigate()

  // Sem identificação em memória (ex.: página recarregada ou aberta direto): volta ao início.
  if (!journey.member) {
    return <Navigate to="/" search={{ motivo: 'identificacao-necessaria' }} replace />
  }
  // Operação já criada: a seleção e a data não mudam mais nesta jornada.
  if (journey.operation) return <Navigate to="/pagamento" replace />
  // Sem pessoas escolhidas não há o que datar: volta à seleção.
  if (journey.selectedLinkIds.length === 0) {
    return <Navigate to="/pessoas" replace />
  }

  return (
    <UsageDatePage
      member={journey.member}
      selectedLinkIds={journey.selectedLinkIds}
      usageDate={journey.usageDate}
      onUsageDateChange={journey.setUsageDate}
      // A seleção de pessoas é preservada ao voltar.
      onBack={() => navigate({ to: '/pessoas' })}
      onContinue={() => navigate({ to: '/resumo' })}
      onSessionExpired={async () => {
        await navigate({ to: '/', search: { motivo: 'sessao-expirada' }, replace: true })
        journey.end()
      }}
    />
  )
}
