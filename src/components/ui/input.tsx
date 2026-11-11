import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Campo de texto. Altura de 48px (alvo de toque confortável) e fonte de 16px no celular:
 * abaixo disso o Safari/iOS aplica zoom automático ao focar o campo.
 */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-12 w-full min-w-0 rounded-lg border border-input bg-background px-4 py-2 text-base text-foreground shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground/80 disabled:cursor-not-allowed disabled:opacity-60 md:text-base',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-invalid:focus-visible:ring-destructive/30',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
