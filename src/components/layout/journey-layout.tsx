import { Waves } from 'lucide-react'
import type { ReactNode } from 'react'

interface JourneyLayoutProps {
  /** Rótulo curto da etapa (ex.: "Etapa 1 · Identificação"). */
  eyebrow: string
  title: string
  description: string
  children: ReactNode
}

/**
 * Estrutura das telas públicas da jornada do associado, pensada primeiro para o celular:
 * faixa institucional no topo e conteúdo logo abaixo, em coluna única. A partir de `lg` a faixa
 * vira um painel lateral e o conteúdo fica centralizado ao lado.
 */
export function JourneyLayout({ eyebrow, title, description, children }: JourneyLayoutProps) {
  return (
    <div className="flex min-h-svh flex-col bg-primary lg:grid lg:grid-cols-[5fr_7fr] lg:bg-background">
      <header className="bg-primary px-5 pt-6 pb-14 text-primary-foreground sm:px-8 lg:col-start-1 lg:row-start-1 lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-12">
        <div className="mx-auto w-full max-w-md sm:max-w-lg lg:mx-0 lg:max-w-none">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-foreground/15"
            >
              <Waves className="size-6" />
            </span>
            <div className="leading-tight">
              <p className="text-lg font-semibold">Sindicomerciários</p>
              <p className="text-sm text-primary-foreground/80">Sede Campestre</p>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-8 w-full max-w-md sm:max-w-lg lg:mx-0 lg:mt-0 lg:max-w-md">
          <p className="text-sm font-medium tracking-wide text-primary-foreground/80 uppercase">
            {eyebrow}
          </p>
          <h1 className="mt-2 text-3xl leading-tight font-semibold text-balance lg:text-4xl">
            {title}
          </h1>
          <p className="mt-3 text-base leading-relaxed text-primary-foreground/90">{description}</p>
        </div>

        <p className="hidden text-sm text-primary-foreground/70 lg:block">
          Piscinas · Sede Campestre do Sindicomerciários
        </p>
      </header>

      <main className="-mt-6 flex-1 rounded-t-3xl bg-background px-5 pt-8 pb-10 sm:px-8 lg:col-start-2 lg:row-start-1 lg:mt-0 lg:flex lg:items-center lg:justify-center lg:rounded-none lg:px-12 lg:py-12">
        <div className="mx-auto w-full max-w-md sm:max-w-lg">{children}</div>
      </main>
    </div>
  )
}
