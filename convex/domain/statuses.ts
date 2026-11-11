import { v, type Infer } from 'convex/values'

/**
 * Fonte única de verdade para enums de domínio.
 * Os validators alimentam o schema e os tipos TypeScript (via `Infer`) alimentam
 * contratos de providers e regras de negócio.
 */

export const memberStatus = v.union(v.literal('active'), v.literal('inactive'))
export type MemberStatus = Infer<typeof memberStatus>

/**
 * MODELO DE IDENTIDADE (três conceitos separados):
 * - PESSOA (`people`): quem é. Identificada por `personId`, estável e único no mundo real,
 *   fornecido pelo cadastro oficial. Nunca é o id de um vínculo.
 * - VÍNCULO (`householdLinks`): a ligação de uma pessoa com um titular. Uma pessoa pode ter
 *   vários vínculos (ex.: filha de dois titulares). Cada vínculo tem seu próprio id.
 * - PAPEL (`role`): como a pessoa se relaciona com o titular naquele vínculo.
 */
export const linkStatus = v.union(v.literal('active'), v.literal('inactive'))
export type LinkStatus = Infer<typeof linkStatus>

/** Papéis de dependentes (tudo menos o titular). */
export const dependentRole = v.union(
  v.literal('spouse'),
  v.literal('child'),
  v.literal('parent'),
  v.literal('other'),
)
export type DependentRole = Infer<typeof dependentRole>

/** Papel na associação familiar. `holder` é o próprio titular. */
export const householdRole = v.union(
  v.literal('holder'),
  v.literal('spouse'),
  v.literal('child'),
  v.literal('parent'),
  v.literal('other'),
)
export type HouseholdRole = Infer<typeof householdRole>

/**
 * Referência enviada pelo navegador: apenas indica QUAL vínculo (pessoa dentro da família do
 * titular) foi escolhido. Nunca nomes, papéis ou valores.
 */
export const personRef = v.object({ linkId: v.id('householdLinks') })
export type PersonRef = Infer<typeof personRef>

/**
 * ESTADO FINANCEIRO: o dinheiro da operação foi recebido?
 * - `unpaid`: nenhum recebimento válido para o valor da operação.
 * - `paid`: recebido dentro do prazo.
 * - `paid_late`: recebido depois do prazo.
 */
export const financialStatus = v.union(
  v.literal('unpaid'),
  v.literal('paid'),
  v.literal('paid_late'),
)
export type FinancialStatus = Infer<typeof financialStatus>

/**
 * ESTADO OPERACIONAL: o que acontece com o direito de uso das piscinas?
 * - `awaiting_payment`: aberta, dentro do prazo.
 * - `confirmed`: utilização liberada.
 * - `expired`: prazo encerrado sem recebimento.
 * - `under_review`: há recebimento que exige análise administrativa; nada é liberado.
 * - `rejected`: a análise concluiu que a utilização não será liberada.
 */
export const operationalStatus = v.union(
  v.literal('awaiting_payment'),
  v.literal('confirmed'),
  v.literal('expired'),
  v.literal('under_review'),
  v.literal('rejected'),
)
export type OperationalStatus = Infer<typeof operationalStatus>

/** Reserva da pessoa para a data (impede cobranças duplicadas). */
export const claimState = v.union(v.literal('active'), v.literal('released'))
export type ClaimState = Infer<typeof claimState>

export const reviewReason = v.union(
  /** Pagamento recebido depois do prazo. */
  v.literal('late_payment'),
  /** Valor recebido diferente do valor da operação. */
  v.literal('amount_mismatch'),
  /** Recebimento em operação já paga ou já encerrada (possível cobrança em duplicidade). */
  v.literal('unexpected_payment'),
  /** Pagamento no prazo, mas a pessoa já foi reservada por outra operação. */
  v.literal('claim_conflict'),
)
export type ReviewReason = Infer<typeof reviewReason>

export const reviewStatus = v.union(v.literal('open'), v.literal('approved'), v.literal('rejected'))
export type ReviewStatus = Infer<typeof reviewStatus>

export const operationEventType = v.union(
  v.literal('created'),
  v.literal('expired'),
  v.literal('payment_confirmed'),
  v.literal('review_opened'),
  v.literal('review_resolved'),
)
export type OperationEventType = Infer<typeof operationEventType>

export const eventActor = v.union(
  v.literal('member'),
  v.literal('system'),
  v.literal('provider'),
  v.literal('admin'),
)
export type EventActor = Infer<typeof eventActor>

export const paymentMethod = v.union(v.literal('pix'), v.literal('card'))
export type PaymentMethod = Infer<typeof paymentMethod>

export const paymentProviderName = v.union(v.literal('mock'), v.literal('stripe'))
export type PaymentProviderName = Infer<typeof paymentProviderName>

export const transactionStatus = v.union(
  v.literal('pending'),
  v.literal('succeeded'),
  v.literal('failed'),
  v.literal('canceled'),
  v.literal('expired'),
)
export type TransactionStatus = Infer<typeof transactionStatus>

/**
 * QR Code do Pix. `placeholder`: imagem demonstrativa (data URI SVG) que NÃO é escaneável, usada
 * pelo mock. `image_url`: imagem do provedor real.
 */
export const pixQrCode = v.object({
  kind: v.union(v.literal('placeholder'), v.literal('image_url')),
  value: v.string(),
})
export type PixQrCode = Infer<typeof pixQrCode>

/**
 * Tentativa de criar uma cobrança no provedor (registro ANTES da chamada externa, para que
 * chamadas simultâneas e repetidas não criem cobranças independentes).
 * - `creating`: a chamada ao provedor está em andamento (ou foi interrompida).
 * - `created`: o provedor respondeu e a transação local foi gravada.
 * - `error`: o provedor falhou; a retomada reaproveita a mesma chave de idempotência.
 */
export const chargeAttemptState = v.union(
  v.literal('creating'),
  v.literal('created'),
  v.literal('error'),
)
export type ChargeAttemptState = Infer<typeof chargeAttemptState>

export const notificationChannel = v.union(v.literal('email'), v.literal('whatsapp'))
export type NotificationChannel = Infer<typeof notificationChannel>

export const notificationKind = v.union(v.literal('receipt'), v.literal('payment_under_review'))
export type NotificationKind = Infer<typeof notificationKind>

export const notificationStatus = v.union(
  v.literal('pending'),
  v.literal('sent'),
  v.literal('failed'),
)
export type NotificationStatus = Infer<typeof notificationStatus>

const OPERATIONAL_TRANSITIONS: Readonly<Record<OperationalStatus, readonly OperationalStatus[]>> = {
  awaiting_payment: ['confirmed', 'expired', 'under_review'],
  // Confirmação no prazo que chegou depois de a expiração ter sido processada.
  expired: ['confirmed', 'under_review'],
  under_review: ['confirmed', 'rejected'],
  confirmed: [],
  rejected: [],
}

export function canTransitionOperational(from: OperationalStatus, to: OperationalStatus): boolean {
  return OPERATIONAL_TRANSITIONS[from].includes(to)
}

const FINANCIAL_TRANSITIONS: Readonly<Record<FinancialStatus, readonly FinancialStatus[]>> = {
  unpaid: ['paid', 'paid_late'],
  paid: [],
  paid_late: [],
}

export function canTransitionFinancial(from: FinancialStatus, to: FinancialStatus): boolean {
  return FINANCIAL_TRANSITIONS[from].includes(to)
}

/**
 * Transações: `succeeded` é terminal (dinheiro recebido nunca é 'desfeito' por evento fora de
 * ordem). Qualquer outro estado pode evoluir para `succeeded`, pois um recebimento efetivo não
 * pode ser descartado. Entre estados não terminais, só `pending` evolui.
 */
export function canTransitionTransaction(from: TransactionStatus, to: TransactionStatus): boolean {
  if (from === 'succeeded' || from === to) return false
  if (to === 'succeeded') return true
  return from === 'pending'
}

/** Resultado do processamento de um evento recebido do provedor de pagamento. */
export const providerEventOutcome = v.union(
  v.literal('confirmed'),
  v.literal('under_review'),
  v.literal('ignored'),
  v.literal('transaction_updated'),
  v.literal('unknown_transaction'),
)
export type ProviderEventOutcome = Infer<typeof providerEventOutcome>

export const alertStatus = v.union(v.literal('open'), v.literal('resolved'))
export type AlertStatus = Infer<typeof alertStatus>
