import { CircleCheck, Info } from 'lucide-react'
import { JourneyLayout } from '@/components/layout/journey-layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { formatBRL, peopleLabel } from '@/features/selection/lib/summary'
import type { CreatedOperation } from '@/features/summary/lib/created-operation'
import { formatUsageDate, formatUsageDateBR } from '@/features/usage-date/lib/usage-date'
import { formatDeadline } from '../lib/deadline'

interface PaymentPendingPageProps {
  operation: CreatedOperation
  /** Encerra a jornada e volta ao início. */
  onFinish: () => void | Promise<void>
}

/**
 * TELA INTERMEDIÁRIA da quinta etapa. A interface de pagamento ainda não existe: esta tela só
 * informa que a operação foi criada pelo sistema, com os valores e o prazo OFICIAIS devolvidos
 * pelo backend. Não gera cobrança, não chama o provedor de pagamento e não sugere que algo foi
 * pago.
 */
export function PaymentPendingPage({ operation, onFinish }: PaymentPendingPageProps) {
  return (
    <JourneyLayout
      eyebrow="Etapa 5 · Pagamento"
      title="Operação criada"
      description="Sua operação foi registrada pelo sistema. A etapa de pagamento ainda não está disponível."
    >
      <Alert variant="success" role="status" className="mb-4">
        <CircleCheck aria-hidden="true" />
        <AlertTitle>
          {operation.recovered ? 'Operação recuperada' : 'Operação criada com sucesso'}
        </AlertTitle>
        <AlertDescription>
          <p>
            {operation.recovered
              ? 'Esta é a operação criada anteriormente para a sua solicitação. Não criamos outra.'
              : 'O sistema registrou a operação com os dados que você revisou.'}
          </p>
        </AlertDescription>
      </Alert>

      <Alert variant="info" className="mb-6">
        <Info aria-hidden="true" />
        <AlertTitle>Nenhum pagamento foi realizado</AlertTitle>
        <AlertDescription>
          <p>
            Nenhuma cobrança foi gerada e nada foi pago. A tela de pagamento (Pix ou cartão) será
            disponibilizada em uma próxima etapa.
          </p>
        </AlertDescription>
      </Alert>

      <dl className="flex flex-col gap-4 rounded-2xl border bg-card p-4 text-base">
        <div>
          <dt className="text-sm text-muted-foreground">Data de utilização</dt>
          <dd className="font-semibold">
            {formatUsageDateBR(operation.usageDate)}
            <span className="block text-base font-normal text-muted-foreground">
              {formatUsageDate(operation.usageDate)}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">
            {peopleLabel(operation.quantity)} selecionada{operation.quantity === 1 ? '' : 's'}
          </dt>
          <dd>
            <ul className="mt-1 flex flex-col gap-1 font-semibold">
              {operation.people.map((person) => (
                <li key={person.name}>{person.name}</li>
              ))}
            </ul>
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-t pt-3">
          <dt className="text-muted-foreground">Valor total (calculado pelo sistema)</dt>
          <dd className="text-2xl font-bold text-primary">
            {formatBRL(operation.totalAmountCents)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground">Valor unitário</dt>
          <dd className="font-semibold">{formatBRL(operation.unitAmountCents)}</dd>
        </div>
        <div className="border-t pt-3">
          <dt className="text-sm text-muted-foreground">Prazo da operação</dt>
          <dd className="font-semibold">{formatDeadline(operation.expiresAt)}</dd>
          <dd className="mt-1 text-sm text-muted-foreground">
            O prazo de 15 minutos conta a partir da criação da operação, informada pelo sistema.
          </dd>
        </div>
      </dl>

      <Button
        type="button"
        variant="outline"
        size="xl"
        className="mt-6 w-full"
        onClick={() => void onFinish()}
      >
        Voltar ao início
      </Button>
      <p className="mt-2 pb-[env(safe-area-inset-bottom)] text-center text-sm text-muted-foreground">
        Ao sair, a operação continua registrada até o fim do prazo.
      </p>
    </JourneyLayout>
  )
}
