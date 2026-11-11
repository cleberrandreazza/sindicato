import { createFileRoute, Navigate, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { useJourney } from '@/app/providers/journey-context'
import { JourneyLayout } from '@/components/layout/journey-layout'
import { Button } from '@/components/ui/button'
import { getOperation, type OperationView } from '@/features/receipt/api/receipt'
import { LatePaymentPage } from '@/features/receipt/components/late-payment-page'
import { ReceiptSuccessPage } from '@/features/receipt/components/receipt-success-page'

export const Route = createFileRoute('/comprovante')({
  component: ReceiptRoute,
})

function ReceiptRoute() {
  const journey = useJourney()
  const navigate = useNavigate()
  const [view, setView] = useState<OperationView | null>(null)
  const [loading, setLoading] = useState(true)

  const finish = useCallback(async () => {
    await navigate({ to: '/', replace: true })
    journey.end()
  }, [journey, navigate])

  const sessionExpired = useCallback(async () => {
    await navigate({ to: '/', search: { motivo: 'sessao-expirada' }, replace: true })
    journey.end()
  }, [journey, navigate])

  const refresh = useCallback(async () => {
    if (!journey.operation) return
    try {
      const next = await getOperation({
        operationId: journey.operation.operationId,
        accessToken: journey.operation.accessToken,
      })
      setView(next)
    } catch {
      await sessionExpired()
    } finally {
      setLoading(false)
    }
  }, [journey.operation, sessionExpired])

  useEffect(() => {
    const id = window.setTimeout(() => {
      void refresh()
    }, 0)
    return () => window.clearTimeout(id)
  }, [refresh])

  if (!journey.member) {
    return <Navigate to="/" search={{ motivo: 'identificacao-necessaria' }} replace />
  }
  if (!journey.operation) return <Navigate to="/pagamento" replace />

  if (loading && !view) {
    return (
      <JourneyLayout eyebrow="Etapa 6" title="Consultando sua operação…" description="">
        <p className="text-muted-foreground">Aguarde um instante.</p>
      </JourneyLayout>
    )
  }

  if (view?.operationalStatus === 'under_review') {
    return (
      <LatePaymentPage
        operation={journey.operation}
        message={view.presentation.message}
        onFinish={finish}
        onRefresh={refresh}
      />
    )
  }

  if (view?.operationalStatus === 'confirmed') {
    return (
      <ReceiptSuccessPage
        operation={journey.operation}
        onFinish={finish}
        onSessionExpired={sessionExpired}
      />
    )
  }

  return (
    <JourneyLayout
      eyebrow="Etapa 6"
      title="Ainda não há comprovante"
      description="A operação ainda não está confirmada. Volte ao pagamento para acompanhar."
    >
      <Button
        type="button"
        size="xl"
        className="w-full"
        onClick={() => void navigate({ to: '/pagamento' })}
      >
        Voltar ao pagamento
      </Button>
      <Button
        type="button"
        variant="outline"
        size="xl"
        className="mt-3 w-full"
        onClick={() => void finish()}
      >
        Voltar ao início
      </Button>
    </JourneyLayout>
  )
}
