import { CalendarDays, ChevronLeft } from 'lucide-react'
import { useMemo } from 'react'
import { JourneyLayout } from '@/components/layout/journey-layout'
import { Button } from '@/components/ui/button'
import type { Id } from '../../../../convex/_generated/dataModel'
import type { IdentifiedMember } from '@/features/identification/lib/lookup-outcome'
import { relationshipLabel } from '@/features/selection/lib/people'
import { formatBRL, summarizeSelection } from '@/features/selection/lib/summary'
import { ProvisionalRuleNote } from '@/features/usage-date/components/provisional-rule-note'
import {
  checkLocalUsageDate,
  formatUsageDate,
  formatUsageDateBR,
  todayInSaoPaulo,
} from '@/features/usage-date/lib/usage-date'
import type { CreateOperationFn, GetOperationFn } from '../api/create-operation'
import { useOperationConfirmation } from '../hooks/use-operation-confirmation'
import type { ConfirmationRequest, CreatedOperation } from '../lib/created-operation'
import { ConfirmationBar } from './confirmation-bar'
import { ConfirmationNotice } from './confirmation-notice'

interface SummaryPageProps {
  member: IdentifiedMember
  selectedLinkIds: readonly Id<'householdLinks'>[]
  usageDate: string | null
  /** Tentativa lógica de confirmação em andamento (só em memória, na jornada). */
  request: ConfirmationRequest | null
  onRequestChange: (request: ConfirmationRequest | null) => void
  /** O backend criou (ou recuperou) a operação: guardar e seguir para o pagamento. */
  onCreated: (operation: CreatedOperation) => void | Promise<void>
  onBack: () => void | Promise<void>
  onReviewPeople: () => void | Promise<void>
  onChangeDate: () => void | Promise<void>
  /** A prova de identificação não vale mais: pedir nova identificação. */
  onSessionExpired: () => void | Promise<void>
  /** Substituições para testes. Em produção usam o backend Convex. */
  create?: CreateOperationFn
  getState?: GetOperationFn
  newRequestId?: () => string
  /** "Hoje" no calendário de São Paulo (`YYYY-MM-DD`). */
  getToday?: () => string
}

/** Quarta etapa da jornada: revisão dos dados e criação da operação de pagamento. */
export function SummaryPage({
  member,
  selectedLinkIds,
  usageDate,
  request,
  onRequestChange,
  onCreated,
  onBack,
  onReviewPeople,
  onChangeDate,
  onSessionExpired,
  create,
  getState,
  newRequestId,
  getToday = todayInSaoPaulo,
}: SummaryPageProps) {
  const confirmation = useOperationConfirmation({
    member,
    selectedLinkIds,
    usageDate,
    request,
    onRequestChange,
    onCreated,
    onSessionExpired,
    create,
    getState,
    newRequestId,
  })
  const { state } = confirmation
  const isConfirming = state.status === 'confirming'
  const isCreated = state.status === 'created'

  const people = useMemo(
    () => member.people.filter((person) => selectedLinkIds.includes(person.linkId)),
    [member.people, selectedLinkIds],
  )
  // Referência informativa (a mesma função pura do backend). O valor da operação é o do servidor.
  const summary = summarizeSelection(people.length)

  // Só segue com informação válida. O backend revalida tudo de qualquer forma.
  const dateCheck = usageDate === null ? null : checkLocalUsageDate(usageDate, getToday())
  const blockedReason =
    people.length === 0
      ? 'Selecione ao menos uma pessoa para continuar.'
      : usageDate === null
        ? 'Escolha a data de utilização para continuar.'
        : dateCheck && !dateCheck.ok
          ? `${dateCheck.message} Escolha a data novamente.`
          : null

  const noticeState =
    state.status === 'rejected' ||
    state.status === 'duplicate' ||
    state.status === 'unusable' ||
    state.status === 'unknown'
      ? state
      : null

  return (
    <JourneyLayout
      eyebrow="Etapa 4 · Resumo"
      title="Revise sua operação"
      description="Confira os dados antes de continuar para o pagamento."
    >
      {/* Reserva o espaço da barra fixa do celular para não cobrir o último bloco. */}
      <div className="pb-56 md:pb-0">
        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="mb-2 -ml-3 h-11 text-base text-muted-foreground"
          disabled={isConfirming || isCreated}
          onClick={() => void onBack()}
        >
          <ChevronLeft aria-hidden="true" />
          Voltar
        </Button>

        {noticeState ? (
          <ConfirmationNotice
            state={noticeState}
            onRetry={() => void confirmation.confirm()}
            onReviewPeople={() => void onReviewPeople()}
            onChangeDate={() => void onChangeDate()}
            onDismiss={confirmation.dismiss}
          />
        ) : null}

        <div className="flex flex-col gap-6">
          <section aria-labelledby="summary-date">
            <h2 id="summary-date" className="mb-3 text-xl leading-tight font-semibold">
              Data de utilização
            </h2>
            <div className="flex items-start gap-4 rounded-2xl border bg-card p-4">
              <span
                aria-hidden="true"
                className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary"
              >
                <CalendarDays className="size-6" />
              </span>
              <div className="min-w-0 flex-1">
                {usageDate !== null ? (
                  <>
                    <p className="text-2xl leading-tight font-bold text-primary">
                      {formatUsageDateBR(usageDate)}
                    </p>
                    <p className="mt-1 text-base text-muted-foreground">
                      {formatUsageDate(usageDate)}
                    </p>
                  </>
                ) : (
                  <p className="text-base text-muted-foreground">Data não escolhida.</p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="h-11 shrink-0 px-3 text-base"
                aria-label="Alterar a data"
                disabled={isConfirming || isCreated}
                onClick={() => void onChangeDate()}
              >
                Alterar
              </Button>
            </div>
          </section>

          <section aria-labelledby="summary-people">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="summary-people" className="text-xl leading-tight font-semibold">
                Pessoas selecionadas
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="-mr-3 h-11 px-3 text-base"
                aria-label="Alterar as pessoas"
                disabled={isConfirming || isCreated}
                onClick={() => void onReviewPeople()}
              >
                Alterar
              </Button>
            </div>
            <ul className="flex flex-col gap-3">
              {people.map((person) => (
                <li
                  key={person.linkId}
                  className="flex items-start justify-between gap-4 rounded-2xl border bg-card p-4"
                >
                  <div className="min-w-0">
                    <p className="text-lg leading-snug font-semibold break-words">{person.name}</p>
                    <p className="mt-0.5 text-base text-muted-foreground">
                      {relationshipLabel(person)}
                    </p>
                  </div>
                  <p className="shrink-0 text-right">
                    <span className="block text-base font-semibold">
                      {formatBRL(summary.unitAmountCents)}
                    </span>
                    <span className="block text-sm text-muted-foreground">valor unitário</span>
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <ProvisionalRuleNote />

          <p className="text-sm text-muted-foreground">
            Os valores são de referência: o valor da operação é calculado e confirmado pelo sistema
            ao continuar. O prazo de 15 minutos para pagar só começa quando a operação é criada.
          </p>

          <ConfirmationBar
            summary={summary}
            blockedReason={blockedReason}
            isConfirming={isConfirming}
            isCreated={isCreated}
            onConfirm={() => void confirmation.confirm()}
          />
        </div>
      </div>
    </JourneyLayout>
  )
}
