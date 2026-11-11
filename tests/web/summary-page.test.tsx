// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConvexError } from 'convex/values'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Id } from '../../convex/_generated/dataModel'
import type { IdentifiedMember } from '../../src/features/identification/lib/lookup-outcome'
import type {
  CreateOperationFn,
  CreateOperationResult,
  GetOperationFn,
  OperationView,
} from '../../src/features/summary/api/create-operation'
import { SummaryPage } from '../../src/features/summary/components/summary-page'
import type {
  ConfirmationRequest,
  CreatedOperation,
} from '../../src/features/summary/lib/created-operation'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  window.sessionStorage.clear()
})

const id = (value: string) => value as Id<'householdLinks'>
const TODAY = '2026-11-11'
const USAGE_DATE = '2026-11-20'
const EXPIRES_AT = Date.UTC(2026, 10, 11, 21, 45, 0)

const member: IdentifiedMember = {
  memberId: 'member-1' as Id<'members'>,
  membershipNumber: '100003',
  cpfMasked: '***.***.***-61',
  holderName: 'Daniela Modelo Lima',
  selectablePeopleCount: 3,
  people: [
    { linkId: id('l-holder'), name: 'Daniela Modelo Lima', kind: 'holder', selectable: true },
    { linkId: id('l-eduardo'), name: 'Eduardo Modelo Lima', kind: 'dependent', selectable: true },
    { linkId: id('l-fernanda'), name: 'Fernanda Modelo Lima', kind: 'dependent', selectable: true },
  ],
  session: { token: 'token-da-sessao', expiresAt: Date.now() + 1_800_000 },
}

const created = (patch: Partial<CreateOperationResult> = {}): CreateOperationResult => ({
  operationId: 'op-1' as Id<'paymentOperations'>,
  accessToken: 'a'.repeat(64),
  usageDate: USAGE_DATE,
  quantity: 2,
  unitAmountCents: 3000,
  totalAmountCents: 6000,
  expiresAt: EXPIRES_AT,
  people: [
    { name: 'Daniela Modelo Lima', role: 'holder' },
    { name: 'Fernanda Modelo Lima', role: 'child' },
  ],
  reused: false,
  ...patch,
})

const view = (patch: Partial<OperationView> = {}): OperationView => ({
  operationId: 'op-1' as Id<'paymentOperations'>,
  usageDate: USAGE_DATE,
  quantity: 2,
  unitAmountCents: 3000,
  totalAmountCents: 6000,
  expiresAt: EXPIRES_AT,
  operationalStatus: 'awaiting_payment',
  financialStatus: 'unpaid',
  presentation: { code: 'awaiting_payment', message: 'Aguardando o pagamento.' },
  people: [],
  receiptNumber: null,
  payment: null,
  ...patch,
})

const backendError = (code: string, message: string, extra: Record<string, unknown> = {}) =>
  new ConvexError({ code, message, ...extra })

interface HarnessProps {
  create: CreateOperationFn
  getState?: GetOperationFn
  selected?: Id<'householdLinks'>[]
  usageDate?: string | null
  initialRequest?: ConfirmationRequest | null
  newRequestId?: () => string
  getToday?: () => string
  onCreated?: (operation: CreatedOperation) => void
  onBack?: () => void
  onReviewPeople?: () => void
  onChangeDate?: () => void
  onSessionExpired?: () => void
  onRequestChange?: (request: ConfirmationRequest | null) => void
}

function Harness({
  create,
  getState,
  selected = [id('l-holder'), id('l-fernanda')],
  usageDate = USAGE_DATE,
  initialRequest = null,
  newRequestId,
  getToday,
  onCreated,
  onBack,
  onReviewPeople,
  onChangeDate,
  onSessionExpired,
  onRequestChange,
}: HarnessProps) {
  // A tentativa mora fora da página (na jornada): aqui um estado do harness faz esse papel.
  const [request, setRequest] = useState<ConfirmationRequest | null>(initialRequest)
  return (
    <SummaryPage
      member={member}
      selectedLinkIds={selected}
      usageDate={usageDate}
      request={request}
      onRequestChange={(next) => {
        setRequest(next)
        onRequestChange?.(next)
      }}
      onCreated={(operation) => onCreated?.(operation)}
      onBack={onBack ?? (() => {})}
      onReviewPeople={onReviewPeople ?? (() => {})}
      onChangeDate={onChangeDate ?? (() => {})}
      onSessionExpired={onSessionExpired ?? (() => {})}
      create={create}
      getState={getState}
      newRequestId={newRequestId}
      getToday={getToday ?? (() => TODAY)}
    />
  )
}

function setup(props: Partial<HarnessProps> = {}) {
  const create = props.create ?? vi.fn<CreateOperationFn>(async () => created())
  const user = userEvent.setup()
  render(<Harness {...props} create={create} />)
  return {
    user,
    create: create as ReturnType<typeof vi.fn<CreateOperationFn>>,
    button: () => screen.getByRole('button', { name: /Continuar para pagamento|Criando|Abrindo/ }),
    confirm: () =>
      userEvent.click(screen.getByRole('button', { name: 'Continuar para pagamento' })),
  }
}

describe('SummaryPage — conteúdo', () => {
  it('mostra título, orientação e a etapa', () => {
    setup()
    expect(screen.getByRole('heading', { level: 1, name: 'Revise sua operação' })).toBeTruthy()
    expect(screen.getByText('Confira os dados antes de continuar para o pagamento.')).toBeTruthy()
    expect(screen.getByText('Etapa 4 · Resumo')).toBeTruthy()
  })

  it('mostra a data de utilização no formato brasileiro, sem deslocar o dia', () => {
    setup()
    const section = screen.getByRole('region', { name: 'Data de utilização' })
    expect(within(section).getByText('20/11/2026')).toBeTruthy()
    expect(within(section).getByText(/sexta-feira, 20 de novembro de 2026/)).toBeTruthy()
  })

  it('mostra só as pessoas escolhidas, com vínculo e valor unitário em cartões', () => {
    setup()
    const section = screen.getByRole('region', { name: 'Pessoas selecionadas' })
    const cards = within(section).getAllByRole('listitem')
    expect(cards).toHaveLength(2)
    expect(within(cards[0]!).getByText('Daniela Modelo Lima')).toBeTruthy()
    expect(within(cards[0]!).getByText('Titular')).toBeTruthy()
    expect(within(cards[1]!).getByText('Fernanda Modelo Lima')).toBeTruthy()
    expect(within(cards[1]!).getByText('Dependente')).toBeTruthy()
    for (const card of cards) expect(within(card).getByText('R$ 30,00')).toBeTruthy()
    expect(screen.queryByText('Eduardo Modelo Lima')).toBeNull()
  })

  it('resumo financeiro: quantidade, valor unitário de referência e total', () => {
    setup()
    const bar = screen.getByRole('region', { name: 'Resumo financeiro' })
    expect(within(bar).getByText('Quantidade de pessoas').nextElementSibling?.textContent).toBe('2')
    expect(
      within(bar).getByText('Valor unitário de referência').nextElementSibling?.textContent,
    ).toBe('R$ 30,00')
    expect(within(bar).getByText('Valor total').nextElementSibling?.textContent).toBe('R$ 60,00')
  })

  it('a quantidade e o total seguem o número de pessoas escolhidas', () => {
    setup({ selected: [id('l-holder'), id('l-eduardo'), id('l-fernanda')] })
    const bar = screen.getByRole('region', { name: 'Resumo financeiro' })
    expect(within(bar).getByText('Quantidade de pessoas').nextElementSibling?.textContent).toBe('3')
    expect(within(bar).getByText('Valor total').nextElementSibling?.textContent).toBe('R$ 90,00')
  })

  it('deixa claro que o valor oficial é o do sistema e que o prazo só começa ao criar', () => {
    setup()
    expect(
      screen.getByText(/calculado e confirmado pelo sistema.*só começa quando a operação é criada/),
    ).toBeTruthy()
    // A aceitação provisória de datas continua explícita.
    expect(screen.getByTestId('provisional-rule-note')).toBeTruthy()
  })

  it('o botão principal tem o texto exato e a barra respeita a área segura do aparelho', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Continuar para pagamento' })).toBeTruthy()
    const bar = screen.getByRole('region', { name: 'Resumo financeiro' })
    expect(bar.className).toContain('env(safe-area-inset-bottom)')
    expect(bar.className).toContain('fixed')
    expect(bar.className).toContain('md:static')
  })

  it('"Voltar", "Alterar a data" e "Alterar as pessoas" acionam a navegação', async () => {
    const onBack = vi.fn()
    const onChangeDate = vi.fn()
    const onReviewPeople = vi.fn()
    const ui = setup({ onBack, onChangeDate, onReviewPeople })
    await ui.user.click(screen.getByRole('button', { name: 'Voltar' }))
    await ui.user.click(screen.getByRole('button', { name: /Alterar a data/ }))
    await ui.user.click(screen.getByRole('button', { name: /Alterar as pessoas/ }))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onChangeDate).toHaveBeenCalledTimes(1)
    expect(onReviewPeople).toHaveBeenCalledTimes(1)
  })
})

describe('SummaryPage — bloqueio sem informação válida', () => {
  it('sem pessoas: botão desabilitado, explica o motivo e não chama o backend', async () => {
    const ui = setup({ selected: [] })
    const button = screen.getByRole('button', { name: 'Continuar para pagamento' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Selecione ao menos uma pessoa para continuar.')).toBeTruthy()
    await ui.user.click(button)
    expect(ui.create).not.toHaveBeenCalled()
  })

  it('sem data: botão desabilitado, explica o motivo e não chama o backend', async () => {
    const ui = setup({ usageDate: null })
    const button = screen.getByRole('button', { name: 'Continuar para pagamento' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Escolha a data de utilização para continuar.')).toBeTruthy()
    await ui.user.click(button)
    expect(ui.create).not.toHaveBeenCalled()
  })

  it('data que já passou: bloqueia localmente (o backend ainda revalida)', async () => {
    const ui = setup({ usageDate: '2026-11-10' })
    const button = screen.getByRole('button', { name: 'Continuar para pagamento' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/Escolha a data novamente/)).toBeTruthy()
    await ui.user.click(button)
    expect(ui.create).not.toHaveBeenCalled()
  })
})

describe('SummaryPage — criação da operação', () => {
  it('chama o backend UMA vez, só com identificação, pessoas, data e requestId (sem valores)', async () => {
    const onCreated = vi.fn()
    const ui = setup({ onCreated, newRequestId: () => 'req-1' })
    await ui.user.click(screen.getByRole('button', { name: 'Continuar para pagamento' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(ui.create).toHaveBeenCalledTimes(1)
    const input = ui.create.mock.calls[0]![0]
    expect(input).toEqual({
      memberId: member.memberId,
      identificationToken: 'token-da-sessao',
      linkIds: [id('l-holder'), id('l-fernanda')],
      usageDate: USAGE_DATE,
      requestId: 'req-1',
    })
    // Nenhum valor financeiro sai do navegador.
    const sent = JSON.stringify(input)
    expect(sent).not.toMatch(/amount|total|valor|price|cents|expiresAt/i)
  })

  it('entrega à jornada o valor total e o prazo OFICIAIS devolvidos pelo backend', async () => {
    const onCreated = vi.fn()
    const create = vi.fn<CreateOperationFn>(async () =>
      created({ totalAmountCents: 7000, unitAmountCents: 3500, expiresAt: 1_900_000_000_000 }),
    )
    const ui = setup({ create, onCreated })
    await ui.user.click(screen.getByRole('button', { name: 'Continuar para pagamento' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(onCreated.mock.calls[0]![0]).toMatchObject({
      operationId: 'op-1',
      totalAmountCents: 7000,
      unitAmountCents: 3500,
      expiresAt: 1_900_000_000_000,
      recovered: false,
    })
  })

  it('a tentativa é descartada depois de criar (não há o que repetir)', async () => {
    const onRequestChange = vi.fn()
    const ui = setup({ onRequestChange, newRequestId: () => 'req-1' })
    await ui.user.click(screen.getByRole('button', { name: 'Continuar para pagamento' }))
    await waitFor(() => expect(onRequestChange).toHaveBeenCalledTimes(2))
    expect(onRequestChange.mock.calls[0]![0]).toMatchObject({ requestId: 'req-1' })
    expect(onRequestChange.mock.calls[1]![0]).toBeNull()
  })

  it('durante a criação: botão inerte, texto de espera e nenhuma navegação para trás', async () => {
    let finish: (value: CreateOperationResult) => void = () => {}
    const create = vi.fn<CreateOperationFn>(
      () => new Promise<CreateOperationResult>((resolve) => (finish = resolve)),
    )
    const onBack = vi.fn()
    const ui = setup({ create, onBack })
    await ui.user.click(screen.getByRole('button', { name: 'Continuar para pagamento' }))

    const busy = await screen.findByRole('button', { name: 'Criando a operação…' })
    expect(busy.getAttribute('aria-disabled')).toBe('true')
    expect((screen.getByRole('button', { name: 'Voltar' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(screen.getByText('Criando a operação. Aguarde.')).toBeTruthy()

    finish(created())
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Abrindo o pagamento…' })).toBeTruthy(),
    )
  })

  it('clique duplo e cliques simultâneos geram uma única chamada', async () => {
    let finish: (value: CreateOperationResult) => void = () => {}
    const create = vi.fn<CreateOperationFn>(
      () => new Promise<CreateOperationResult>((resolve) => (finish = resolve)),
    )
    const onCreated = vi.fn()
    setup({ create, onCreated })
    const button = screen.getByRole('button', { name: 'Continuar para pagamento' })

    fireEvent.click(button)
    fireEvent.click(button)
    fireEvent.doubleClick(button)
    fireEvent.click(button)
    expect(create).toHaveBeenCalledTimes(1)

    finish(created())
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(create).toHaveBeenCalledTimes(1)
  })
})

describe('SummaryPage — resultado desconhecido e recuperação pela mesma chave', () => {
  it('falha de comunicação: não diz que falhou e reaproveita a MESMA chave ao repetir', async () => {
    const create = vi
      .fn<CreateOperationFn>()
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce(created({ reused: true }))
    const getState = vi.fn<GetOperationFn>(async () => view())
    const newRequestId = vi.fn().mockReturnValueOnce('req-1').mockReturnValueOnce('req-2')
    const onCreated = vi.fn()
    const ui = setup({ create, getState, newRequestId, onCreated })

    await ui.user.click(screen.getByRole('button', { name: 'Continuar para pagamento' }))
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Ainda não conseguimos confirmar')).toBeTruthy()
    expect(alert.textContent).toContain('não sabemos se a operação chegou a ser criada')
    expect(alert.textContent).toContain('não cria outra')
    expect(alert.textContent).not.toMatch(/falhou|erro ao criar|não foi criada/i)
    // O erro técnico nunca aparece.
    expect(document.body.textContent).not.toContain('Failed to fetch')
    expect(onCreated).not.toHaveBeenCalled()

    await ui.user.click(screen.getByRole('button', { name: 'Verificar novamente' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))

    expect(create).toHaveBeenCalledTimes(2)
    expect(create.mock.calls[1]![0].requestId).toBe(create.mock.calls[0]![0].requestId)
    expect(create.mock.calls[0]![0].requestId).toBe('req-1')
    expect(newRequestId).toHaveBeenCalledTimes(1)
    // Operação recuperada: o estado oficial é consultado antes de seguir.
    expect(getState).toHaveBeenCalledWith({
      operationId: 'op-1',
      accessToken: 'a'.repeat(64),
    })
    expect(onCreated.mock.calls[0]![0]).toMatchObject({ recovered: true, totalAmountCents: 6000 })
  })

  it('erro técnico do servidor também é tratado como desconhecido, sem expor o texto', async () => {
    const create = vi
      .fn<CreateOperationFn>()
      .mockRejectedValue(new Error('[CONVEX M(public/payments:createOperation)] Server Error'))
    setup({ create })
    await userEvent.click(screen.getByRole('button', { name: 'Continuar para pagamento' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Ainda não conseguimos confirmar')
    expect(document.body.textContent).not.toMatch(/CONVEX|Server Error/)
  })

  it('o foco vai para o aviso quando ele aparece', async () => {
    const create = vi.fn<CreateOperationFn>().mockRejectedValue(new Error('timeout'))
    setup({ create })
    await userEvent.click(screen.getByRole('button', { name: 'Continuar para pagamento' }))
    const alert = await screen.findByRole('alert')
    await waitFor(() => expect(document.activeElement).toBe(alert))
  })

  it('tentativa guardada na jornada (ex.: página remontada) mantém a chave para os mesmos dados', async () => {
    const create = vi.fn<CreateOperationFn>(async () => created({ reused: true }))
    const getState = vi.fn<GetOperationFn>(async () => view())
    const newRequestId = vi.fn(() => 'nao-deveria-ser-usado')
    const ui = setup({
      create,
      getState,
      newRequestId,
      initialRequest: {
        requestId: 'req-guardado',
        usageDate: USAGE_DATE,
        linkIds: [id('l-fernanda'), id('l-holder')],
      },
    })
    await ui.user.click(screen.getByRole('button', { name: 'Continuar para pagamento' }))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create.mock.calls[0]![0].requestId).toBe('req-guardado')
    expect(newRequestId).not.toHaveBeenCalled()
  })

  it('tentativa guardada para OUTRA data ou outras pessoas não é reaproveitada', async () => {
    const create = vi.fn<CreateOperationFn>(async () => created())
    const ui = setup({
      create,
      newRequestId: () => 'req-novo',
      initialRequest: {
        requestId: 'req-antigo',
        usageDate: '2026-11-19',
        linkIds: [id('l-holder'), id('l-fernanda')],
      },
    })
    await ui.user.click(screen.getByRole('button', { name: 'Continuar para pagamento' }))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    expect(create.mock.calls[0]![0].requestId).toBe('req-novo')
  })

  it('operação recuperada que já expirou: não segue e orienta nova solicitação', async () => {
    const create = vi.fn<CreateOperationFn>(async () => created({ reused: true }))
    const getState = vi.fn<GetOperationFn>(async () =>
      view({
        operationalStatus: 'expired',
        presentation: {
          code: 'expired',
          message: 'O prazo de 15 minutos desta operação terminou.',
        },
      }),
    )
    const onCreated = vi.fn()
    const onRequestChange = vi.fn()
    const newRequestId = vi.fn().mockReturnValueOnce('req-1').mockReturnValueOnce('req-2')
    const ui = setup({ create, getState, onCreated, onRequestChange, newRequestId })

    await ui.user.click(screen.getByRole('button', { name: 'Continuar para pagamento' }))
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('O prazo desta operação terminou')).toBeTruthy()
    expect(alert.textContent).toContain('O prazo de 15 minutos desta operação terminou.')
    expect(onCreated).not.toHaveBeenCalled()
    // A tentativa foi descartada: a próxima começa com chave nova.
    expect(onRequestChange).toHaveBeenLastCalledWith(null)

    // O botão do resumo continua disponível; descartar o aviso também.
    await ui.user.click(within(alert).getByRole('button', { name: 'Fazer nova solicitação' }))
    expect(screen.queryByRole('alert')).toBeNull()
    await ui.user.click(screen.getByRole('button', { name: 'Continuar para pagamento' }))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2))
    expect(create.mock.calls[1]![0].requestId).toBe('req-2')
  })

  it('não consegue consultar a operação recuperada: segue desconhecido, mesma chave', async () => {
    const create = vi.fn<CreateOperationFn>(async () => created({ reused: true }))
    const getState = vi.fn<GetOperationFn>().mockRejectedValue(new Error('offline'))
    const onCreated = vi.fn()
    const ui = setup({ create, getState, onCreated, newRequestId: () => 'req-1' })
    await ui.user.click(screen.getByRole('button', { name: 'Continuar para pagamento' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Ainda não conseguimos confirmar')
    expect(onCreated).not.toHaveBeenCalled()

    getState.mockResolvedValueOnce(view())
    await ui.user.click(screen.getByRole('button', { name: 'Verificar novamente' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(create.mock.calls.map((call) => call[0].requestId)).toEqual(['req-1', 'req-1'])
  })

  it('operação nova (não recuperada) não consulta getOperation', async () => {
    const getState = vi.fn<GetOperationFn>(async () => view())
    const onCreated = vi.fn()
    const ui = setup({ getState, onCreated })
    await ui.user.click(screen.getByRole('button', { name: 'Continuar para pagamento' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(getState).not.toHaveBeenCalled()
  })
})

describe('SummaryPage — recusas definitivas do backend', () => {
  it('sessão expirada: pede nova identificação, sem aviso técnico', async () => {
    const create = vi
      .fn<CreateOperationFn>()
      .mockRejectedValue(backendError('session_invalid', 'Identifique-se novamente.'))
    const onSessionExpired = vi.fn()
    const onCreated = vi.fn()
    setup({ create, onSessionExpired, onCreated })
    await userEvent.click(screen.getByRole('button', { name: 'Continuar para pagamento' }))
    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1))
    expect(onCreated).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('data inválida: mostra a mensagem do backend e leva à escolha de outra data', async () => {
    const create = vi
      .fn<CreateOperationFn>()
      .mockRejectedValue(backendError('past_usage_date', 'Essa data já passou.'))
    const onChangeDate = vi.fn()
    const onRequestChange = vi.fn()
    const ui = setup({ create, onChangeDate, onRequestChange })
    await ui.user.click(screen.getByRole('button', { name: 'Continuar para pagamento' }))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Escolha outra data')).toBeTruthy()
    expect(alert.textContent).toContain('Essa data já passou.')
    expect(alert.textContent).toContain('Nenhuma operação foi criada.')
    expect(onRequestChange).toHaveBeenLastCalledWith(null)
    await ui.user.click(within(alert).getByRole('button', { name: 'Escolher outra data' }))
    expect(onChangeDate).toHaveBeenCalledTimes(1)
  })

  it('seleção não elegível: orienta revisar as pessoas', async () => {
    const create = vi
      .fn<CreateOperationFn>()
      .mockRejectedValue(
        backendError('link_inactive', 'Uma das pessoas não pode mais ser incluída.'),
      )
    const onReviewPeople = vi.fn()
    const ui = setup({ create, onReviewPeople })
    await ui.user.click(screen.getByRole('button', { name: 'Continuar para pagamento' }))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Revise as pessoas selecionadas')).toBeTruthy()
    expect(alert.textContent).toContain('Uma das pessoas não pode mais ser incluída.')
    await ui.user.click(within(alert).getByRole('button', { name: 'Revisar pessoas' }))
    expect(onReviewPeople).toHaveBeenCalledTimes(1)
  })

  it('duplicidade: lista só os nomes devolvidos, diz que não criou outra e não sugere pagamento feito', async () => {
    const create = vi.fn<CreateOperationFn>().mockRejectedValue(
      backendError('duplicate_usage', 'Já existe uma operação para esta data.', {
        names: ['Fernanda Modelo Lima'],
        linkIds: ['l-fernanda'],
      }),
    )
    const ui = setup({ create })
    await ui.user.click(screen.getByRole('button', { name: 'Continuar para pagamento' }))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Já existe uma operação para esta data')).toBeTruthy()
    expect(within(alert).getByText('Fernanda Modelo Lima')).toBeTruthy()
    expect(alert.textContent).toContain('não criamos outra')
    expect(alert.textContent).toContain('pendente ou paga')
    expect(alert.textContent).not.toMatch(/pagamento (foi )?(realizado|concluído|confirmado)/i)
    expect(alert.textContent).not.toContain('l-fernanda')
    expect(within(alert).getByRole('button', { name: 'Escolher outra data' })).toBeTruthy()
    expect(within(alert).getByRole('button', { name: 'Revisar pessoas' })).toBeTruthy()
  })

  it('operação pendente após F5: duplicidade amigável, sem erro técnico', async () => {
    // Depois de F5 a jornada recomeça: chave nova, e o backend recusa por já haver operação.
    const create = vi.fn<CreateOperationFn>().mockRejectedValue(
      backendError('duplicate_usage', 'Já existe uma operação para esta data.', {
        names: ['Daniela Modelo Lima', 'Fernanda Modelo Lima'],
      }),
    )
    const onCreated = vi.fn()
    const ui = setup({ create, onCreated })
    await ui.user.click(screen.getByRole('button', { name: 'Continuar para pagamento' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Daniela Modelo Lima')
    expect(alert.textContent).toContain('Fernanda Modelo Lima')
    expect(alert.textContent).toContain('não criamos outra')
    expect(alert.textContent).not.toMatch(/erro|falha|exception/i)
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('depois de uma resposta definitiva, a nova tentativa usa chave NOVA', async () => {
    const create = vi
      .fn<CreateOperationFn>()
      .mockRejectedValueOnce(backendError('duplicate_usage', 'Já existe.', { names: [] }))
      .mockResolvedValueOnce(created())
    const newRequestId = vi.fn().mockReturnValueOnce('req-1').mockReturnValueOnce('req-2')
    const ui = setup({ create, newRequestId })
    await ui.user.click(screen.getByRole('button', { name: 'Continuar para pagamento' }))
    await screen.findByRole('alert')
    await ui.user.click(screen.getByRole('button', { name: 'Continuar para pagamento' }))
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2))
    expect(create.mock.calls.map((call) => call[0].requestId)).toEqual(['req-1', 'req-2'])
  })

  it('a jornada é preservada depois de qualquer falha: mesma data, mesmas pessoas, botão disponível', async () => {
    const failures = [
      backendError('past_usage_date', 'Essa data já passou.'),
      backendError('link_inactive', 'Uma pessoa não pode mais ser incluída.'),
      backendError('duplicate_usage', 'Já existe.', { names: ['Fernanda Modelo Lima'] }),
      new Error('Failed to fetch'),
    ]
    for (const failure of failures) {
      cleanup()
      const create = vi.fn<CreateOperationFn>().mockRejectedValue(failure)
      const onSessionExpired = vi.fn()
      setup({ create, onSessionExpired })
      await userEvent.click(screen.getByRole('button', { name: 'Continuar para pagamento' }))
      await screen.findByRole('alert')

      expect(onSessionExpired).not.toHaveBeenCalled()
      const dateSection = screen.getByRole('region', { name: 'Data de utilização' })
      expect(within(dateSection).getByText('20/11/2026')).toBeTruthy()
      const people = screen.getByRole('region', { name: 'Pessoas selecionadas' })
      expect(within(people).getAllByRole('listitem')).toHaveLength(2)
      const button = screen.getByRole('button', { name: 'Continuar para pagamento' })
      expect((button as HTMLButtonElement).disabled).toBe(false)
      expect(button.getAttribute('aria-disabled')).toBeNull()
    }
  })
})

describe('SummaryPage — sem persistência no navegador', () => {
  it('não usa localStorage, sessionStorage nem cookies, e não coloca nada na URL', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const cookie = vi.spyOn(document, 'cookie', 'set')
    const pushState = vi.spyOn(window.history, 'pushState')
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const onCreated = vi.fn()
    const ui = setup({ onCreated })
    await ui.user.click(screen.getByRole('button', { name: 'Continuar para pagamento' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))

    expect(setItem).not.toHaveBeenCalled()
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
    expect(cookie).not.toHaveBeenCalled()
    expect(pushState).not.toHaveBeenCalled()
    expect(replaceState).not.toHaveBeenCalled()
    expect(window.location.search).toBe('')
    expect(window.location.hash).toBe('')
    vi.restoreAllMocks()
  })

  it('a credencial da operação não aparece na tela', async () => {
    const onCreated = vi.fn()
    const ui = setup({ onCreated })
    await ui.user.click(screen.getByRole('button', { name: 'Continuar para pagamento' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(document.body.textContent).not.toContain('a'.repeat(64))
  })
})
