import { JourneyLayout } from '@/components/layout/journey-layout'
import { useIdentification } from '../hooks/use-identification'
import type { LookupFn } from '../api/lookup-member'
import { IdentificationForm } from './identification-form'
import { IdentificationNotice } from './identification-notice'
import { IdentifiedResult, InactiveResult } from './identification-result'

interface IdentificationPageProps {
  /** Permite substituir a consulta (testes). Em produção usa o backend Convex. */
  lookup?: LookupFn
}

/** Primeira tela da jornada: identificação do associado por carteirinha e CPF. */
export function IdentificationPage({ lookup }: IdentificationPageProps) {
  const { state, submit, retry, reset } = useIdentification(lookup)

  return (
    <JourneyLayout
      eyebrow="Etapa 1 · Identificação"
      title="Taxa médica das piscinas"
      description="Informe os dados da sua carteirinha para começar o pagamento."
    >
      {state.status === 'identified' ? (
        <IdentifiedResult member={state.member} onStartOver={reset} />
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
