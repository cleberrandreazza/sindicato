import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import {
  alertStatus,
  claimState,
  eventActor,
  financialStatus,
  householdRole,
  linkStatus,
  memberStatus,
  notificationChannel,
  notificationKind,
  notificationStatus,
  operationEventType,
  operationalStatus,
  paymentMethod,
  paymentProviderName,
  providerEventOutcome,
  reviewReason,
  reviewStatus,
  transactionStatus,
} from './domain/statuses'

/**
 * Convenções:
 * - Valores monetários: inteiros em centavos, sufixo `Cents`.
 * - Instantes: `number` em ms desde a época Unix (UTC). `createdAt` é o `_creationTime` nativo.
 * - Datas de calendário (sem fuso, sem conversão): string `YYYY-MM-DD`. Ver `domain/time.ts`.
 * - Nada é apagado: o histórico é formado por linhas imutáveis e por `operationEvents`.
 * - Nenhuma informação clínica é armazenada.
 *
 * Detalhes e justificativas em docs/data-model.md.
 */
export default defineSchema({
  /**
   * IDENTIDADE: quem é a pessoa. `personId` é o identificador estável e único da pessoa no
   * cadastro oficial; é a base da prevenção global de duplicidade. NUNCA é o id de um vínculo.
   */
  people: defineTable({
    personId: v.string(),
    name: v.string(),
    updatedAt: v.number(),
  }).index('by_person_id', ['personId']),

  /**
   * Titular (conta de associado). Cache do cadastro do sindicato, atualizado a cada consulta via
   * MemberProvider. O nome do titular pertence à pessoa (vínculo com papel `holder`).
   */
  members: defineTable({
    membershipNumber: v.string(),
    /** HMAC-SHA256 do CPF normalizado. O CPF completo nunca é persistido. */
    cpfHash: v.string(),
    /** Ex.: `***.***.***-09`. Somente para exibição. */
    cpfMasked: v.string(),
    status: memberStatus,
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index('by_membership_number', ['membershipNumber'])
    .index('by_cpf_hash', ['cpfHash']),

  /**
   * VÍNCULO + PAPEL: liga uma pessoa a um titular. Todas as pessoas selecionáveis, inclusive o
   * próprio titular (`role = holder`), são vínculos. A mesma pessoa pode ter vários vínculos
   * (ex.: filha de dois titulares), cada um com seu id, mas todos apontam para a mesma `people`.
   */
  householdLinks: defineTable({
    memberId: v.id('members'),
    personRef: v.id('people'),
    /** Id do vínculo no cadastro de origem; chave de sincronização. */
    externalLinkId: v.string(),
    role: householdRole,
    status: linkStatus,
    updatedAt: v.number(),
  })
    // Também atende "vínculos (pessoas) por titular", pelo prefixo `memberId`.
    .index('by_member_and_external_link', ['memberId', 'externalLinkId']),

  /**
   * Intenção de pagamento. Todos os valores são calculados no backend.
   * O estado da operação é o par (`financialStatus`, `operationalStatus`) + `expiresAt`.
   */
  paymentOperations: defineTable({
    memberId: v.id('members'),
    /** Data de utilização das piscinas: data de calendário `YYYY-MM-DD`. */
    usageDate: v.string(),
    /** Igual ao número de linhas em `operationPeople`. */
    quantity: v.number(),
    unitAmountCents: v.number(),
    /** `quantity × unitAmountCents`. */
    totalAmountCents: v.number(),
    /** Instante (UTC, ms): `createdAt + 15 min`. */
    expiresAt: v.number(),
    /** O dinheiro foi recebido? (`unpaid | paid | paid_late`) */
    financialStatus,
    /** O que acontece com o direito de uso? (`awaiting_payment | confirmed | expired | under_review | rejected`) */
    operationalStatus,
    /** Instante do recebimento informado pelo provedor (`occurredAt`, UTC, ms). */
    paidAt: v.optional(v.number()),
    /** SHA-256 do token entregue ao navegador para acompanhar a operação. */
    accessTokenHash: v.string(),
    updatedAt: v.number(),
  }).index('by_member', ['memberId']),

  /**
   * Uma linha por pessoa selecionada. Serve de snapshot da seleção e de "reserva" por
   * pessoa/data: a unicidade de reservas `active` por (`personId`, `usageDate`) é a base da
   * prevenção de duplicidade (ver docs/business-rules.md).
   */
  operationPeople: defineTable({
    operationId: v.id('paymentOperations'),
    /** Cópia de `paymentOperations.usageDate`, necessária para o índice de duplicidade. */
    usageDate: v.string(),
    /** Identificador estável da PESSOA (não do vínculo). Chave da duplicidade global. */
    personId: v.string(),
    /** Vínculo pelo qual a pessoa foi selecionada (contexto de qual titular). */
    linkId: v.id('householdLinks'),
    /** Papel no momento da operação. */
    role: householdRole,
    /** Nome no momento da operação. */
    name: v.string(),
    /** `active` enquanto a operação bloqueia novas cobranças para a pessoa nesta data. */
    claim: claimState,
  })
    .index('by_operation', ['operationId'])
    .index('by_person_date_claim', ['personId', 'usageDate', 'claim']),

  /** Transação junto ao provedor de pagamento. Uma operação pode ter várias tentativas. */
  paymentTransactions: defineTable({
    operationId: v.id('paymentOperations'),
    provider: paymentProviderName,
    providerTransactionId: v.string(),
    method: paymentMethod,
    amountCents: v.number(),
    status: transactionStatus,
    /** Código copia-e-cola do Pix, para reexibir o QR Code. */
    pixCopyPasteCode: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index('by_operation', ['operationId'])
    // Necessário para resolver eventos do provedor de forma idempotente.
    .index('by_provider_transaction', ['provider', 'providerTransactionId']),

  /**
   * Registro de TODO evento recebido do provedor (webhook), conhecido ou não. Guarda apenas
   * campos normalizados e não pessoais; o corpo bruto não é persistido.
   * - Origem + identificador (`provider`, `eventId`) identificam eventos repetidos.
   * - Evento de recebimento sem transação local correspondente gera alerta administrativo
   *   (`alertStatus = open`); nada é confirmado nem liberado.
   */
  providerEvents: defineTable({
    provider: paymentProviderName,
    /** Identificador do evento no provedor. */
    eventId: v.string(),
    providerTransactionId: v.string(),
    status: transactionStatus,
    amountCents: v.number(),
    /** Instante do evento segundo o provedor (UTC, ms). */
    occurredAt: v.number(),
    /** Quantas vezes este mesmo evento chegou (>1 = repetido). */
    occurrences: v.number(),
    /** Instante (UTC, ms) da última chegada. A primeira é o `_creationTime`. */
    lastReceivedAt: v.number(),
    /** Resultado do último processamento. */
    outcome: providerEventOutcome,
    operationId: v.optional(v.id('paymentOperations')),
    /** Presente quando o evento exige análise administrativa. */
    alertReason: v.optional(v.literal('unknown_transaction')),
    alertStatus: v.optional(alertStatus),
    resolvedAt: v.optional(v.number()),
    resolvedBy: v.optional(v.string()),
    resolutionNote: v.optional(v.string()),
  })
    .index('by_provider_event', ['provider', 'eventId'])
    // Fila de alertas do painel administrativo.
    .index('by_alert_status', ['alertStatus']),

  /** Fila de análise administrativa: recebimentos que não podem ser liberados automaticamente. */
  paymentReviews: defineTable({
    operationId: v.id('paymentOperations'),
    /** Transação que originou a análise. */
    transactionId: v.id('paymentTransactions'),
    reason: reviewReason,
    status: reviewStatus,
    resolvedAt: v.optional(v.number()),
    /** Identificação de quem decidiu (preenchida quando houver autenticação administrativa). */
    resolvedBy: v.optional(v.string()),
    resolutionNote: v.optional(v.string()),
  })
    .index('by_operation', ['operationId'])
    // Fila de pendências do painel administrativo.
    .index('by_status', ['status']),

  /** Histórico append-only de mudanças de estado da operação. */
  operationEvents: defineTable({
    operationId: v.id('paymentOperations'),
    type: operationEventType,
    actor: eventActor,
    /** Estados resultantes após o evento. */
    financialStatus,
    operationalStatus,
    note: v.optional(v.string()),
  }).index('by_operation', ['operationId']),

  /** Comprovante emitido após a confirmação do pagamento. Imutável. */
  receipts: defineTable({
    operationId: v.id('paymentOperations'),
    transactionId: v.id('paymentTransactions'),
    /** Sequencial legível por ano civil de São Paulo, ex.: `SC-2026-000001`. */
    receiptNumber: v.string(),
    /** Arquivo (PDF) no Convex File Storage; preenchido quando a geração do arquivo existir. */
    fileStorageId: v.optional(v.id('_storage')),
  })
    .index('by_operation', ['operationId'])
    // Geração do próximo número e validação de comprovantes.
    .index('by_receipt_number', ['receiptNumber']),

  /** Histórico de envios ao associado. Uma linha por tentativa de envio. */
  notifications: defineTable({
    operationId: v.id('paymentOperations'),
    /** Comprovante (`receipt`) ou atualização sobre análise (`payment_under_review`). */
    kind: notificationKind,
    /** Presente apenas quando `kind` é `receipt`. */
    receiptId: v.optional(v.id('receipts')),
    channel: notificationChannel,
    /** Destino mascarado. O destino real é lido do titular no momento do envio. */
    recipientMasked: v.string(),
    status: notificationStatus,
    providerMessageId: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    sentAt: v.optional(v.number()),
  }).index('by_operation', ['operationId']),
})
