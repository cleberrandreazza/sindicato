import { createFileRoute, Navigate, useNavigate } from '@tanstack/react-router'
import { useJourney } from '@/app/providers/journey-context'
import { PaymentPendingPage } from '@/features/payment/components/payment-pending-page'

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
    <PaymentPendingPage
      operation={journey.operation}
      // Primeiro navega, depois encerra: encerrar antes faria esta rota redirecionar sozinha.
      onFinish={async () => {
        await navigate({ to: '/', replace: true })
        journey.end()
      }}
    />
  )
}
