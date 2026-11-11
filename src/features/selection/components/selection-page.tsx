import { ChevronLeft } from 'lucide-react'
import { JourneyLayout } from '@/components/layout/journey-layout'
import { Button } from '@/components/ui/button'
import type { Id } from '../../../../convex/_generated/dataModel'
import type { IdentifiedMember } from '@/features/identification/lib/lookup-outcome'
import type { ValidateSelectionFn } from '../api/validate-selection'
import { useSelectionValidation } from '../hooks/use-selection-validation'
import { toggleSelection } from '../lib/people'
import { summarizeSelection } from '../lib/summary'
import { PersonCard } from './person-card'
import { SelectionNotice } from './selection-notice'
import { SelectionSummary } from './selection-summary'

interface SelectionPageProps {
  member: IdentifiedMember
  selectedLinkIds: readonly Id<'householdLinks'>[]
  onSelectionChange: (linkIds: readonly Id<'householdLinks'>[]) => void
  /** Volta à identificação (encerrando a jornada atual). */
  onBack: () => void | Promise<void>
  /** Seleção validada pelo backend: segue para a escolha da data. */
  onContinue: () => void | Promise<void>
  /** A prova de identificação não vale mais: pedir nova identificação. */
  onSessionExpired: () => void | Promise<void>
  /** Permite substituir a validação (testes). Em produção usa o backend Convex. */
  validate?: ValidateSelectionFn
}

/** Segunda etapa da jornada: escolha de quem vai utilizar as piscinas. */
export function SelectionPage({
  member,
  selectedLinkIds,
  onSelectionChange,
  onBack,
  onContinue,
  onSessionExpired,
  validate,
}: SelectionPageProps) {
  const validation = useSelectionValidation(validate)
  const { state } = validation
  const isValidating = state.status === 'validating'
  const summary = summarizeSelection(selectedLinkIds.length)

  function handleToggle(linkId: Id<'householdLinks'>) {
    if (isValidating) return
    onSelectionChange(toggleSelection(member.people, selectedLinkIds, linkId))
    // Mudou a seleção: a validação anterior (ou seu aviso) deixa de valer.
    validation.reset()
  }

  async function handleContinue() {
    if (isValidating || selectedLinkIds.length === 0) return
    const outcome = await validation.validate({
      memberId: member.memberId,
      identificationToken: member.session.token,
      linkIds: [...selectedLinkIds],
    })
    if (outcome?.kind === 'session_expired') void onSessionExpired()
    if (outcome?.kind === 'valid') void onContinue()
  }

  return (
    <JourneyLayout
      eyebrow="Etapa 2 · Pessoas"
      title="Quem utilizará as piscinas?"
      description="Selecione o titular e os dependentes que utilizarão as piscinas na data escolhida."
    >
      {/* Reserva o espaço da barra fixa do celular para não cobrir o último cartão. */}
      <div className="pb-44 md:pb-0">
        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="mb-2 -ml-3 h-11 text-base text-muted-foreground"
          onClick={() => void onBack()}
        >
          <ChevronLeft aria-hidden="true" />
          Voltar
        </Button>

        {state.status === 'rejected' || state.status === 'unavailable' ? (
          <SelectionNotice state={state} onRetry={() => void handleContinue()} />
        ) : null}

        <fieldset className="min-w-0">
          <legend className="mb-3 text-xl leading-tight font-semibold">Pessoas do cadastro</legend>
          <ul className="flex flex-col gap-3">
            {member.people.map((person) => (
              <li key={person.linkId}>
                <PersonCard
                  person={person}
                  checked={selectedLinkIds.includes(person.linkId)}
                  locked={isValidating}
                  onToggle={() => handleToggle(person.linkId)}
                />
              </li>
            ))}
          </ul>
        </fieldset>

        <p className="mt-4 mb-6 text-sm text-muted-foreground">
          Os valores abaixo são informativos. O valor final é calculado e confirmado pelo sistema.
        </p>

        <SelectionSummary
          summary={summary}
          isValidating={isValidating}
          isValidated={state.status === 'valid'}
          onContinue={() => void handleContinue()}
        />
      </div>
    </JourneyLayout>
  )
}
