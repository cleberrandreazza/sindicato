import { describe, expect, it } from 'vitest'
import { buildReceiptPdf } from '../../convex/receipts/pdfDocument'
import {
  formatCentsBRL,
  formatUsageDateBR,
  operationPublicRef,
  paymentMethodLabel,
} from '../../convex/receipts/format'

describe('PDF do comprovante (geração pura)', () => {
  it('gera bytes de PDF válidos com o conteúdo institucional mínimo', () => {
    const bytes = buildReceiptPdf({
      receiptNumber: 'SC-2026-000001',
      operationRef: 'ABCDEF12',
      paidAtLabel: '11/11/2026, 18:00',
      usageDateLabel: '20/11/2026',
      quantity: 2,
      peopleLines: ['Ana Teste (holder)', 'Bruno Teste (spouse)'],
      unitAmountLabel: formatCentsBRL(3000),
      totalAmountLabel: formatCentsBRL(6000),
      paymentMethodLabel: paymentMethodLabel('pix'),
    })
    const text = new TextDecoder().decode(bytes)
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text).toContain('Sindicomerciarios')
    expect(text).toContain('Sede Campestre')
    expect(text).toContain('Comprovante de pagamento')
    expect(text).toContain('SC-2026-000001')
    expect(text).toContain('pagamento confirmado')
    expect(text).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/) // sem CPF
    expect(text).not.toMatch(/CNPJ/i)
  })

  it('formata valores e data sem inventar dados', () => {
    expect(formatCentsBRL(6000)).toBe('R$ 60,00')
    expect(formatUsageDateBR('2026-11-20')).toBe('20/11/2026')
    expect(operationPublicRef('abcdefghijklmnop')).toBe('IJKLMNOP')
    expect(paymentMethodLabel('card')).toBe('Cartao de credito')
  })
})
