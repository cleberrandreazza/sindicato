import {
  calculateOperationAmounts,
  POOL_MEDICAL_FEE_CENTS,
} from '../../../../convex/domain/pricing'

/**
 * Resumo INFORMATIVO. Usa a mesma função pura que o backend usa para calcular a operação, mas o
 * valor cobrado nunca vem daqui: o servidor recalcula a partir das pessoas validadas e o
 * navegador jamais envia valores (ver `public/payments:createOperation`).
 */
export interface SelectionSummary {
  quantity: number
  unitAmountCents: number
  totalAmountCents: number
}

export function summarizeSelection(quantity: number): SelectionSummary {
  if (quantity < 1) {
    return { quantity: 0, unitAmountCents: POOL_MEDICAL_FEE_CENTS, totalAmountCents: 0 }
  }
  return calculateOperationAmounts(quantity)
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** `3000` → `R$ 30,00` (espaço comum, para quebra e leitura previsíveis). */
export function formatBRL(cents: number): string {
  return brl.format(cents / 100).replace(/\u00a0/g, ' ')
}

export function peopleLabel(count: number): string {
  return count === 1 ? '1 pessoa' : `${count} pessoas`
}
