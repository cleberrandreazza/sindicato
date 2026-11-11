// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
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

/** Simula a identificação concluída e o avanço para a seleção, como o botão "Escolher pessoas". */
function begin(router: ReturnType<typeof createRouter<typeof routeTree>>) {
  function Begin() {
    const journey = useJourney()
    useEffect(() => {
      journey.begin(member)
      void router.navigate({ to: '/pessoas' })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    return null
  }
  return <Begin />
}

function renderAt(path: string, options: { identified?: boolean } = {}) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [options.identified ? '/' : path] }),
  })
  render(
    <JourneyProvider>
      <RouterProvider router={router} />
      {options.identified ? begin(router) : null}
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
})
