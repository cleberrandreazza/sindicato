// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConvexError } from 'convex/values'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Id } from '../../convex/_generated/dataModel'
import type { IdentifiedMember } from '../../src/features/identification/lib/lookup-outcome'
import type {
  ValidateSelectionFn,
  ValidateSelectionResult,
} from '../../src/features/selection/api/validate-selection'
import { SelectionPage } from '../../src/features/selection/components/selection-page'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  window.sessionStorage.clear()
})

const id = (value: string) => value as Id<'householdLinks'>

const member: IdentifiedMember = {
  memberId: 'member-1' as Id<'members'>,
  membershipNumber: '100003',
  cpfMasked: '***.***.***-61',
  holderName: 'Daniela Modelo Lima',
  selectablePeopleCount: 3,
  people: [
    { linkId: id('l-holder'), name: 'Daniela Modelo Lima', kind: 'holder', selectable: true },
    { linkId: id('l-eduardo'), name: 'Eduardo Modelo Lima', kind: 'dependent', selectable: true },
    { linkId: id('l-helena'), name: 'Helena Modelo Lima', kind: 'dependent', selectable: false },
    { linkId: id('l-fernanda'), name: 'Fernanda Modelo Lima', kind: 'dependent', selectable: true },
  ],
  session: { token: 'token-da-sessao', expiresAt: Date.now() + 1_800_000 },
}

interface HarnessProps {
  validate: ValidateSelectionFn
  onBack?: () => void
  onContinue?: () => void
  onSessionExpired?: () => void
  initial?: Id<'householdLinks'>[]
}

/** A página é controlada; o harness faz o papel do contexto da jornada. */
function Harness({ validate, onBack, onContinue, onSessionExpired, initial = [] }: HarnessProps) {
  const [selected, setSelected] = useState<readonly Id<'householdLinks'>[]>(initial)
  return (
    <SelectionPage
      member={member}
      selectedLinkIds={selected}
      onSelectionChange={setSelected}
      onBack={onBack ?? (() => {})}
      onContinue={onContinue ?? (() => {})}
      onSessionExpired={onSessionExpired ?? (() => {})}
      validate={validate}
    />
  )
}

const validResult = (quantity: number): ValidateSelectionResult => ({
  ok: true,
  quantity,
  people: [],
})

function setup(props: Partial<HarnessProps> = {}) {
  const validate = props.validate ?? vi.fn<ValidateSelectionFn>(async () => validResult(1))
  const onContinue = props.onContinue ?? vi.fn()
  const user = userEvent.setup()
  render(<Harness {...props} validate={validate} onContinue={onContinue} />)
  return {
    user,
    validate,
    onContinue,
    /** Aguarda a passagem para a etapa da data (a rota faz a navegação de fato). */
    async expectContinued(times = 1) {
      await waitFor(() => expect(onContinue).toHaveBeenCalledTimes(times))
    },
    card: (name: RegExp | string) => screen.getByRole('checkbox', { name }) as HTMLInputElement,
    continueButton: () => screen.getByRole('button', { name: /Continuar|Continuando|Validando/ }),
    summary: () => screen.getByRole('region', { name: 'Resumo da seleção' }),
  }
}

describe('SelectionPage', () => {
  it('mostra título, texto auxiliar e um cartão por pessoa, sem ninguém pré-selecionado', () => {
    const ui = setup()

    expect(
      screen.getByRole('heading', { level: 1, name: 'Quem utilizará as piscinas?' }),
    ).toBeTruthy()
    expect(
      screen.getByText(
        'Selecione o titular e os dependentes que utilizarão as piscinas na data escolhida.',
      ),
    ).toBeTruthy()
    expect(screen.getAllByRole('checkbox')).toHaveLength(4)
    for (const checkbox of screen.getAllByRole('checkbox') as HTMLInputElement[]) {
      expect(checkbox.checked).toBe(false)
    }

    const holder = ui.card(/Daniela/).closest('label')!
    expect(within(holder).getByText('Titular')).toBeTruthy()
    expect(within(holder).getByText('Elegível')).toBeTruthy()
    const dependent = ui.card(/Eduardo/).closest('label')!
    expect(within(dependent).getByText('Dependente')).toBeTruthy()
  })

  it('sem seleção: total zerado, orientação clara e botão de continuar desabilitado', () => {
    const ui = setup()

    expect((ui.continueButton() as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Selecione ao menos uma pessoa para continuar.')).toBeTruthy()
    expect(within(ui.summary()).getByText('R$ 0,00')).toBeTruthy()
    expect(ui.continueButton().getAttribute('aria-describedby')).toBe('selection-guidance')
  })

  it('dependente inelegível aparece desabilitado, com justificativa, e não pode ser selecionado', async () => {
    const ui = setup()
    const helena = ui.card(/Helena/)

    expect(helena.disabled).toBe(true)
    const label = helena.closest('label')!
    expect(within(label).getByText('Não elegível')).toBeTruthy()
    expect(within(label).getByText(/Cadastro inativo no momento/)).toBeTruthy()
    expect(helena.getAttribute('aria-describedby')).toBeTruthy()

    await ui.user.click(label)
    expect(helena.checked).toBe(false)
    expect(within(ui.summary()).getByText('R$ 0,00')).toBeTruthy()
  })

  it('tocar em qualquer parte do cartão marca/desmarca e o resumo atualiza em tempo real', async () => {
    const ui = setup()

    await ui.user.click(screen.getByText('Eduardo Modelo Lima')) // toca no nome, não no controle
    expect(ui.card(/Eduardo/).checked).toBe(true)
    expect(within(ui.summary()).getByText('R$ 30,00', { selector: 'dd.text-2xl' })).toBeTruthy()

    await ui.user.click(screen.getByText('Daniela Modelo Lima'))
    const summary = within(ui.summary())
    expect(summary.getByText('2')).toBeTruthy()
    expect(summary.getByText('R$ 60,00')).toBeTruthy()
    expect(summary.getAllByText('R$ 30,00')).toHaveLength(1) // valor unitário

    await ui.user.click(screen.getByText('Eduardo Modelo Lima'))
    expect(ui.card(/Eduardo/).checked).toBe(false)
    expect(summary.getByText('R$ 30,00', { selector: 'dd.text-2xl' })).toBeTruthy()
    expect(screen.queryByText('Selecione ao menos uma pessoa para continuar.')).toBeNull()
  })

  it('funciona pelo teclado (foco no controle + Espaço)', async () => {
    const ui = setup()
    await ui.user.tab() // Voltar
    await ui.user.tab() // primeiro cartão
    expect(document.activeElement).toBe(ui.card(/Daniela/))
    await ui.user.keyboard(' ')
    expect(ui.card(/Daniela/).checked).toBe(true)
    await ui.user.keyboard(' ')
    expect(ui.card(/Daniela/).checked).toBe(false)
  })

  it('continuar valida no backend só com identificadores de vínculo e a prova, nunca valores', async () => {
    let resolve!: (value: ValidateSelectionResult) => void
    const validate = vi.fn<ValidateSelectionFn>(() => new Promise((r) => (resolve = r)))
    const ui = setup({ validate })
    await ui.user.click(screen.getByText('Fernanda Modelo Lima'))
    await ui.user.click(screen.getByText('Daniela Modelo Lima'))
    await ui.user.click(ui.continueButton())

    expect(validate).toHaveBeenCalledTimes(1)
    const input = validate.mock.calls[0]![0]
    // Na ordem da lista, e apenas estes campos.
    expect(input).toEqual({
      memberId: 'member-1',
      identificationToken: 'token-da-sessao',
      linkIds: ['l-holder', 'l-fernanda'],
    })
    expect(Object.keys(input).sort()).toEqual(['identificationToken', 'linkIds', 'memberId'])

    // Carregando: indicação visual, sem validação duplicada, seleção travada.
    expect(ui.continueButton().textContent).toContain('Validando')
    expect(ui.continueButton().getAttribute('aria-disabled')).toBe('true')
    await ui.user.click(ui.continueButton())
    await ui.user.click(screen.getByText('Eduardo Modelo Lima'))
    expect(validate).toHaveBeenCalledTimes(1)
    expect(ui.card(/Eduardo/).checked).toBe(false)

    resolve(validResult(2))
    await ui.expectContinued()
  })

  it('seleção válida: segue para a escolha da data, sem sobras e sem usar armazenamento do navegador', async () => {
    const ui = setup({ validate: vi.fn<ValidateSelectionFn>(async () => validResult(2)) })
    await ui.user.click(screen.getByText('Daniela Modelo Lima'))
    await ui.user.click(screen.getByText('Fernanda Modelo Lima'))
    await ui.user.click(ui.continueButton())

    await ui.expectContinued()
    // Enquanto a rota troca de tela, o botão fica inerte e não se oferece outra validação.
    expect(ui.continueButton().textContent).toContain('Continuando')
    expect(ui.continueButton().getAttribute('aria-disabled')).toBe('true')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: /Informar a data/ })).toBeNull()

    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
    expect(document.cookie).toBe('')
    expect(document.body.textContent).not.toContain('token-da-sessao')
  })

  it('seleção recusada ou indisponível não segue para a data', async () => {
    const onContinue = vi.fn()
    const validate = vi.fn<ValidateSelectionFn>(async () => ({
      ok: false,
      code: 'link_inactive',
      message: 'Uma das pessoas selecionadas não está ativa no cadastro.',
    }))
    const ui = setup({ validate, onContinue })
    await ui.user.click(screen.getByText('Daniela Modelo Lima'))
    await ui.user.click(ui.continueButton())
    await screen.findByText('Revise a seleção')
    expect(onContinue).not.toHaveBeenCalled()
  })

  it('alterar a seleção depois de validar exige validar de novo', async () => {
    const ui = setup({ validate: vi.fn<ValidateSelectionFn>(async () => validResult(1)) })
    await ui.user.click(screen.getByText('Daniela Modelo Lima'))
    await ui.user.click(ui.continueButton())
    await ui.expectContinued()
    expect(ui.continueButton().textContent).toContain('Continuando')

    await ui.user.click(screen.getByText('Eduardo Modelo Lima'))
    expect(ui.continueButton().textContent).toContain('Continuar')
    expect(ui.continueButton().textContent).not.toContain('Continuando')
  })

  it('o titular é opcional: só dependentes podem ser validados, sem o titular', async () => {
    const validate = vi.fn<ValidateSelectionFn>(async () => validResult(2))
    const ui = setup({ validate })
    await ui.user.click(screen.getByText('Eduardo Modelo Lima'))
    await ui.user.click(screen.getByText('Fernanda Modelo Lima'))
    expect(ui.card(/Daniela/).checked).toBe(false)
    await ui.user.click(ui.continueButton())

    expect(validate.mock.calls[0]![0].linkIds).toEqual(['l-eduardo', 'l-fernanda'])
    await ui.expectContinued()
  })

  it('o titular sozinho também pode ser validado, sem nenhum dependente', async () => {
    const validate = vi.fn<ValidateSelectionFn>(async () => validResult(1))
    const ui = setup({ validate })
    await ui.user.click(screen.getByText('Daniela Modelo Lima'))
    expect(within(ui.summary()).getAllByText('R$ 30,00')).toHaveLength(2) // unitário e total
    await ui.user.click(ui.continueButton())

    expect(validate.mock.calls[0]![0].linkIds).toEqual(['l-holder'])
    await ui.expectContinued()
  })

  it('só dependentes marcados e depois desmarcados bloqueiam a continuidade de novo', async () => {
    const ui = setup()
    await ui.user.click(screen.getByText('Eduardo Modelo Lima'))
    expect((ui.continueButton() as HTMLButtonElement).disabled).toBe(false)
    await ui.user.click(screen.getByText('Eduardo Modelo Lima'))
    expect((ui.continueButton() as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Selecione ao menos uma pessoa para continuar.')).toBeTruthy()
  })

  it('alterar a seleção descarta o aviso de recusa anterior', async () => {
    const validate = vi.fn<ValidateSelectionFn>(async () => ({
      ok: false,
      code: 'link_inactive',
      message: 'Uma das pessoas selecionadas não está ativa no cadastro.',
    }))
    const ui = setup({ validate })
    await ui.user.click(screen.getByText('Daniela Modelo Lima'))
    await ui.user.click(ui.continueButton())
    await screen.findByText('Revise a seleção')

    await ui.user.click(screen.getByText('Eduardo Modelo Lima'))
    expect(screen.queryByText('Revise a seleção')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('alterar a seleção descarta o aviso de indisponibilidade anterior', async () => {
    const validate = vi.fn<ValidateSelectionFn>(async () => {
      throw new Error('falha de rede')
    })
    const ui = setup({ validate })
    await ui.user.click(screen.getByText('Daniela Modelo Lima'))
    await ui.user.click(ui.continueButton())
    await screen.findByText('Não foi possível validar agora')

    await ui.user.click(screen.getByText('Eduardo Modelo Lima'))
    expect(screen.queryByText('Não foi possível validar agora')).toBeNull()
  })

  it('depois de validada e alterada, a nova validação envia a seleção nova', async () => {
    const validate = vi.fn<ValidateSelectionFn>(async () => validResult(1))
    const ui = setup({ validate })
    await ui.user.click(screen.getByText('Daniela Modelo Lima'))
    await ui.user.click(ui.continueButton())
    await ui.expectContinued()

    await ui.user.click(screen.getByText('Daniela Modelo Lima')) // desmarca o titular
    await ui.user.click(screen.getByText('Fernanda Modelo Lima'))
    await ui.user.click(ui.continueButton())
    await ui.expectContinued(2)

    expect(validate).toHaveBeenCalledTimes(2)
    expect(validate.mock.calls[1]![0].linkIds).toEqual(['l-fernanda'])
  })

  it('recusa do backend: mostra o texto dele e mantém a seleção', async () => {
    const validate = vi.fn<ValidateSelectionFn>(async () => ({
      ok: false,
      code: 'link_inactive',
      message: 'Uma das pessoas selecionadas não está ativa no cadastro.',
    }))
    const ui = setup({ validate })
    await ui.user.click(screen.getByText('Daniela Modelo Lima'))
    await ui.user.click(ui.continueButton())

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Revise a seleção')
    expect(alert.textContent).toContain('Uma das pessoas selecionadas não está ativa no cadastro.')
    await waitFor(() => expect(document.activeElement).toBe(alert))
    expect(ui.card(/Daniela/).checked).toBe(true)
  })

  it('erro de comunicação: mensagem amigável sem detalhes internos e nova tentativa', async () => {
    const validate = vi
      .fn<ValidateSelectionFn>()
      .mockRejectedValueOnce(new Error('[CONVEX Q(public/members:validateSelection)] Server Error'))
      .mockResolvedValueOnce(validResult(1))
    const ui = setup({ validate })
    await ui.user.click(screen.getByText('Daniela Modelo Lima'))
    await ui.user.click(ui.continueButton())

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Não foi possível validar agora')
    expect(alert.textContent).not.toMatch(/Convex|CONVEX|Server Error|validateSelection/)
    expect(ui.card(/Daniela/).checked).toBe(true)

    await ui.user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    await ui.expectContinued()
    expect(validate).toHaveBeenCalledTimes(2)
  })

  it('sessão expirada ou inválida: avisa o fluxo para pedir nova identificação, sem erro interno', async () => {
    const onSessionExpired = vi.fn()
    const validate = vi.fn<ValidateSelectionFn>(async () => {
      throw new ConvexError({
        code: 'session_invalid',
        message: 'Sua identificação expirou. Informe novamente a carteirinha e o CPF.',
      })
    })
    const ui = setup({ validate, onSessionExpired })
    await ui.user.click(screen.getByText('Daniela Modelo Lima'))
    await ui.user.click(ui.continueButton())

    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('titular não encontrado no backend também pede nova identificação', async () => {
    const onSessionExpired = vi.fn()
    const validate = vi.fn<ValidateSelectionFn>(async () => ({
      ok: false,
      code: 'member_not_found',
      message: 'Não foi possível concluir a operação. Identifique-se novamente.',
    }))
    const ui = setup({ validate, onSessionExpired })
    await ui.user.click(screen.getByText('Daniela Modelo Lima'))
    await ui.user.click(ui.continueButton())

    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1))
  })

  it('"Voltar" leva de volta à identificação', async () => {
    const onBack = vi.fn()
    const ui = setup({ onBack })
    await ui.user.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('seleção já existente (voltando de outra etapa) é preservada e resumida', () => {
    const ui = setup({ initial: [id('l-holder'), id('l-eduardo')] })
    expect(ui.card(/Daniela/).checked).toBe(true)
    expect(ui.card(/Eduardo/).checked).toBe(true)
    expect(within(ui.summary()).getByText('R$ 60,00')).toBeTruthy()
  })
})
