import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Aviso em bloco. A cor reforça, mas nunca é o único sinal: cada uso traz ícone e título.
 * O ícone é o primeiro filho `svg`, posicionado na primeira coluna.
 */
const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr] items-start gap-y-1 rounded-xl border px-4 py-4 text-base has-[>svg]:grid-cols-[1.5rem_1fr] has-[>svg]:gap-x-3 [&>svg]:size-6 [&>svg]:translate-y-px',
  {
    variants: {
      variant: {
        info: 'border-primary/25 bg-secondary text-secondary-foreground [&>svg]:text-primary',
        success: 'border-success/30 bg-success-soft text-foreground [&>svg]:text-success',
        warning: 'border-warning/35 bg-warning-soft text-foreground [&>svg]:text-warning',
        destructive:
          'border-destructive/35 bg-danger-soft text-foreground [&>svg]:text-destructive',
      },
    },
    defaultVariants: { variant: 'info' },
  },
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      className={cn(
        alertVariants({ variant }),
        'focus-visible:ring-[3px] focus-visible:ring-ring/40',
        className,
      )}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn('col-start-2 leading-snug font-semibold', className)}
      {...props}
    />
  )
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        'col-start-2 grid justify-items-start gap-2 text-base leading-relaxed',
        className,
      )}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription }
