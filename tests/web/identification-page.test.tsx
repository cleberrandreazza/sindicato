// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConvexError } from 'convex/values'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Id } from '../../convex/_generated/dataModel'
import type { LookupFn, LookupResult } from '../../src/features/identification/api/lookup-member'
import { IdentificationPage } from '../../src/features/identification/components/identification-page'

afterEach(cleanup)

const activeResult: LookupResult = {
  member: {
    id: 'member-1' as Id<'members'>,
    membershipNumber: '100001',
    status: 'active',
    cpfMasked: '***.***.***-08',
  },
  holder: {
    linkId: 'l0' as Id<'householdLinks'>,
    name: 'Ana Teste Almeida',
    role: 'holder',
    status: 'active',
    selectable: true,
  },
  dependents: [
    {
      linkId: 'l1' as Id<'householdLinks'>,
      name: 'Bruno Teste Almeida',
      role: 'spouse',
      status: 'active',
      selectable: true,
    },
  ],
  session: { token: 'token-secreto-da-sessao', expiresAt: Date.now() + 1_800_000 },
}

const inactiveResult: LookupResult = {
  ...activeResult,
  member: {
    ...activeResult.member,
    membershipNumber: '900004',
    status: 'inactive',
  },
  session: null,
  message: 'O cadastro do titular não está ativo. Entre em contato com o Sindicomerciários.',
}

function setup(lookup: LookupFn) {
  const user = userEvent.setup()
  render(<IdentificationPage lookup={lookup} />)
  return {
    user,
    card: () => screen.getByLabelText('Número da carteirinha') as HTMLInputElement,
    cpf: () => screen.getByLabelText('CPF') as HTMLInputElement,
    submit: () => screen.getByRole('button', { name: /Continuar|Consultando/ }),
  }
}

async function fillAndSubmit(ui: ReturnType<typeof setup>, card = '100001', cpf = '10000000108') {
  await ui.user.type(ui.card(), card)
  await ui.user.type(ui.cpf(), cpf)
  await ui.user.click(ui.submit())
}

describe('IdentificationPage', () => {
  it('estado inicial: campos vazios, teclado numérico, botão para continuar', () => {
    const lookup = vi.fn<LookupFn>()
    const ui = setup(lookup)

    expect(ui.card().value).toBe('')
    expect(ui.cpf().value).toBe('')
    expect(ui.card().inputMode).toBe('numeric')
    expect(ui.cpf().inputMode).toBe('numeric')
    expect(ui.submit().textContent).toContain('Continuar')
    expect(lookup).not.toHaveBeenCalled()
  })

  it('aplica a máscara de CPF enquanto digita e ao colar', async () => {
    const ui = setup(vi.fn<LookupFn>())
    await ui.user.type(ui.cpf(), '12345678909')
    expect(ui.cpf().value).toBe('123.456.789-09')

    await ui.user.clear(ui.cpf())
    await ui.user.click(ui.cpf())
    await ui.user.paste('987.654.321-00 sobra')
    expect(ui.cpf().value).toBe('987.654.321-00')
  })

  it('envio vazio mostra erros associados aos campos, foca o primeiro e não consulta', async () => {
    const lookup = vi.fn<LookupFn>()
    const ui = setup(lookup)
    await ui.user.click(ui.submit())

    expect(lookup).not.toHaveBeenCalled()
    const cardError = screen.getByText('Informe o número da carteirinha.')
    const cpfError = screen.getByText('Informe o CPF.')
    expect(ui.card().getAttribute('aria-invalid')).toBe('true')
    expect(ui.card().getAttribute('aria-describedby')).toContain(cardError.closest('p')!.id)
    expect(ui.cpf().getAttribute('aria-describedby')).toContain(cpfError.closest('p')!.id)
    expect(document.activeElement).toBe(ui.card())
  })

  it('CPF incompleto é avisado no campo, e o aviso some ao corrigir', async () => {
    const lookup = vi.fn<LookupFn>()
    const ui = setup(lookup)
    await ui.user.type(ui.card(), '100001')
    await ui.user.type(ui.cpf(), '123')
    await ui.user.click(ui.submit())

    expect(screen.getByText('O CPF deve ter 11 números.')).toBeTruthy()
    expect(document.activeElement).toBe(ui.cpf())
    expect(lookup).not.toHaveBeenCalled()

    await ui.user.type(ui.cpf(), '4')
    expect(screen.queryByText('O CPF deve ter 11 números.')).toBeNull()
    expect(ui.cpf().getAttribute('aria-invalid')).toBeNull()
  })

  it('carregamento: indica a consulta, impede envio duplicado e depois mostra o sucesso', async () => {
    let resolve!: (value: LookupResult) => void
    const lookup = vi.fn<LookupFn>(() => new Promise<LookupResult>((r) => (resolve = r)))
    const ui = setup(lookup)
    await fillAndSubmit(ui, '100001', '100.000.001-08')

    expect(lookup).toHaveBeenCalledTimes(1)
    // CPF vai só com dígitos para o backend.
    expect(lookup).toHaveBeenCalledWith({ membershipNumber: '100001', cpf: '10000000108' })
    expect(ui.submit().textContent).toContain('Consultando')
    expect(ui.submit().getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByRole('status').textContent).toContain('Consultando')

    await ui.user.click(ui.submit())
    await ui.user.keyboard('{Enter}')
    expect(lookup).toHaveBeenCalledTimes(1)

    resolve(activeResult)
    const heading = await screen.findByRole('heading', { name: 'Identificação confirmada' })
    await waitFor(() => expect(document.activeElement).toBe(heading))
  })

  it('sucesso: mostra titular, carteirinha e CPF mascarado; nada sensível; próxima etapa indisponível', async () => {
    const ui = setup(vi.fn<LookupFn>(async () => activeResult))
    await fillAndSubmit(ui)

    await screen.findByRole('heading', { name: 'Identificação confirmada' })
    expect(screen.getByText('Ana Teste Almeida')).toBeTruthy()
    expect(screen.getByText('100001')).toBeTruthy()
    expect(screen.getByText('***.***.***-08')).toBeTruthy()
    expect(screen.getByText(/2 pessoas/)).toBeTruthy()

    const text = document.body.textContent ?? ''
    expect(text).not.toContain('token-secreto-da-sessao')
    expect(text).not.toContain('10000000108')
    expect(text).not.toContain('100.000.001-08')

    const next = screen.getByRole('button', { name: /Escolher pessoas/ })
    expect((next as HTMLButtonElement).disabled).toBe(true)
  })

  it('"Consultar outro cadastro" volta ao início com campos limpos', async () => {
    const ui = setup(vi.fn<LookupFn>(async () => activeResult))
    await fillAndSubmit(ui)
    await ui.user.click(await screen.findByRole('button', { name: 'Consultar outro cadastro' }))

    expect(ui.card().value).toBe('')
    expect(ui.cpf().value).toBe('')
    expect(screen.queryByText('Ana Teste Almeida')).toBeNull()
  })

  it('associado não encontrado: aviso amigável, foco no aviso e dados mantidos', async () => {
    const lookup = vi.fn<LookupFn>(async () => {
      throw new ConvexError({ code: 'identification_failed', message: 'texto do backend' })
    })
    const ui = setup(lookup)
    await fillAndSubmit(ui)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Não encontramos o seu cadastro')
    expect(alert.textContent).toMatch(/Confira o número da carteirinha e o CPF/)
    await waitFor(() => expect(document.activeElement).toBe(alert))
    expect(ui.card().value).toBe('100001')
    expect(ui.cpf().value).toBe('100.000.001-08')
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).toBeNull()
  })

  it('associado inativo: informa que a situação não permite prosseguir', async () => {
    const ui = setup(vi.fn<LookupFn>(async () => inactiveResult))
    await fillAndSubmit(ui, '900004', '90000000418')

    const heading = await screen.findByRole('heading', {
      name: 'Situação cadastral não permite prosseguir',
    })
    await waitFor(() => expect(document.activeElement).toBe(heading))
    expect(screen.getByText(/O cadastro do titular não está ativo/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Escolher pessoas/ })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Identificação confirmada' })).toBeNull()
  })

  it('erro de comunicação: mensagem amigável sem detalhes internos e nova tentativa com os mesmos dados', async () => {
    const lookup = vi
      .fn<LookupFn>()
      .mockRejectedValueOnce(
        new Error('[CONVEX A(public/members:lookup)] Server Error stack interno'),
      )
      .mockResolvedValueOnce(activeResult)
    const ui = setup(lookup)
    await fillAndSubmit(ui)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Não foi possível consultar agora')
    expect(alert.textContent).not.toMatch(/Convex|CONVEX|Server Error|stack|lookup/)
    expect(ui.card().value).toBe('100001')

    await ui.user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    await screen.findByRole('heading', { name: 'Identificação confirmada' })
    expect(lookup).toHaveBeenCalledTimes(2)
    expect(lookup).toHaveBeenLastCalledWith({ membershipNumber: '100001', cpf: '10000000108' })
  })

  it('erro de formato do backend aparece no campo, com foco', async () => {
    const lookup = vi.fn<LookupFn>(async () => {
      throw new ConvexError({ code: 'invalid_cpf', message: 'Informe um CPF válido.' })
    })
    const ui = setup(lookup)
    await fillAndSubmit(ui, '100001', '11111111111')

    expect(await screen.findByText('Informe um CPF válido.')).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(ui.cpf()))
    expect(ui.cpf().getAttribute('aria-invalid')).toBe('true')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('limite de tentativas: mostra o aviso do backend', async () => {
    const lookup = vi.fn<LookupFn>(async () => {
      throw new ConvexError({
        code: 'too_many_attempts',
        message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
        retryAfterSeconds: 600,
      })
    })
    const ui = setup(lookup)
    await fillAndSubmit(ui)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Muitas tentativas')
  })

  it('envia pelo teclado (Enter no último campo)', async () => {
    const lookup = vi.fn<LookupFn>(async () => activeResult)
    const ui = setup(lookup)
    await ui.user.type(ui.card(), '100001')
    await ui.user.type(ui.cpf(), '10000000108{Enter}')

    await screen.findByRole('heading', { name: 'Identificação confirmada' })
    expect(lookup).toHaveBeenCalledTimes(1)
  })
})
