// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Id } from '../../convex/_generated/dataModel'
import type { OperationView } from '../../src/features/receipt/api/receipt'
import { LatePaymentPage } from '../../src/features/receipt/components/late-payment-page'
import { ReceiptSuccessPage } from '../../src/features/receipt/components/receipt-success-page'
import type { CreatedOperation } from '../../src/features/summary/lib/created-operation'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  window.sessionStorage.clear()
})

const operation: CreatedOperation = {
  operationId: 'op-1' as Id<'paymentOperations'>,
  accessToken: 'a'.repeat(64),
  usageDate: '2026-11-20',
  quantity: 2,
  unitAmountCents: 3000,
  totalAmountCents: 6000,
  expiresAt: Date.UTC(2026, 10, 11, 18, 15, 0),
  people: [
    { name: 'Daniela Modelo Lima', role: 'holder' },
    { name: 'Fernanda Modelo Lima', role: 'child' },
  ],
  recovered: false,
}

function confirmedView(patch: Partial<OperationView> = {}): OperationView {
  return {
    operationId: operation.operationId,
    usageDate: operation.usageDate,
    quantity: 2,
    unitAmountCents: 3000,
    totalAmountCents: 6000,
    expiresAt: operation.expiresAt,
    operationalStatus: 'confirmed',
    financialStatus: 'paid',
    presentation: {
      code: 'confirmed',
      message:
        'Pagamento confirmado. O comprovante está disponível para download e será enviado por e-mail.',
    },
    people: [
      { name: 'Daniela Modelo Lima', role: 'holder' as const },
      { name: 'Fernanda Modelo Lima', role: 'child' as const },
    ],
    receiptNumber: 'SC-2026-000042',
    receipt: { receiptNumber: 'SC-2026-000042', fileReady: true },
    notifications: [
      { channel: 'email', status: 'sent', failureReason: null },
      {
        channel: 'whatsapp',
        status: 'not_configured',
        failureReason: 'Provedor de WhatsApp ainda nao configurado pelo sindicato.',
      },
    ],
    paidAt: Date.UTC(2026, 10, 11, 18, 5, 0),
    payment: {
      paymentId: 'pay-1' as Id<'paymentTransactions'>,
      method: 'pix',
      status: 'succeeded',
      amountCents: 6000,
      message: 'Pagamento confirmado.',
      pix: null,
    },
    demoSimulationAllowed: false,
    ...patch,
  }
}

describe('ReceiptSuccessPage', () => {
  it('mostra sucesso, número do comprovante, valor e ações', async () => {
    const getState = vi.fn(async () => confirmedView())
    const download = vi.fn(async () => ({
      receiptNumber: 'SC-2026-000042',
      url: 'https://example.test/receipt.pdf',
    }))
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const user = userEvent.setup()

    render(
      <ReceiptSuccessPage
        operation={operation}
        onFinish={() => {}}
        getState={getState}
        download={download}
        requestEmail={vi.fn(async () => ({ status: 'queued' as const }))}
      />,
    )

    expect(await screen.findByRole('heading', { name: 'Pagamento confirmado!' })).toBeTruthy()
    expect(screen.getByText('SC-2026-000042')).toBeTruthy()
    expect(screen.getByText('R$ 60,00')).toBeTruthy()
    expect(screen.getByText(/WhatsApp: canal preparado/)).toBeTruthy()
    expect(document.body.textContent).not.toContain(operation.accessToken)

    await user.click(screen.getByRole('button', { name: /Baixar comprovante PDF/ }))
    await waitFor(() => expect(download).toHaveBeenCalled())
    expect(open).toHaveBeenCalledWith(
      'https://example.test/receipt.pdf',
      '_blank',
      'noopener,noreferrer',
    )
    open.mockRestore()
  })

  it('falha de e-mail: mensagem amigável sem alterar o sucesso', async () => {
    const getState = vi.fn(async () =>
      confirmedView({
        notifications: [
          {
            channel: 'email',
            status: 'failed',
            failureReason: 'Falha temporaria no envio de e-mail.',
          },
          { channel: 'whatsapp', status: 'not_configured', failureReason: null },
        ],
      }),
    )
    render(
      <ReceiptSuccessPage
        operation={operation}
        onFinish={() => {}}
        getState={getState}
        download={vi.fn()}
        requestEmail={vi.fn()}
      />,
    )
    expect(await screen.findByText(/não conseguimos enviar o e-mail/i)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Pagamento confirmado!' })).toBeTruthy()
  })
})

describe('LatePaymentPage', () => {
  it('não apresenta comprovante definitivo nem badge de confirmado', () => {
    render(<LatePaymentPage operation={operation} onFinish={() => {}} />)
    expect(screen.getByRole('heading', { name: /Aguardando análise/ })).toBeTruthy()
    expect(screen.getByTestId('late-payment-notice').textContent).toMatch(/comprovante definitivo/i)
    expect(screen.queryByRole('button', { name: /Baixar comprovante/ })).toBeNull()
    expect(screen.queryByText(/Pagamento confirmado!/)).toBeNull()
  })
})
