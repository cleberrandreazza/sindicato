import { useState } from 'react'
import { JourneyLayout } from '@/components/layout/journey-layout'
import { Button } from '@/components/ui/button'
import { formatBRL, peopleLabel } from '@/features/selection/lib/summary'
import type { CreatedOperation } from '@/features/summary/lib/created-operation'
import { formatUsageDate, formatUsageDateBR } from '@/features/usage-date/lib/usage-date'
import type { GetOperationFn, StartPaymentFn } from '../api/start-payment'
import { usePayment } from '../hooks/use-payment'
import type { MockCardScenario } from '../lib/mock-card-tokens'
import { CardPanel } from './card-panel'
import { DeadlineBanner } from './deadline-banner'
import { MethodPicker } from './method-picker'
import { PaymentStatus } from './payment-status'
import { PixPanel } from './pix-panel'
import { SimulationBanner } from './simulation-banner'

interface PaymentPageProps {
  operation: CreatedOperation
  onFinish: () => void | Promise<void>
  /** Credencial inválida / operação inacessível: pedir nova identificação. */
  onSessionExpired?: () => void | Promise<void>
  start?: StartPaymentFn
  getState?: GetOperationFn
  nowMs?: () => number
  pollIntervalMs?: number
  /** Substitui a cópia do Pix (testes). */
  copyText?: (value: string) => Promise<void>
}

/** Quinta etapa: checkout Pix/cartão com PaymentProvider mockado. */
export function PaymentPage({
  operation,
  onFinish,
  onSessionExpired,
  start,
  getState,
  nowMs,
  pollIntervalMs,
  copyText,
}: PaymentPageProps) {
  const [choosingCard, setChoosingCard] = useState(false)
  const payment = usePayment({
    operationId: operation.operationId,
    accessToken: operation.accessToken,
    initialExpiresAt: operation.expiresAt,
    start,
    getState,
    pollIntervalMs,
    onGone: onSessionExpired ?? onFinish,
  })

  const startingMethod = payment.state.status === 'starting' ? payment.state.method : null
  const busy = payment.state.status === 'starting' || payment.state.status === 'refreshing'
  const active = payment.state.status === 'active' ? payment.state.active : null
  const canChoose =
    !active &&
    (payment.state.status === 'idle' ||
      payment.state.status === 'starting' ||
      payment.state.status === 'rejected' ||
      payment.state.status === 'unavailable' ||
      (payment.state.status === 'refreshing' && payment.state.active === null))

  function handleSimulateCard(_scenario: MockCardScenario, token: string) {
    void payment.begin('card', token)
  }

  function backToMethods() {
    payment.resetToIdle()
    setChoosingCard(false)
  }

  return (
    <JourneyLayout
      eyebrow="Etapa 5 · Pagamento"
      title="Finalize seu pagamento"
      description="Escolha uma forma de pagamento para concluir sua operação."
    >
      <div className="flex flex-col gap-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <SimulationBanner />

        <DeadlineBanner
          expiresAt={payment.expiresAt}
          nowMs={nowMs}
          onExpired={() => void payment.refresh()}
        />

        <section
          aria-labelledby="payment-summary"
          className="rounded-2xl border bg-card p-4"
          data-testid="payment-summary"
        >
          <h2 id="payment-summary" className="sr-only">
            Resumo da operação
          </h2>
          <dl className="flex flex-col gap-3 text-base">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Valor total</dt>
              <dd className="text-2xl font-bold text-primary">
                {formatBRL(operation.totalAmountCents)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Data de utilização</dt>
              <dd className="text-right font-semibold">
                {formatUsageDateBR(operation.usageDate)}
                <span className="block text-sm font-normal text-muted-foreground">
                  {formatUsageDate(operation.usageDate)}
                </span>
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Pessoas</dt>
              <dd className="font-semibold">{peopleLabel(operation.quantity)}</dd>
            </div>
          </dl>
        </section>

        <PaymentStatus
          state={payment.state}
          onRetry={() => void payment.refresh()}
          onChooseAgain={backToMethods}
          onRefresh={() => void payment.refresh()}
        />

        {active?.payment.method === 'pix' ? (
          <PixPanel
            payment={active.payment}
            refreshing={payment.state.status === 'refreshing'}
            onRefresh={() => void payment.refresh()}
            copyText={copyText}
          />
        ) : null}

        {active?.payment.method === 'card' && active.payment.status === 'pending' ? (
          <p className="text-base text-muted-foreground" role="status">
            {active.payment.message}
          </p>
        ) : null}

        {active &&
        (active.payment.status === 'failed' ||
          active.payment.status === 'canceled' ||
          active.payment.status === 'expired') &&
        active.operationalStatus === 'awaiting_payment' ? (
          <Button type="button" size="xl" className="w-full" onClick={backToMethods}>
            Tentar outra forma de pagamento
          </Button>
        ) : null}

        {canChoose && choosingCard ? (
          <CardPanel
            starting={startingMethod === 'card'}
            onSimulate={handleSimulateCard}
            onBack={() => setChoosingCard(false)}
          />
        ) : null}

        {canChoose && !choosingCard ? (
          <MethodPicker
            disabled={busy}
            starting={startingMethod}
            onPix={() => void payment.begin('pix')}
            onCard={() => setChoosingCard(true)}
          />
        ) : null}

        <Button
          type="button"
          variant="outline"
          size="xl"
          className="w-full"
          onClick={() => void onFinish()}
        >
          Voltar ao início
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Ao sair, a operação continua registrada até o fim do prazo. Nada é persistido neste
          aparelho.
        </p>
      </div>
    </JourneyLayout>
  )
}
