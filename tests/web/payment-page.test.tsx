// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConvexError } from 'convex/values'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Id } from '../../convex/_generated/dataModel'
import type {
  GetOperationFn,
  OperationView,
  StartPaymentFn,
  StartPaymentResult,
} from '../../src/features/payment/api/start-payment'
import { PaymentPage } from '../../src/features/payment/components/payment-page'
import type { CreatedOperation } from '../../src/features/summary/lib/created-operation'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  window.sessionStorage.clear()
  vi.useRealTimers()
})

const NOW = Date.UTC(2026, 10, 11, 18, 0, 0)
const EXPIRES_AT = NOW + 15 * 60 * 1000
const USAGE_DATE = '2026-11-20'

const operation: CreatedOperation = {
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
  recovered: false,
}

const awaitingView = (patch: Partial<OperationView> = {}): OperationView => ({
  operationId: operation.operationId,
  usageDate: USAGE_DATE,
  quantity: 2,
  unitAmountCents: 3000,
  totalAmountCents: 6000,
  expiresAt: EXPIRES_AT,
  operationalStatus: 'awaiting_payment',
  financialStatus: 'unpaid',
  presentation: {
    code: 'awaiting_payment',
    message: 'Aguardando a confirmação do pagamento.',
  },
  people: [
    { name: 'Daniela Modelo Lima', role: 'holder' },
    { name: 'Fernanda Modelo Lima', role: 'child' },
  ],
  receiptNumber: null,
  receipt: null,
  notifications: [],
  paidAt: null,
  payment: null,
  ...patch,
})

const pixPending = (): StartPaymentResult => ({
  reused: false,
  payment: {
    paymentId: 'pay-1' as Id<'paymentTransactions'>,
    method: 'pix',
    status: 'pending',
    amountCents: 6000,
    message: 'Pix gerado. Use o código.',
    pix: {
      copyPasteCode: 'MOCK-PIX-NAO-PAGAVEL:ABCD1234',
      qrCode: { kind: 'placeholder', value: 'data:image/svg+xml;utf8,demo' },
      expiresAt: EXPIRES_AT,
    },
  },
  operation: {
    operationalStatus: 'awaiting_payment',
    financialStatus: 'unpaid',
    presentation: {
      code: 'awaiting_payment',
      message: 'Aguardando a confirmação do pagamento.',
    },
  },
})

const cardApproved = (): StartPaymentResult => ({
  reused: false,
  payment: {
    paymentId: 'pay-2' as Id<'paymentTransactions'>,
    method: 'card',
    status: 'succeeded',
    amountCents: 6000,
    message: 'Pagamento confirmado.',
    pix: null,
  },
  operation: {
    operationalStatus: 'confirmed',
    financialStatus: 'paid',
    presentation: {
      code: 'confirmed',
      message:
        'Pagamento confirmado. O comprovante está disponível para download e será enviado por e-mail.',
    },
  },
})

const cardDeclined = (): StartPaymentResult => ({
  reused: false,
  payment: {
    paymentId: 'pay-3' as Id<'paymentTransactions'>,
    method: 'card',
    status: 'failed',
    amountCents: 6000,
    message: 'O pagamento não foi aprovado e nenhum recebimento foi identificado.',
    pix: null,
  },
  operation: {
    operationalStatus: 'awaiting_payment',
    financialStatus: 'unpaid',
    presentation: {
      code: 'awaiting_payment',
      message: 'Aguardando a confirmação do pagamento.',
    },
  },
})

function setup(
  options: {
    start?: StartPaymentFn
    getState?: GetOperationFn
    nowMs?: () => number
    onFinish?: () => void
    onSessionExpired?: () => void
    pollIntervalMs?: number
    copyText?: (value: string) => Promise<void>
  } = {},
) {
  const start =
    options.start ??
    vi.fn<StartPaymentFn>(async () => {
      throw new Error('start não configurado')
    })
  const getState = options.getState ?? vi.fn<GetOperationFn>(async () => awaitingView())
  const user = userEvent.setup()
  render(
    <PaymentPage
      operation={operation}
      onFinish={options.onFinish ?? (() => {})}
      onSessionExpired={options.onSessionExpired}
      start={start}
      getState={getState}
      nowMs={options.nowMs ?? (() => NOW)}
      pollIntervalMs={options.pollIntervalMs ?? 60_000}
      copyText={options.copyText}
    />,
  )
  return { user, start, getState }
}

describe('PaymentPage', () => {
  it('mostra título, valor, data, quantidade e aviso de simulação', async () => {
    setup()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Finalize seu pagamento' }),
    ).toBeTruthy()
    expect(screen.getByTestId('simulation-banner').textContent).toMatch(/simulado|mockado/i)
    const summary = screen.getByTestId('payment-summary')
    expect(within(summary).getByText('R$ 60,00')).toBeTruthy()
    expect(within(summary).getByText('20/11/2026')).toBeTruthy()
    expect(within(summary).getByText('2 pessoas')).toBeTruthy()
    expect(screen.getByText(/Tempo restante/)).toBeTruthy()
  })

  it('o contador usa expiresAt do backend e não reinicia ao remontar', async () => {
    const now = NOW + 5 * 60 * 1000 // 5 min decorridos → restam 10:00
    const { unmount } = render(
      <PaymentPage
        operation={operation}
        onFinish={() => {}}
        start={vi.fn()}
        getState={vi.fn(async () => awaitingView())}
        nowMs={() => now}
        pollIntervalMs={60_000}
      />,
    )
    expect(await screen.findByText(/10:00/)).toBeTruthy()
    unmount()

    render(
      <PaymentPage
        operation={operation}
        onFinish={() => {}}
        start={vi.fn()}
        getState={vi.fn(async () => awaitingView())}
        nowMs={() => now}
        pollIntervalMs={60_000}
      />,
    )
    expect(await screen.findByText(/10:00/)).toBeTruthy()
  })

  it('Pix: cria cobrança mockada, mostra QR e código, e permite copiar', async () => {
    const start = vi.fn<StartPaymentFn>(async (input) => {
      expect(input.paymentMethod).toBe('pix')
      expect(input.paymentMethodToken).toBeUndefined()
      expect(Object.keys(input).sort()).toEqual(['accessToken', 'operationId', 'paymentMethod'])
      return pixPending()
    })
    const getState = vi
      .fn<GetOperationFn>()
      .mockResolvedValueOnce(awaitingView())
      .mockResolvedValue(awaitingView({ payment: pixPending().payment }))
    const copyText = vi.fn(async () => {})
    const ui = setup({ start, getState, copyText })
    await screen.findByRole('button', { name: /Pagar com Pix/ })
    await ui.user.click(screen.getByRole('button', { name: /Pagar com Pix/ }))

    expect(await screen.findByTestId('pix-panel')).toBeTruthy()
    expect(screen.getByAltText(/QR Code demonstrativo/)).toBeTruthy()
    expect(screen.getByDisplayValue('MOCK-PIX-NAO-PAGAVEL:ABCD1234')).toBeTruthy()
    await ui.user.click(screen.getByRole('button', { name: /Copiar código/ }))
    await waitFor(() => expect(copyText).toHaveBeenCalledWith('MOCK-PIX-NAO-PAGAVEL:ABCD1234'))
    expect(await screen.findByRole('button', { name: /Código copiado/ })).toBeTruthy()
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('cartão: cenários simulados sem campos de cartão; aprovado e recusado', async () => {
    const start = vi.fn<StartPaymentFn>().mockResolvedValueOnce(cardApproved())
    const getState = vi
      .fn<GetOperationFn>()
      .mockResolvedValueOnce(awaitingView())
      .mockResolvedValue(
        awaitingView({
          financialStatus: 'paid',
          operationalStatus: 'confirmed',
          presentation: {
            code: 'confirmed',
            message:
              'Pagamento confirmado. O comprovante está disponível para download e será enviado por e-mail.',
          },
          payment: cardApproved().payment,
        }),
      )

    const ui = setup({ start, getState })
    await screen.findByRole('button', { name: /Pagar com cartão/ })
    expect(screen.queryByLabelText(/número do cartão/i)).toBeNull()
    expect(screen.queryByLabelText(/cvv/i)).toBeNull()

    await ui.user.click(screen.getByRole('button', { name: /Pagar com cartão/ }))
    await ui.user.click(screen.getByRole('button', { name: /Simular cartão aprovado/ }))

    expect(await screen.findByText('Pagamento aprovado (simulado)')).toBeTruthy()
    expect(start.mock.calls[0]![0].paymentMethodToken).toBe('tok_mock_approved')
    expect(document.body.textContent).toMatch(/nenhum pagamento real/i)
  })

  it('cartão recusado: mensagem amigável e nova tentativa', async () => {
    const start = vi.fn<StartPaymentFn>(async () => cardDeclined())
    const getState = vi
      .fn<GetOperationFn>()
      .mockResolvedValueOnce(awaitingView())
      .mockResolvedValue(awaitingView({ payment: cardDeclined().payment }))
    const ui = setup({ start, getState })
    await screen.findByRole('button', { name: /Pagar com cartão/ })
    await ui.user.click(screen.getByRole('button', { name: /Pagar com cartão/ }))
    await ui.user.click(screen.getByRole('button', { name: /Simular cartão recusado/ }))

    expect(await screen.findByText(/Pagamento recusado/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Tentar outra forma/ })).toBeTruthy()
  })

  it('pagamento tardio: mostra análise, sem liberar utilização', async () => {
    const getState = vi.fn<GetOperationFn>(async () =>
      awaitingView({
        financialStatus: 'paid_late',
        operationalStatus: 'under_review',
        presentation: {
          code: 'under_review_late_payment',
          message:
            'Seu pagamento foi identificado, mas a confirmação chegou com um pequeno atraso.',
        },
        payment: {
          paymentId: 'pay-late' as Id<'paymentTransactions'>,
          method: 'pix',
          status: 'succeeded',
          amountCents: 6000,
          message:
            'Seu pagamento foi identificado, mas a confirmação chegou com um pequeno atraso.',
          pix: null,
        },
      }),
    )
    setup({ getState })
    expect(await screen.findByText('Pagamento recebido após o prazo')).toBeTruthy()
    expect(document.body.textContent).toMatch(/analisar a operação|validação da nossa equipe/i)
    expect(document.body.textContent).not.toMatch(/liberad[oa] automaticamente/i)
  })

  it('clique duplo no Pix: uma só chamada a startPayment', async () => {
    let resolve!: (value: StartPaymentResult) => void
    const start = vi.fn<StartPaymentFn>(() => new Promise<StartPaymentResult>((r) => (resolve = r)))
    const ui = setup({ start, getState: vi.fn(async () => awaitingView()) })
    await screen.findByRole('button', { name: /Pagar com Pix/ })
    await ui.user.click(screen.getByRole('button', { name: /Pagar com Pix/ }))
    await ui.user.click(screen.getByRole('button', { name: /Pagar com Pix/ }))
    expect(start).toHaveBeenCalledTimes(1)
    resolve(pixPending())
    await screen.findByTestId('pix-panel')
  })

  it('falha de comunicação: não afirma que falhou; permite verificar de novo', async () => {
    const start = vi.fn<StartPaymentFn>(async () => {
      throw new Error('network')
    })
    const ui = setup({ start })
    await screen.findByRole('button', { name: /Pagar com Pix/ })
    await ui.user.click(screen.getByRole('button', { name: /Pagar com Pix/ }))
    expect(await screen.findByText(/Ainda não conseguimos confirmar/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Convex|stack|Error:/)
  })

  it('operação inexistente: pede nova identificação', async () => {
    const onSessionExpired = vi.fn()
    const getState = vi.fn<GetOperationFn>(async () => {
      throw new ConvexError({ code: 'operation_not_found', message: 'Operação não encontrada.' })
    })
    setup({ getState, onSessionExpired })
    await waitFor(() => expect(onSessionExpired).toHaveBeenCalled())
  })

  it('não usa armazenamento do navegador nem exibe o accessToken', async () => {
    setup()
    await screen.findByRole('heading', { name: 'Finalize seu pagamento' })
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
    expect(document.body.textContent).not.toContain(operation.accessToken)
  })

  it('prazo encerrado: consulta o estado oficial sem presumir pagamento', async () => {
    const getState = vi.fn<GetOperationFn>(async () =>
      awaitingView({
        operationalStatus: 'expired',
        presentation: {
          code: 'expired',
          message: 'O prazo de 15 minutos para o pagamento terminou.',
        },
      }),
    )
    setup({
      getState,
      nowMs: () => EXPIRES_AT + 1,
    })
    expect(await screen.findByText('Prazo encerrado')).toBeTruthy()
    await waitFor(() => expect(getState).toHaveBeenCalled())
    expect(document.body.textContent).toMatch(/15 minutos/)
    // Não presume recebimento só porque o prazo zerou.
    expect(document.body.textContent).not.toMatch(/pagamento aprovado|pagamento confirmado/i)
  })
})
