import { CircleAlert } from 'lucide-react'
import * as React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface TextFieldProps extends Omit<React.ComponentProps<typeof Input>, 'id'> {
  id: string
  label: string
  /** Orientação sempre visível sob o campo. */
  hint?: string
  /** Mensagem de erro; liga-se ao campo por `aria-describedby` e `aria-invalid`. */
  error?: string
}

/**
 * Campo com rótulo, orientação e erro associados. O erro usa ícone + texto (não depende de cor).
 */
function TextField({ id, label, hint, error, className, ...inputProps }: TextFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        className={cn(className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...inputProps}
      />
      {error ? (
        <p id={errorId} className="flex items-start gap-2 text-base font-medium text-destructive">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export { TextField }
