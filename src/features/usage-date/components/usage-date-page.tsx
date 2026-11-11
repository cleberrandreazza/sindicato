import { ArrowRight, CalendarCheck, ChevronLeft, Loader2 } from 'lucide-react'
import { useRef, useState, type ComponentProps, type FormEvent } from 'react'
import { JourneyLayout } from '@/components/layout/journey-layout'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/text-field'
import type { Id } from '../../../../convex/_generated/dataModel'
import type { IdentifiedMember } from '@/features/identification/lib/lookup-outcome'
import type { CheckUsageDateFn } from '../api/check-usage-date'
import { useUsageDateCheck, type UsageDateCheckState } from '../hooks/use-usage-date-check'
import { checkLocalUsageDate, todayInSaoPaulo } from '../lib/usage-date'
import { ProvisionalRuleNote } from './provisional-rule-note'
import { UsageDateNotice } from './usage-date-notice'

interface UsageDatePageProps {
  member: IdentifiedMember
  selectedLinkIds: readonly Id<'householdLinks'>[]
  /** Data escolhida (`YYYY-MM-DD`) ou `null`. Vive no estado da jornada. */
  usageDate: string | null
  onUsageDateChange: (usageDate: string | null) => void
  /** Volta à seleção de pessoas, que é preservada. */
  onBack: () => void | Promise<void>
  /** A prova de identificação não vale mais: pedir nova identificação. */
  onSessionExpired: () => void | Promise<void>
  /** Permite substituir a validação (testes). Em produção usa o backend Convex. */
  check?: CheckUsageDateFn
  /** "Hoje" no calendário de São Paulo, como `YYYY-MM-DD` (testes). */
  getToday?: () => string
}

type NoticeState = ComponentProps<typeof UsageDateNotice>['state']

/** O resultado só vale para a data para a qual foi obtido; os demais avisos valem como estão. */
function noticeFor(state: UsageDateCheckState, value: string): NoticeState | null {
  switch (state.status) {
    case 'accepted':
    case 'conflict':
      return state.usageDate === value ? state : null
    case 'rejected':
    case 'unavailable':
      return state
    default:
      return null
  }
}

/** Terceira etapa da jornada: escolha da data de utilização das piscinas. */
export function UsageDatePage({
  member,
  selectedLinkIds,
  usageDate,
  onUsageDateChange,
  onBack,
  onSessionExpired,
  check,
  getToday = todayInSaoPaulo,
}: UsageDatePageProps) {
  const dateCheck = useUsageDateCheck(check)
  const { state } = dateCheck
  const isChecking = state.status === 'checking'
  const [localError, setLocalError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const value = usageDate ?? ''
  const today = getToday()
  const selectedPeople = member.people.filter((person) => selectedLinkIds.includes(person.linkId))

  function handleDateChange(next: string) {
    if (isChecking) return
    onUsageDateChange(next === '' ? null : next)
    setLocalError(null)
    // Mudou a data: o resultado anterior (ou seu aviso) deixa de valer.
    dateCheck.reset()
  }

  async function runCheck() {
    if (isChecking) return
    // A conferência local usa o "hoje" do instante do envio, não o da última renderização.
    const local = checkLocalUsageDate(value, getToday())
    if (!local.ok) {
      setLocalError(local.message)
      inputRef.current?.focus()
      return
    }
    setLocalError(null)
    const outcome = await dateCheck.check({
      memberId: member.memberId,
      identificationToken: member.session.token,
      linkIds: [...selectedLinkIds],
      usageDate: value,
    })
    if (outcome?.kind === 'session_expired') void onSessionExpired()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void runCheck()
  }

  const noticeState = noticeFor(state, value)
  const isAccepted = noticeState?.status === 'accepted'

  return (
    <JourneyLayout
      eyebrow="Etapa 3 · Data"
      title="Quando pretende utilizar as piscinas?"
      description="Escolha o dia em que as pessoas selecionadas utilizarão as piscinas."
    >
      <Button
        type="button"
        variant="ghost"
        size="lg"
        className="mb-2 -ml-3 h-11 text-base text-muted-foreground"
        disabled={isChecking}
        onClick={() => void onBack()}
      >
        <ChevronLeft aria-hidden="true" />
        Voltar
      </Button>

      {noticeState ? <UsageDateNotice state={noticeState} onRetry={() => void runCheck()} /> : null}

      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
        <section aria-labelledby="usage-date-people" className="rounded-2xl border p-4">
          <h2 id="usage-date-people" className="text-base font-semibold">
            {selectedPeople.length === 1 ? 'Pessoa selecionada' : 'Pessoas selecionadas'}
          </h2>
          <ul className="mt-2 flex flex-col gap-1 text-base text-muted-foreground">
            {selectedPeople.map((person) => (
              <li key={person.linkId}>{person.name}</li>
            ))}
          </ul>
        </section>

        <TextField
          ref={inputRef}
          id="usage-date"
          name="usage-date"
          type="date"
          label="Data de utilização"
          hint="Escolha o dia de hoje ou uma data futura."
          min={today}
          required
          aria-required="true"
          value={value}
          readOnly={isChecking}
          error={localError ?? undefined}
          onChange={(event) => handleDateChange(event.target.value)}
        />

        <ProvisionalRuleNote />

        {isAccepted ? (
          <div>
            <Button
              type="button"
              size="xl"
              className="w-full"
              disabled
              aria-describedby="next-soon"
            >
              <CalendarCheck aria-hidden="true" />
              Ver o resumo
            </Button>
            <p id="next-soon" className="mt-2 text-center text-sm text-muted-foreground">
              Esta etapa estará disponível em breve.
            </p>
          </div>
        ) : (
          <Button
            type="submit"
            size="xl"
            className="w-full aria-disabled:pointer-events-none aria-disabled:opacity-80"
            aria-disabled={isChecking || undefined}
          >
            {isChecking ? (
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
          {isChecking ? 'Validando a data. Aguarde.' : ''}
        </p>
      </form>
    </JourneyLayout>
  )
}
