import type { PaymentMethod } from '../domain/statuses'

/** Formatação só para texto do PDF/e-mail (pt-BR). Sem dados inventados. */

export function formatCentsBRL(cents: number): string {
  const value = (cents / 100).toFixed(2).replace('.', ',')
  return `R$ ${value}`
}

/** `YYYY-MM-DD` → `DD/MM/YYYY` (sem conversão de fuso). */
export function formatUsageDateBR(usageDate: string): string {
  const [y, m, d] = usageDate.split('-')
  if (!y || !m || !d) return usageDate
  return `${d}/${m}/${y}`
}

export function formatPaidAtBR(paidAtMs: number): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(paidAtMs))
}

export function paymentMethodLabel(method: PaymentMethod): string {
  return method === 'pix' ? 'Pix' : 'Cartao de credito'
}

/** Referência pública curta da operação (não é o token). */
export function operationPublicRef(operationId: string): string {
  return operationId.slice(-8).toUpperCase()
}
