import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-2xl font-semibold">Sede Campestre</h1>
      <p className="text-muted-foreground">Sindicomerciários — taxa médica das piscinas.</p>
    </main>
  )
}
