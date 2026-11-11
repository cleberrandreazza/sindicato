import { JourneyLayout } from '@/components/layout/journey-layout'
import { useIdentification } from '../hooks/use-identification'
import type { LookupFn } from '../api/lookup-member'
import { IdentificationForm } from './identification-form'
import { IdentificationNotice } from './identification-notice'
import { IdentificationReturnNotice } from './identification-return-notice'
import type { ReturnReason } from '../lib/return-reason'
import { IdentifiedResult, InactiveResult } from './identification-result'
import type { IdentifiedMember } from '../lib/lookup-outcome'

interface IdentificationPageProps {
  /** Segue para a próxima etapa com o associado identificado. */
  onContinue: (member: IdentifiedMember) => void
  /** Motivo de o associado ter voltado a esta tela (ex.: identificação expirada). */
  returnReason?: ReturnReason
  /** Permite substituir a consulta (testes). Em produção usa o backend Convex. */
  lookup?: LookupFn
}

/** Primeira tela da jornada: identificação do associado por carteirinha e CPF. */
export function IdentificationPage({ lookup, onContinue, returnReason }: IdentificationPageProps) {
  const { state, submit, retry, reset } = useIdentification(lookup)

  return (
    <JourneyLayout
      eyebrow="Etapa 1 · Identificação"
      title="Taxa médica das piscinas"
      description="Informe os dados da sua carteirinha para começar o pagamento."
    >
      {state.status === 'identified' ? (
        <IdentifiedResult member={state.member} onContinue={onContinue} onStartOver={reset} />
      ) : state.status === 'inactive' ? (
        <InactiveResult
          membershipNumber={state.membershipNumber}
          message={state.message}
          onStartOver={reset}
        />
      ) : (
        <div className="md:rounded-2xl md:border md:p-8 md:shadow-sm">
          <h2 className="text-2xl leading-tight font-semibold">Identifique-se</h2>
          <p className="mt-2 mb-6 text-base text-muted-foreground">
            Use o número da carteirinha e o CPF do titular.
          </p>

          {returnReason && state.status === 'idle' ? (
            <IdentificationReturnNotice reason={returnReason} />
          ) : null}

          {state.status === 'not_found' ||
          state.status === 'rate_limited' ||
          state.status === 'unavailable' ? (
            <IdentificationNotice state={state} onRetry={() => void retry()} />
          ) : null}

          <IdentificationForm isSubmitting={state.status === 'submitting'} onSubmit={submit} />
        </div>
      )}
    </JourneyLayout>
  )
}
