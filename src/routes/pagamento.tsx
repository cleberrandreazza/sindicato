import { createFileRoute, Navigate, useNavigate } from '@tanstack/react-router'
import { useJourney } from '@/app/providers/journey-context'
import { PaymentPage } from '@/features/payment/components/payment-page'

export const Route = createFileRoute('/pagamento')({
  component: PaymentRoute,
})

function PaymentRoute() {
  const journey = useJourney()
  const navigate = useNavigate()

  if (!journey.member) {
    return <Navigate to="/" search={{ motivo: 'identificacao-necessaria' }} replace />
  }
  // Sem operação criada não há o que pagar: volta ao resumo (que confere o resto).
  if (!journey.operation) return <Navigate to="/resumo" replace />

  return (
    <PaymentPage
      operation={journey.operation}
      onFinish={async () => {
        await navigate({ to: '/', replace: true })
        journey.end()
      }}
      onSessionExpired={async () => {
        await navigate({ to: '/', search: { motivo: 'sessao-expirada' }, replace: true })
        journey.end()
      }}
      onOutcomeReady={async () => {
        await navigate({ to: '/comprovante', replace: true })
      }}
    />
  )
}
