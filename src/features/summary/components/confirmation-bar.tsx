import { ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatBRL, type SelectionSummary } from '@/features/selection/lib/summary'

interface ConfirmationBarProps {
  summary: SelectionSummary
  /** Falta alguma informação válida (pessoas ou data): o botão fica desabilitado. */
  blockedReason: string | null
  isConfirming: boolean
  /** Criada: a tela está passando para a etapa seguinte. */
  isCreated: boolean
  onConfirm: () => void
}

/**
 * Resumo financeiro e ação de confirmar. No celular fica fixo na base (respeitando a área segura
 * do aparelho); a partir de `md` acompanha o conteúdo, em um cartão.
 *
 * Os valores são REFERÊNCIA: quem calcula e grava os valores da operação é o backend, ao criá-la.
 */
export function ConfirmationBar({
  summary,
  blockedReason,
  isConfirming,
  isCreated,
  onConfirm,
}: ConfirmationBarProps) {
  const isBusy = isConfirming || isCreated

  return (
    <section
      aria-label="Resumo financeiro"
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-background px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_-12px_rgb(15_30_70/0.25)] sm:px-8 md:static md:z-auto md:rounded-2xl md:border md:p-6 md:shadow-sm"
    >
      <div className="mx-auto w-full max-w-md sm:max-w-lg md:max-w-none">
        <dl
          aria-live="polite"
          className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 text-base md:flex md:flex-col md:items-stretch md:gap-1"
        >
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">Quantidade de pessoas</dt>
            <dd className="font-semibold">{summary.quantity}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">Valor unitário de referência</dt>
            <dd className="font-semibold">{formatBRL(summary.unitAmountCents)}</dd>
          </div>
          <div className="col-start-2 row-span-2 row-start-1 flex flex-col items-end md:mt-1 md:flex-row md:items-baseline md:justify-between md:gap-4 md:border-t md:pt-2">
            <dt className="text-sm font-medium text-muted-foreground md:text-lg md:font-semibold md:text-foreground">
              Valor total
            </dt>
            <dd className="text-2xl leading-tight font-bold text-primary">
              {formatBRL(summary.totalAmountCents)}
            </dd>
          </div>
        </dl>

        {blockedReason ? (
          <p id="confirmation-guidance" className="mt-3 text-sm text-muted-foreground">
            {blockedReason}
          </p>
        ) : null}

        <Button
          type="button"
          size="xl"
          className="mt-3 w-full aria-disabled:pointer-events-none aria-disabled:opacity-80"
          // Sem informações válidas: realmente desabilitado. Criando: continua focável, mas inerte.
          disabled={blockedReason !== null}
          aria-disabled={isBusy || undefined}
          aria-describedby={blockedReason ? 'confirmation-guidance' : undefined}
          onClick={onConfirm}
        >
          {isBusy ? (
            <>
              <Loader2 aria-hidden="true" className="animate-spin" />
              {isCreated ? 'Abrindo o pagamento…' : 'Criando a operação…'}
            </>
          ) : (
            <>
              Continuar para pagamento
              <ArrowRight aria-hidden="true" />
            </>
          )}
        </Button>

        <p role="status" className="sr-only">
          {isBusy ? 'Criando a operação. Aguarde.' : ''}
        </p>
      </div>
    </section>
  )
}
