import { ArrowRight, Loader2, Lock } from 'lucide-react'
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/text-field'
import type { LookupInput } from '../api/lookup-member'
import { formatCpf, onlyDigits } from '../lib/cpf-mask'
import {
  firstInvalidField,
  sanitizeMembershipNumber,
  validateIdentificationForm,
  type FieldErrors,
  type FieldName,
  type IdentificationFormValues,
} from '../lib/form'
import type { LookupOutcome } from '../lib/lookup-outcome'

interface IdentificationFormProps {
  isSubmitting: boolean
  onSubmit: (input: LookupInput) => Promise<LookupOutcome | null>
}

const EMPTY_VALUES: IdentificationFormValues = { membershipNumber: '', cpf: '' }

export function IdentificationForm({ isSubmitting, onSubmit }: IdentificationFormProps) {
  const [values, setValues] = useState<IdentificationFormValues>(EMPTY_VALUES)
  const [errors, setErrors] = useState<FieldErrors>({})
  const membershipRef = useRef<HTMLInputElement>(null)
  const cpfRef = useRef<HTMLInputElement>(null)

  function focusField(field: FieldName) {
    ;(field === 'membershipNumber' ? membershipRef : cpfRef).current?.focus()
  }

  function showErrors(next: FieldErrors) {
    setErrors(next)
    const first = firstInvalidField(next)
    if (first) focusField(first)
  }

  function updateField(field: FieldName, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    // Ao corrigir o campo, o aviso dele deixa de valer.
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))
  }

  function handleMembershipChange(event: ChangeEvent<HTMLInputElement>) {
    updateField('membershipNumber', sanitizeMembershipNumber(event.target.value))
  }

  function handleCpfChange(event: ChangeEvent<HTMLInputElement>) {
    updateField('cpf', formatCpf(event.target.value))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return

    const found = validateIdentificationForm(values)
    if (firstInvalidField(found)) {
      showErrors(found)
      return
    }
    setErrors({})

    const outcome = await onSubmit({
      membershipNumber: values.membershipNumber.trim(),
      cpf: onlyDigits(values.cpf),
    })
    // Recusa de formato pelo backend: o aviso aparece no campo correspondente.
    if (outcome?.kind === 'invalid_input') showErrors(outcome.fields)
  }

  return (
    <form noValidate onSubmit={handleSubmit} aria-label="Identificação do associado">
      <div className="flex flex-col gap-6">
        <TextField
          ref={membershipRef}
          id="membershipNumber"
          name="membershipNumber"
          label="Número da carteirinha"
          hint="Número impresso na sua carteirinha."
          error={errors.membershipNumber}
          value={values.membershipNumber}
          onChange={handleMembershipChange}
          // Premissa: carteirinhas numéricas (como no cadastro de testes). Se o sindicato usar
          // letras, trocar por `inputMode="text"`; o backend já aceita letras e números.
          inputMode="numeric"
          enterKeyHint="next"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          readOnly={isSubmitting}
          required
        />

        <TextField
          ref={cpfRef}
          id="cpf"
          name="cpf"
          label="CPF"
          hint="Somente números; a pontuação é colocada automaticamente."
          error={errors.cpf}
          value={values.cpf}
          onChange={handleCpfChange}
          placeholder="000.000.000-00"
          inputMode="numeric"
          enterKeyHint="go"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={14}
          readOnly={isSubmitting}
          required
        />

        <Button
          type="submit"
          size="xl"
          className="w-full aria-disabled:pointer-events-none aria-disabled:opacity-80"
          aria-disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 aria-hidden="true" className="animate-spin" />
              Consultando…
            </>
          ) : (
            <>
              Continuar
              <ArrowRight aria-hidden="true" />
            </>
          )}
        </Button>

        {/* Anuncia o carregamento para leitores de tela sem mover o foco. */}
        <p role="status" className="sr-only">
          {isSubmitting ? 'Consultando seus dados. Aguarde.' : ''}
        </p>

        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          Usamos seus dados apenas para localizar o seu cadastro.
        </p>
      </div>
    </form>
  )
}
