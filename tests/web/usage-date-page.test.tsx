// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConvexError } from 'convex/values'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Id } from '../../convex/_generated/dataModel'
import type { IdentifiedMember } from '../../src/features/identification/lib/lookup-outcome'
import type {
  CheckDuplicatesResult,
  CheckUsageDateFn,
} from '../../src/features/usage-date/api/check-usage-date'
import { UsageDatePage } from '../../src/features/usage-date/components/usage-date-page'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  window.sessionStorage.clear()
})

const id = (value: string) => value as Id<'householdLinks'>
const TODAY = '2026-11-11'

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

interface HarnessProps {
  check: CheckUsageDateFn
  initialDate?: string | null
  selected?: Id<'householdLinks'>[]
  onBack?: () => void
  onContinue?: () => void
  onSessionExpired?: () => void
  onDateChange?: (value: string | null) => void
  getToday?: () => string
}

function Harness({
  check,
  initialDate = null,
  selected = [id('l-holder'), id('l-fernanda')],
  onBack,
  onContinue,
  onSessionExpired,
  onDateChange,
  getToday,
}: HarnessProps) {
  const [usageDate, setUsageDate] = useState<string | null>(initialDate)
  return (
    <UsageDatePage
      member={member}
      selectedLinkIds={selected}
      usageDate={usageDate}
      onUsageDateChange={(value) => {
        setUsageDate(value)
        onDateChange?.(value)
      }}
      onBack={onBack ?? (() => {})}
      onContinue={onContinue ?? (() => {})}
      onSessionExpired={onSessionExpired ?? (() => {})}
      check={check}
      getToday={getToday ?? (() => TODAY)}
    />
  )
}

const accepted = (usageDate: string): CheckDuplicatesResult => ({
  ok: true,
  usageDate,
  hasConflicts: false,
  conflicts: [],
})

function setup(props: Partial<HarnessProps> = {}) {
  const check = props.check ?? vi.fn<CheckUsageDateFn>(async (input) => accepted(input.usageDate))
  const user = userEvent.setup()
  render(<Harness {...props} check={check} />)
  return {
    user,
    check,
    input: () => screen.getByLabelText('Data de utilização') as HTMLInputElement,
    pick: (value: string) =>
      fireEvent.change(screen.getByLabelText('Data de utilização'), { target: { value } }),
    submit: () => screen.getByRole('button', { name: /Continuar|Validando/ }),
  }
}

describe('UsageDatePage', () => {
  it('mostra título, orientação, pessoas escolhidas e campo de data vazio', () => {
    const ui = setup()

    expect(
      screen.getByRole('heading', { level: 1, name: 'Quando pretende utilizar as piscinas?' }),
    ).toBeTruthy()
    expect(screen.getByText('Etapa 3 · Data')).toBeTruthy()
    expect(ui.input().type).toBe('date')
    expect(ui.input().value).toBe('')
    expect(ui.input().min).toBe(TODAY)
    expect(ui.input().required).toBe(true)
    expect(screen.getByText('Escolha o dia de hoje ou uma data futura.')).toBeTruthy()

    // A seleção da etapa anterior é exibida (só as pessoas escolhidas), sem alterá-la.
    expect(screen.getByRole('heading', { name: 'Pessoas selecionadas' })).toBeTruthy()
    expect(screen.getByText('Daniela Modelo Lima')).toBeTruthy()
    expect(screen.getByText('Fernanda Modelo Lima')).toBeTruthy()
    expect(screen.queryByText('Eduardo Modelo Lima')).toBeNull()
  })

  it('uma única pessoa usa o singular', () => {
    setup({ selected: [id('l-holder')] })
    expect(screen.getByRole('heading', { name: 'Pessoa selecionada' })).toBeTruthy()
  })

  it('sempre explica que a regra é provisória e não confirma funcionamento nem disponibilidade', () => {
    setup()
    const note = screen.getByTestId('provisional-rule-note')
    expect(note.textContent).toContain('Regra provisória')
    expect(note.textContent).toContain('qualquer data a partir de hoje')
    expect(note.textContent).toContain('não confirma')
    expect(note.textContent).toContain('funcionamento')
    expect(note.textContent).toContain('disponíveis')
  })

  it('data vazia: obrigatória, não consulta o backend e mantém o foco no campo', async () => {
    const ui = setup()
    await ui.user.click(ui.submit())

    expect(screen.getByText('Informe a data de utilização.')).toBeTruthy()
    expect(ui.input().getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(ui.input())
    expect(ui.check).not.toHaveBeenCalled()
  })

  it('data passada digitada: bloqueada localmente, sem consultar o backend', async () => {
    const ui = setup()
    ui.pick('2026-11-10')
    await ui.user.click(ui.submit())

    expect(screen.getByText('A data de utilização não pode estar no passado.')).toBeTruthy()
    expect(ui.check).not.toHaveBeenCalled()
  })

  it('corrigir a data limpa o erro', async () => {
    const ui = setup()
    ui.pick('2026-11-10')
    await ui.user.click(ui.submit())
    expect(ui.input().getAttribute('aria-invalid')).toBe('true')

    ui.pick('2026-11-12')
    expect(ui.input().getAttribute('aria-invalid')).toBeNull()
    expect(screen.queryByText('A data de utilização não pode estar no passado.')).toBeNull()
  })

  it('hoje é aceito e a data vai ao backend como texto YYYY-MM-DD, sem conversão', async () => {
    const ui = setup()
    ui.pick(TODAY)
    await ui.user.click(ui.submit())

    await screen.findByText('Data aceita pelo sistema')
    expect(ui.check).toHaveBeenCalledTimes(1)
    const input = vi.mocked(ui.check).mock.calls[0]![0]
    expect(input).toEqual({
      memberId: 'member-1',
      identificationToken: 'token-da-sessao',
      linkIds: ['l-holder', 'l-fernanda'],
      usageDate: '2026-11-11',
    })
    expect(typeof input.usageDate).toBe('string')
    expect(Object.keys(input).sort()).toEqual([
      'identificationToken',
      'linkIds',
      'memberId',
      'usageDate',
    ])
  })

  it('qualquer data futura é aceita (domingo, feriado, ano distante), sem bloqueio local', async () => {
    for (const date of ['2026-11-15', '2026-12-25', '2031-07-04']) {
      const ui = setup()
      ui.pick(date)
      await ui.user.click(ui.submit())
      await screen.findByText('Data aceita pelo sistema')
      expect(vi.mocked(ui.check).mock.calls[0]![0].usageDate).toBe(date)
      cleanup()
    }
  })

  it('data aceita: mostra o dia por extenso, repete a ressalva e libera o resumo', async () => {
    const onContinue = vi.fn()
    const ui = setup({ onContinue })
    ui.pick('2026-11-20')
    await ui.user.click(ui.submit())

    const title = await screen.findByText('Data aceita pelo sistema')
    const alert = title.closest('[data-slot="alert"]') as HTMLElement
    expect(alert.textContent).toContain('sexta-feira, 20 de novembro de 2026')
    expect(alert.textContent).toContain('não confirma que as piscinas estarão em funcionamento')
    await waitFor(() => expect(document.activeElement).toBe(alert))

    const next = screen.getByRole('button', { name: /Ver o resumo/ }) as HTMLButtonElement
    expect(next.disabled).toBe(false)
    expect(screen.queryByText('Esta etapa estará disponível em breve.')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Continuar/ })).toBeNull()
    // A ressalva provisória continua visível.
    expect(screen.getByTestId('provisional-rule-note')).toBeTruthy()

    expect(onContinue).not.toHaveBeenCalled()
    await ui.user.click(next)
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('alterar a data depois de aceita descarta o resultado e exige validar de novo', async () => {
    const ui = setup()
    ui.pick('2026-11-20')
    await ui.user.click(ui.submit())
    await screen.findByText('Data aceita pelo sistema')

    ui.pick('2026-11-21')
    expect(screen.queryByText('Data aceita pelo sistema')).toBeNull()
    expect(ui.submit().textContent).toContain('Continuar')

    await ui.user.click(ui.submit())
    await waitFor(() => expect(ui.check).toHaveBeenCalledTimes(2))
    expect(vi.mocked(ui.check).mock.calls[1]![0].usageDate).toBe('2026-11-21')
  })

  it('carregando: indicação visual, sem validação duplicada e com a data travada', async () => {
    let resolve!: (result: CheckDuplicatesResult) => void
    const check = vi.fn<CheckUsageDateFn>(
      () => new Promise<CheckDuplicatesResult>((r) => (resolve = r)),
    )
    const ui = setup({ check })
    ui.pick('2026-11-20')
    await ui.user.click(ui.submit())

    expect(ui.submit().textContent).toContain('Validando')
    expect(ui.submit().getAttribute('aria-disabled')).toBe('true')
    expect(ui.input().readOnly).toBe(true)
    await ui.user.click(ui.submit())
    ui.pick('2026-11-25') // tentativa de trocar a data durante a validação
    expect(check).toHaveBeenCalledTimes(1)
    expect(ui.input().value).toBe('2026-11-20')
    expect((screen.getByRole('button', { name: 'Voltar' }) as HTMLButtonElement).disabled).toBe(
      true,
    )

    resolve(accepted('2026-11-20'))
    expect(await screen.findByText('Data aceita pelo sistema')).toBeTruthy()
  })

  it('conflito: lista só os nomes devolvidos pelo backend e não deixa avançar', async () => {
    const check = vi.fn<CheckUsageDateFn>(async (input) => ({
      ok: true,
      usageDate: input.usageDate,
      hasConflicts: true,
      conflicts: [{ linkId: id('l-fernanda'), name: 'Fernanda Modelo Lima' }],
    }))
    const ui = setup({ check })
    ui.pick('2026-11-20')
    await ui.user.click(ui.submit())

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Já existe pagamento ou cobrança nesta data')
    const items = Array.from(alert.querySelectorAll('li')).map((li) => li.textContent)
    expect(items).toEqual(['Fernanda Modelo Lima'])
    expect(alert.textContent).toContain('Escolha outra data ou volte')
    // Nada além do que o backend informou: sem dono da operação, valor, id ou estado.
    expect(alert.textContent).not.toMatch(/R\$|l-fernanda|titular de|operação de/i)
    await waitFor(() => expect(document.activeElement).toBe(alert))

    expect(screen.queryByRole('button', { name: /Ver o resumo/ })).toBeNull()
    expect(ui.submit().textContent).toContain('Continuar')
  })

  it('conflito sem nomes usa texto genérico, sem inventar pessoas', async () => {
    const check = vi.fn<CheckUsageDateFn>(async (input) => ({
      ok: true,
      usageDate: input.usageDate,
      hasConflicts: true,
      conflicts: [],
    }))
    const ui = setup({ check })
    ui.pick('2026-11-20')
    await ui.user.click(ui.submit())

    const alert = await screen.findByRole('alert')
    expect(alert.querySelectorAll('li')).toHaveLength(0)
    expect(alert.textContent).toContain('para uma das pessoas nesta data')
  })

  it('trocar a data depois de um conflito limpa o aviso e permite nova consulta', async () => {
    const check = vi
      .fn<CheckUsageDateFn>()
      .mockResolvedValueOnce({
        ok: true,
        usageDate: '2026-11-20',
        hasConflicts: true,
        conflicts: [{ linkId: id('l-holder'), name: 'Daniela Modelo Lima' }],
      })
      .mockResolvedValueOnce(accepted('2026-11-21'))
    const ui = setup({ check })
    ui.pick('2026-11-20')
    await ui.user.click(ui.submit())
    await screen.findByText('Já existe pagamento ou cobrança nesta data')

    ui.pick('2026-11-21')
    expect(screen.queryByText('Já existe pagamento ou cobrança nesta data')).toBeNull()
    await ui.user.click(ui.submit())
    await screen.findByText('Data aceita pelo sistema')
  })

  it('recusa do backend (ex.: relógio do aparelho adiantado): mostra o texto dele e mantém a data', async () => {
    const check = vi.fn<CheckUsageDateFn>(async () => ({
      ok: false,
      code: 'past_usage_date',
      message: 'A data de utilização não pode estar no passado.',
    }))
    const ui = setup({ check, getToday: () => '2026-11-01' })
    ui.pick('2026-11-05')
    await ui.user.click(ui.submit())

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Revise a data')
    expect(alert.textContent).toContain('A data de utilização não pode estar no passado.')
    expect(ui.input().value).toBe('2026-11-05')
  })

  it('erro de comunicação: mensagem amigável sem detalhes internos e nova tentativa', async () => {
    const check = vi
      .fn<CheckUsageDateFn>()
      .mockRejectedValueOnce(new Error('[CONVEX Q(public/payments:checkDuplicates)] Server Error'))
      .mockResolvedValueOnce(accepted('2026-11-20'))
    const ui = setup({ check })
    ui.pick('2026-11-20')
    await ui.user.click(ui.submit())

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Não foi possível validar agora')
    expect(alert.textContent).not.toMatch(/Convex|CONVEX|Server Error|checkDuplicates/)
    expect(ui.input().value).toBe('2026-11-20')

    await ui.user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    await screen.findByText('Data aceita pelo sistema')
    expect(check).toHaveBeenCalledTimes(2)
  })

  it('sessão expirada ou inválida: avisa o fluxo para pedir nova identificação', async () => {
    const onSessionExpired = vi.fn()
    const check = vi.fn<CheckUsageDateFn>(async () => {
      throw new ConvexError({ code: 'session_invalid', message: 'Sua identificação expirou.' })
    })
    const ui = setup({ check, onSessionExpired })
    ui.pick('2026-11-20')
    await ui.user.click(ui.submit())

    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('titular não encontrado no backend também pede nova identificação', async () => {
    const onSessionExpired = vi.fn()
    const check = vi.fn<CheckUsageDateFn>(async () => ({
      ok: false,
      code: 'member_not_found',
      message: 'Identifique-se novamente.',
    }))
    const ui = setup({ check, onSessionExpired })
    ui.pick('2026-11-20')
    await ui.user.click(ui.submit())

    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1))
  })

  it('"Voltar" devolve o controle à seleção de pessoas', async () => {
    const onBack = vi.fn()
    const ui = setup({ onBack })
    await ui.user.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(ui.check).not.toHaveBeenCalled()
  })

  it('data já escolhida (voltando de outra etapa) é preservada no campo', () => {
    const ui = setup({ initialDate: '2026-11-20' })
    expect(ui.input().value).toBe('2026-11-20')
  })

  it('a escolha é informada à jornada como texto YYYY-MM-DD; limpar o campo informa null', () => {
    const onDateChange = vi.fn()
    const ui = setup({ onDateChange })
    ui.pick('2026-11-20')
    ui.pick('')
    expect(onDateChange.mock.calls).toEqual([['2026-11-20'], [null]])
  })

  it('não usa armazenamento do navegador nem exibe a prova de identificação', async () => {
    const ui = setup()
    ui.pick('2026-11-20')
    await ui.user.click(ui.submit())
    await screen.findByText('Data aceita pelo sistema')

    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
    expect(document.cookie).toBe('')
    expect(document.body.textContent).not.toContain('token-da-sessao')
  })
})
