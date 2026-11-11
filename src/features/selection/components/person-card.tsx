import { Check, CircleCheck, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { HouseholdPerson } from '@/features/identification/lib/lookup-outcome'
import { ineligibleReason, relationshipLabel } from '../lib/people'

interface PersonCardProps {
  person: HouseholdPerson
  checked: boolean
  /** Bloqueia a alteração (ex.: enquanto a validação está em andamento). */
  locked?: boolean
  onToggle: () => void
}

/**
 * Cartão de uma pessoa. O cartão inteiro é um `<label>` de um checkbox nativo: tocar em qualquer
 * ponto marca/desmarca, e teclado, leitores de tela e foco funcionam sem código extra. O
 * quadrado com "check" é só o indicador visual (a seleção também é dita por texto/ARIA).
 */
export function PersonCard({ person, checked, locked = false, onToggle }: PersonCardProps) {
  const reason = ineligibleReason(person)
  const eligible = reason === null
  const inputId = `person-${person.linkId}`
  const detailsId = `${inputId}-details`

  return (
    <label
      htmlFor={inputId}
      className={cn(
        'group relative flex min-h-20 items-start gap-4 rounded-2xl border bg-card p-4 transition-colors',
        'has-[:focus-visible]:border-ring has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40',
        eligible
          ? 'cursor-pointer hover:bg-accent/60 has-[:checked]:border-primary has-[:checked]:bg-secondary has-[:checked]:shadow-[inset_0_0_0_1px_var(--primary)]'
          : 'cursor-not-allowed border-dashed bg-muted',
        locked && 'pointer-events-none',
      )}
    >
      <input
        id={inputId}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={!eligible}
        aria-describedby={detailsId}
        onChange={onToggle}
      />

      {/* Indicador de seleção (decorativo): borda reforçada + marca de verificação. */}
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border-2 border-input bg-background text-primary-foreground transition-colors',
          'peer-checked:border-primary peer-checked:bg-primary',
          'peer-disabled:border-muted-foreground/40 peer-disabled:bg-transparent',
          '[&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100',
        )}
      >
        <Check className="size-5" strokeWidth={3} />
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block text-lg leading-snug font-semibold break-words',
            !eligible && 'text-muted-foreground',
          )}
        >
          {person.name}
        </span>

        <span id={detailsId} className="mt-1 flex flex-col gap-1.5 text-base">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
            <span>{relationshipLabel(person)}</span>
            <span aria-hidden="true">·</span>
            {eligible ? (
              <span className="inline-flex items-center gap-1 font-medium text-success">
                <CircleCheck aria-hidden="true" className="size-4" />
                Elegível
              </span>
            ) : (
              <span className="font-medium text-warning">Não elegível</span>
            )}
          </span>
          {reason ? (
            <span className="flex items-start gap-2 text-sm leading-snug text-muted-foreground">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {reason}
            </span>
          ) : null}
        </span>
      </span>
    </label>
  )
}
