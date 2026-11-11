// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { useEffect } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Id } from '../../convex/_generated/dataModel'
import { JourneyProvider } from '../../src/app/providers/journey-provider'
import { useJourney } from '../../src/app/providers/journey-context'
import type { IdentifiedMember } from '../../src/features/identification/lib/lookup-outcome'
import { routeTree } from '../../src/routeTree.gen'

// jsdom não implementa rolagem; o router restaura a posição ao navegar.
window.scrollTo = () => {}

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  window.sessionStorage.clear()
})

const member: IdentifiedMember = {
  memberId: 'member-1' as Id<'members'>,
  membershipNumber: '100001',
  cpfMasked: '***.***.***-08',
  holderName: 'Ana Teste Almeida',
  selectablePeopleCount: 2,
  people: [
    {
      linkId: 'l0' as Id<'householdLinks'>,
      name: 'Ana Teste Almeida',
      kind: 'holder',
      selectable: true,
    },
    {
      linkId: 'l1' as Id<'householdLinks'>,
      name: 'Bruno Teste Almeida',
      kind: 'dependent',
      selectable: true,
    },
  ],
  session: { token: 'token-da-sessao', expiresAt: Date.now() + 1_800_000 },
}

interface Start {
  to?: '/pessoas' | '/data' | '/resumo' | '/pagamento' | '/comprovante'
  selected?: Id<'householdLinks'>[]
  date?: string | null
  withOperation?: boolean
}

/** Simula a identificação concluída e o avanço, como os botões das etapas anteriores. */
function begin(router: ReturnType<typeof createRouter<typeof routeTree>>, start: Start) {
  function Begin() {
    const journey = useJourney()
    useEffect(() => {
      journey.begin(member)
      if (start.selected) journey.setSelectedLinkIds(start.selected)
      if (start.date) journey.setUsageDate(start.date)
      if (start.withOperation) {
        journey.setOperation({
          operationId: 'op-route' as Id<'paymentOperations'>,
          accessToken: 'c'.repeat(64),
          usageDate: start.date ?? '2026-11-20',
          quantity: 1,
          unitAmountCents: 3000,
          totalAmountCents: 3000,
          expiresAt: Date.now() + 900_000,
          people: [{ name: 'Ana Teste Almeida', role: 'holder' }],
          recovered: false,
        })
      }
      void router.navigate({ to: start.to ?? '/pessoas' })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return null
  }
  return <Begin />
}

function renderAt(path: string, options: { identified?: boolean | Start } = {}) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [options.identified ? '/' : path] }),
  })
  const start = typeof options.identified === 'object' ? options.identified : {}
  render(
    <JourneyProvider>
      <RouterProvider router={router} />
      {options.identified ? begin(router, start) : null}
    </JourneyProvider>,
  )
  return router
}

describe('roteamento da jornada', () => {
  it('abrir /pessoas sem identificação volta à identificação, com orientação', async () => {
    const router = renderAt('/pessoas')

    expect(await screen.findByText('Identifique-se para continuar')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Identifique-se' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/')
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('/?motivo=sessao-expirada avisa que a identificação expirou', async () => {
    renderAt('/?motivo=sessao-expirada')
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Sua identificação expirou')
  })

  it('motivo desconhecido na URL é ignorado', async () => {
    renderAt('/?motivo=hackeado')
    await screen.findByRole('heading', { name: 'Identifique-se' })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText('Identifique-se para continuar')).toBeNull()
  })

  it('com associado identificado em memória, /pessoas mostra a seleção', async () => {
    const router = renderAt('/pessoas', { identified: true })
    expect(await screen.findByRole('heading', { name: 'Quem utilizará as piscinas?' })).toBeTruthy()
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    expect(router.state.location.pathname).toBe('/pessoas')
    // A prova de identificação não vai para a URL nem para o armazenamento do navegador.
    expect(router.state.location.href).not.toContain('token')
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })

  it('"Voltar" encerra a jornada e retorna à identificação', async () => {
    const user = userEvent.setup()
    const router = renderAt('/pessoas', { identified: true })
    await screen.findByRole('heading', { name: 'Quem utilizará as piscinas?' })
    await user.click(screen.getByRole('button', { name: 'Voltar' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(await screen.findByRole('heading', { name: 'Identifique-se' })).toBeTruthy()
  })

  it('abrir /data sem identificação volta à identificação', async () => {
    const router = renderAt('/data')
    expect(await screen.findByText('Identifique-se para continuar')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/')
  })

  it('identificado, mas sem pessoas escolhidas, /data volta à seleção', async () => {
    const router = renderAt('/data', { identified: { to: '/data' } })
    expect(await screen.findByRole('heading', { name: 'Quem utilizará as piscinas?' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/pessoas')
  })

  it('com pessoas escolhidas, /data mostra a etapa da data sem expor a prova na URL', async () => {
    const router = renderAt('/data', {
      identified: { to: '/data', selected: ['l1' as Id<'householdLinks'>] },
    })
    expect(
      await screen.findByRole('heading', { name: 'Quando pretende utilizar as piscinas?' }),
    ).toBeTruthy()
    expect(router.state.location.pathname).toBe('/data')
    expect(router.state.location.href).not.toContain('token')
    expect(screen.getByText('Bruno Teste Almeida')).toBeTruthy()
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })

  it('"Voltar" da data preserva a seleção e a data; mudar a seleção descarta a data', async () => {
    const user = userEvent.setup()
    const router = renderAt('/data', {
      identified: { to: '/data', selected: ['l1' as Id<'householdLinks'>], date: '2026-11-20' },
    })
    const dateField = async () =>
      (await screen.findByLabelText('Data de utilização')) as HTMLInputElement
    expect((await dateField()).value).toBe('2026-11-20')

    // Voltar: a seleção continua marcada e a data continua guardada.
    await user.click(screen.getByRole('button', { name: 'Voltar' }))
    await screen.findByRole('heading', { name: 'Quem utilizará as piscinas?' })
    expect(router.state.location.pathname).toBe('/pessoas')
    expect((screen.getByRole('checkbox', { name: /Bruno/ }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByRole('button', { name: /Continuar/ })).toBeTruthy()

    // Sem mudar nada, a data é a mesma ao voltar à etapa.
    await act(() => router.navigate({ to: '/data' }))
    expect((await dateField()).value).toBe('2026-11-20')

    // Mudou a seleção: a data escolhida deixa de valer.
    await user.click(screen.getByRole('button', { name: 'Voltar' }))
    await screen.findByRole('heading', { name: 'Quem utilizará as piscinas?' })
    await user.click(screen.getByText('Ana Teste Almeida'))
    await act(() => router.navigate({ to: '/data' }))
    expect((await dateField()).value).toBe('')
    expect(screen.getByText('Ana Teste Almeida')).toBeTruthy()
  })

  it('abrir /resumo sem identificação volta à identificação', async () => {
    const router = renderAt('/resumo')
    expect(await screen.findByText('Identifique-se para continuar')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/')
  })

  it('identificado com seleção e data, /resumo mostra a etapa do resumo', async () => {
    const router = renderAt('/resumo', {
      identified: {
        to: '/resumo',
        selected: ['l1' as Id<'householdLinks'>],
        date: '2026-11-20',
      },
    })
    expect(await screen.findByRole('heading', { name: 'Revise sua operação' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/resumo')
    expect(window.localStorage.length).toBe(0)
  })

  it('abrir /pagamento sem operação redireciona ao resumo (ou etapa anterior)', async () => {
    const router = renderAt('/pagamento', {
      identified: {
        to: '/pagamento',
        selected: ['l1' as Id<'householdLinks'>],
        date: '2026-11-20',
      },
    })
    await waitFor(() => expect(router.state.location.pathname).not.toBe('/pagamento'))
    expect(['/resumo', '/pessoas', '/data', '/']).toContain(router.state.location.pathname)
  })

  it('abrir /comprovante sem operação redireciona ao pagamento', async () => {
    const router = renderAt('/comprovante', {
      identified: {
        to: '/comprovante',
        selected: ['l1' as Id<'householdLinks'>],
        date: '2026-11-20',
      },
    })
    await waitFor(() => expect(router.state.location.pathname).not.toBe('/comprovante'))
  })

  it('com operação em memória, /pagamento permanece na etapa de pagamento', async () => {
    const router = renderAt('/pagamento', {
      identified: {
        to: '/pagamento',
        selected: ['l1' as Id<'householdLinks'>],
        date: '2026-11-20',
        withOperation: true,
      },
    })
    expect(await screen.findByRole('heading', { name: 'Finalize seu pagamento' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/pagamento')
    expect(router.state.location.href).not.toContain('token')
    expect(window.sessionStorage.length).toBe(0)
  })
})
