import { Hourglass } from 'lucide-react'
import { JourneyLayout } from '@/components/layout/journey-layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { formatBRL } from '@/features/selection/lib/summary'
import type { CreatedOperation } from '@/features/summary/lib/created-operation'
import { formatUsageDate, formatUsageDateBR } from '@/features/usage-date/lib/usage-date'

interface LatePaymentPageProps {
  operation: CreatedOperation
  message?: string
  onFinish: () => void | Promise<void>
  onRefresh?: () => void | Promise<void>
}

/**
 * Pagamento tardio: recebido, mas em análise. Sem comprovante definitivo nem liberação.
 */
export function LatePaymentPage({ operation, message, onFinish, onRefresh }: LatePaymentPageProps) {
  return (
    <JourneyLayout
      eyebrow="Etapa 6 · Análise"
      title="Pagamento recebido. Aguardando análise."
      description="Recebemos a confirmação do pagamento após o prazo previsto. Sua operação está aguardando análise da equipe responsável. Você poderá acompanhar a atualização por aqui."
    >
      <div className="flex flex-col gap-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <Alert variant="warning" role="status" data-testid="late-payment-notice">
          <Hourglass aria-hidden="true" />
          <AlertTitle>Sem comprovante definitivo nesta etapa</AlertTitle>
          <AlertDescription>
            <p>
              {message ??
                'Recebemos a confirmação do pagamento após o prazo previsto. Nossa equipe precisará analisar a operação antes de confirmar sua utilização.'}
            </p>
            <p>
              Não liberamos a utilização automaticamente e não emitimos comprovante definitivo
              enquanto a operação estiver em análise. Não realize um novo pagamento.
            </p>
          </AlertDescription>
        </Alert>

        <section className="rounded-2xl border bg-card p-4" aria-labelledby="late-summary">
          <h2 id="late-summary" className="sr-only">
            Resumo
          </h2>
          <dl className="flex flex-col gap-3 text-base">
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
              <dt className="text-muted-foreground">Valor recebido</dt>
              <dd className="text-xl font-bold">{formatBRL(operation.totalAmountCents)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Situação</dt>
              <dd className="font-semibold">Aguardando análise</dd>
            </div>
          </dl>
        </section>

        {onRefresh ? (
          <Button
            type="button"
            size="xl"
            variant="outline"
            className="w-full"
            onClick={() => void onRefresh()}
          >
            Atualizar status
          </Button>
        ) : null}

        <Button type="button" size="xl" className="w-full" onClick={() => void onFinish()}>
          Voltar ao início
        </Button>
      </div>
    </JourneyLayout>
  )
}
