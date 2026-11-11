import { describe, expect, it } from 'vitest'
import {
  LATE_PAYMENT_MESSAGE,
  UNDER_REVIEW_MESSAGE,
  describeOperationForMember,
} from '../../convex/domain/messages'

describe('mensagem de confirmação tardia', () => {
  it('deixa claro que o pagamento foi identificado', () => {
    expect(LATE_PAYMENT_MESSAGE).toContain('Seu pagamento foi identificado')
  })

  it('informa que a confirmação chegou com atraso', () => {
    expect(LATE_PAYMENT_MESSAGE).toContain('a confirmação chegou com um pequeno atraso')
  })

  it('informa que a operação está sendo analisada', () => {
    expect(LATE_PAYMENT_MESSAGE).toContain('nossa equipe está verificando a situação')
  })

  it('orienta a não pagar novamente', () => {
    expect(LATE_PAYMENT_MESSAGE).toContain('Não realize um novo pagamento neste momento')
  })

  it('informa que a utilização depende de validação administrativa', () => {
    expect(LATE_PAYMENT_MESSAGE).toContain('só será liberada após a validação da nossa equipe')
  })

  it('promete atualização, sem prometer reembolso nem liberação', () => {
    expect(LATE_PAYMENT_MESSAGE).toContain('Você receberá uma atualização')
    expect(LATE_PAYMENT_MESSAGE.toLowerCase()).not.toContain('reembolso')
  })
})

describe('mensagens por estado da operação', () => {
  it('pagamento tardio em análise usa a mensagem de atraso', () => {
    expect(
      describeOperationForMember({
        financialStatus: 'paid_late',
        operationalStatus: 'under_review',
      }),
    ).toEqual({ code: 'under_review_late_payment', message: LATE_PAYMENT_MESSAGE })
  })

  it('análise por outro motivo não afirma que houve atraso', () => {
    const presentation = describeOperationForMember({
      financialStatus: 'unpaid',
      operationalStatus: 'under_review',
      reviewReason: 'amount_mismatch',
    })
    expect(presentation).toEqual({ code: 'under_review', message: UNDER_REVIEW_MESSAGE })
    expect(presentation.message).not.toContain('atraso')
    expect(presentation.message).toContain('Não realize um novo pagamento')
  })

  it('operação expirada orienta a não pagar de novo se já pagou', () => {
    const presentation = describeOperationForMember({
      financialStatus: 'unpaid',
      operationalStatus: 'expired',
    })
    expect(presentation.code).toBe('expired')
    expect(presentation.message).toContain('não pague novamente')
  })

  it('cobre todos os estados operacionais', () => {
    const states = ['awaiting_payment', 'confirmed', 'expired', 'under_review', 'rejected'] as const
    for (const operationalStatus of states) {
      const { message } = describeOperationForMember({
        financialStatus: 'unpaid',
        operationalStatus,
      })
      expect(message.length).toBeGreaterThan(0)
    }
  })
})
