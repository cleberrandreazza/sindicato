import { ArrowRight, CircleCheck, ShieldAlert } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { IdentifiedMember } from '../lib/lookup-outcome'

/** Move o foco para o título do resultado, anunciando a mudança de tela. */
function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return ref
}

function peopleLabel(count: number): string {
  return count === 1 ? '1 pessoa' : `${count} pessoas`
}

interface IdentifiedResultProps {
  member: IdentifiedMember
  onStartOver: () => void
}

/**
 * Identificação confirmada. A seleção de pessoas é a próxima etapa da jornada e ainda não existe:
 * por isso a continuação aparece indisponível. `member.session` já está pronta para ser usada
 * por ela.
 */
export function IdentifiedResult({ member, onStartOver }: IdentifiedResultProps) {
  const headingRef = useFocusOnMount<HTMLHeadingElement>()

  return (
    <section aria-labelledby="identified-title" className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="flex size-14 shrink-0 items-center justify-center rounded-full bg-success-soft text-success"
        >
          <CircleCheck className="size-8" />
        </span>
        <h2
          id="identified-title"
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl leading-tight font-semibold outline-none"
        >
          Identificação confirmada
        </h2>
      </div>

      <Card className="gap-0 py-0">
        <CardContent className="px-5 py-5">
          <dl className="flex flex-col gap-4">
            <div>
              <dt className="text-sm text-muted-foreground">Titular</dt>
              <dd className="text-lg font-semibold break-words">{member.holderName}</dd>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-muted-foreground">Carteirinha</dt>
                <dd className="font-medium break-all">{member.membershipNumber}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">CPF</dt>
                <dd className="font-medium break-all">{member.cpfMasked}</dd>
              </div>
            </div>
          </dl>
        </CardContent>
      </Card>

      <p className="text-base leading-relaxed text-muted-foreground">
        Na próxima etapa você escolhe quem vai usar as piscinas. Há{' '}
        <strong className="font-semibold text-foreground">
          {peopleLabel(member.selectablePeopleCount)}
        </strong>{' '}
        {member.selectablePeopleCount === 1 ? 'disponível' : 'disponíveis'} no seu cadastro.
      </p>

      <div className="flex flex-col gap-3">
        <Button
          type="button"
          size="xl"
          className="w-full"
          disabled
          aria-describedby="selection-soon"
        >
          Escolher pessoas
          <ArrowRight aria-hidden="true" />
        </Button>
        <p id="selection-soon" className="text-center text-sm text-muted-foreground">
          Esta etapa estará disponível em breve.
        </p>
        <Button type="button" variant="outline" size="xl" className="w-full" onClick={onStartOver}>
          Consultar outro cadastro
        </Button>
      </div>
    </section>
  )
}

interface InactiveResultProps {
  membershipNumber: string
  message: string
  onStartOver: () => void
}

/** A situação cadastral (informada pelo backend) não permite prosseguir. */
export function InactiveResult({ membershipNumber, message, onStartOver }: InactiveResultProps) {
  const headingRef = useFocusOnMount<HTMLHeadingElement>()

  return (
    <section aria-labelledby="inactive-title" className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="flex size-14 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning"
        >
          <ShieldAlert className="size-8" />
        </span>
        <h2
          id="inactive-title"
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl leading-tight font-semibold outline-none"
        >
          Situação cadastral não permite prosseguir
        </h2>
      </div>

      <p className="text-base leading-relaxed">
        A carteirinha <strong className="font-semibold">{membershipNumber}</strong> está com o
        cadastro inativo.
      </p>
      {message ? (
        <p className="text-base leading-relaxed text-muted-foreground">{message}</p>
      ) : null}

      <Button type="button" variant="outline" size="xl" className="w-full" onClick={onStartOver}>
        Consultar outro cadastro
      </Button>
    </section>
  )
}
