import { ArrowRight, CalendarDays, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatBRL, type SelectionSummary as Summary } from '../lib/summary'

interface SelectionSummaryProps {
  summary: Summary
  isValidating: boolean
  /** Seleção já validada pelo backend: a próxima etapa (data) ainda não existe. */
  isValidated: boolean
  onContinue: () => void
}

/**
 * Resumo informativo e ação de continuar. No celular fica fixo na base da tela (respeitando a
 * área segura do aparelho); a partir de `md` acompanha o conteúdo, em um cartão.
 * Os valores aqui são só informativos: o backend recalcula tudo ao criar a cobrança.
 */
export function SelectionSummary({
  summary,
  isValidating,
  isValidated,
  onContinue,
}: SelectionSummaryProps) {
  const isEmpty = summary.quantity === 0

  return (
    <section
      aria-label="Resumo da seleção"
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-background px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_-12px_rgb(15_30_70/0.25)] sm:px-8 md:static md:z-auto md:rounded-2xl md:border md:p-6 md:shadow-sm"
    >
      <div className="mx-auto w-full max-w-md sm:max-w-lg md:max-w-none">
        {/* Anuncia atualizações do valor para leitores de tela. No celular o total fica ao lado,
            em destaque, para a barra fixa ocupar pouco espaço; a partir de `md` empilha. */}
        <dl
          aria-live="polite"
          className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 text-base md:flex md:flex-col md:items-stretch md:gap-1"
        >
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">Pessoas selecionadas</dt>
            <dd className="font-semibold">{summary.quantity}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">Valor unitário</dt>
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

        {isEmpty ? (
          <p id="selection-guidance" className="mt-3 text-sm text-muted-foreground">
            Selecione ao menos uma pessoa para continuar.
          </p>
        ) : null}

        {isValidated ? (
          <>
            <Button
              type="button"
              size="xl"
              className="mt-3 w-full"
              disabled
              aria-describedby="date-soon"
            >
              <CalendarDays aria-hidden="true" />
              Informar a data
            </Button>
            <p id="date-soon" className="mt-2 text-center text-sm text-muted-foreground">
              Esta etapa estará disponível em breve.
            </p>
          </>
        ) : (
          <Button
            type="button"
            size="xl"
            className="mt-3 w-full aria-disabled:pointer-events-none aria-disabled:opacity-80"
            // Sem pessoas: realmente desabilitado. Validando: continua focável, mas inerte.
            disabled={isEmpty}
            aria-disabled={isValidating || undefined}
            aria-describedby={isEmpty ? 'selection-guidance' : undefined}
            onClick={onContinue}
          >
            {isValidating ? (
              <>
                <Loader2 aria-hidden="true" className="animate-spin" />
                Validando…
              </>
            ) : (
              <>
                Continuar
                <ArrowRight aria-hidden="true" />
              </>
            )}
          </Button>
        )}

        <p role="status" className="sr-only">
          {isValidating ? 'Validando a seleção. Aguarde.' : ''}
        </p>
      </div>
    </section>
  )
}
