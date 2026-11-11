import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useJourney } from '@/app/providers/journey-context'
import { IdentificationPage } from '@/features/identification/components/identification-page'
import { parseReturnReason, type ReturnReason } from '@/features/identification/lib/return-reason'

interface IdentificationSearch {
  /** Por que o associado voltou (ex.: identificação expirada). Só valores conhecidos passam. */
  motivo?: ReturnReason
}

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): IdentificationSearch => {
    const motivo = parseReturnReason(search.motivo)
    return motivo ? { motivo } : {}
  },
  component: IdentificationRoute,
})

function IdentificationRoute() {
  // O router também repassa parâmetros desconhecidos da URL; só motivos conhecidos valem.
  const motivo = parseReturnReason(Route.useSearch().motivo)
  const journey = useJourney()
  const navigate = useNavigate()

  return (
    <IdentificationPage
      returnReason={motivo}
      onContinue={(member) => {
        journey.begin(member)
        void navigate({ to: '/pessoas' })
      }}
    />
  )
}
