import { v } from 'convex/values'
import { internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { action, mutation, query } from '../_generated/server'
import {
  CREATE_OPERATION_MAX_PER_MEMBER,
  CREATE_OPERATION_WINDOW_MS,
  MAX_PAYMENT_TOKEN_LENGTH,
} from '../domain/limits'
import type { OperationPresentation } from '../domain/messages'
import { hashRequestKey, isValidRequestId, readTokenSecrets } from '../domain/idempotency'
import { hashAccessToken } from '../domain/privacy'
import { publicError, publicMessage, type PublicErrorCode } from '../domain/publicErrors'
import { paymentMethod } from '../domain/statuses'
import type {
  FinancialStatus,
  HouseholdRole,
  OperationalStatus,
  PaymentProviderName,
} from '../domain/statuses'
import { defaultUsagePolicy } from '../domain/usagePolicy'
import { resolveMemberSelection } from '../members/family'
import { requireSession } from '../members/sessions'
import { findConflicts } from '../payments/claims'
import {
  buildPaymentView,
  describeOperationState,
  type PaymentView,
  type StartPaymentResult,
} from '../payments/chargeView'
import {
  createOperationCore,
  findOperationByRequest,
  replayOperation,
} from '../payments/operations'
import { ProviderError } from '../providers/errors'
import type { CardCharge, PixCharge } from '../providers/paymentProvider'
import { getPaymentProvider } from '../providers/registry'
import { readRateLimit, recordRateLimitHit } from '../security/rateLimit'

/**
 * FUNÇÕES PÚBLICAS: duplicidade, criação, cobrança e consulta de operação.
 * O navegador nunca envia valores nem estados: só *quem* (vínculos), *quando* (data) e *como
 * pagar* (Pix ou token de cartão). Não existe função pública que confirme pagamento ou altere
 * estado financeiro/operacional: isso só acontece por notificações autenticadas do provedor, fora desta pasta.
 */

const selectionArgs = {
  memberId: v.id('members'),
  /** Prova de identificação emitida por `public/members:lookup`. */
  identificationToken: v.string(),
  linkIds: v.array(v.id('householdLinks')),
}

export type CheckDuplicatesResult =
  | {
      ok: true
      usageDate: string
      hasConflicts: boolean
      /** Pessoas da seleção que já têm cobrança incompatível na data. */
      conflicts: { linkId: Id<'householdLinks'>; name: string }[]
    }
  | { ok: false; code: PublicErrorCode; message: string }

/**
 * Consulta de duplicidade. Informa quais pessoas SELECIONADAS (e já verificadas como membros
 * deste grupo familiar) possuem operação pendente, paga ou tardia em análise na data. Operação
 * expirada sem recebimento não bloqueia.
 *
 * É apenas informativa: entre esta consulta e a criação, outra solicitação pode ocupar a data.
 * A garantia de exclusividade está em `createOperation` (mesma transação da verificação).
 * Não revela de quem é a operação conflitante, nem de outros titulares.
 */
export const checkDuplicates = query({
  args: { ...selectionArgs, usageDate: v.string() },
  handler: async (ctx, args): Promise<CheckDuplicatesResult> => {
    await requireSession(ctx, args.memberId, args.identificationToken)

    const dateCheck = defaultUsagePolicy.checkUsageDate(args.usageDate, Date.now())
    if (!dateCheck.ok) {
      return { ok: false, code: dateCheck.code, message: publicMessage(dateCheck.code) }
    }
    const selection = await resolveMemberSelection(ctx, args.memberId, args.linkIds)
    if (!selection.ok) {
      return { ok: false, code: selection.code, message: publicMessage(selection.code) }
    }

    const conflicts = await findConflicts(ctx, selection.people, args.usageDate)
    return {
      ok: true,
      usageDate: args.usageDate,
      hasConflicts: conflicts.length > 0,
      conflicts: conflicts.map((person) => ({ linkId: person.linkId, name: person.name })),
    }
  },
})

export interface CreateOperationResult {
  operationId: Id<'paymentOperations'>
  /** Credencial para acompanhar ESTA operação (`getOperation`). Só o hash é guardado. */
  accessToken: string
  usageDate: string
  quantity: number
  /** Em centavos. Calculado pelo servidor. */
  unitAmountCents: number
  totalAmountCents: number
  /** Instante (UTC, ms) em que o prazo de pagamento termina. */
  expiresAt: number
  people: { name: string; role: HouseholdRole }[]
  /**
   * `true` quando esta chamada repetiu uma solicitação já atendida (mesmo `requestId`) e devolveu
   * a operação ORIGINAL, com o mesmo `accessToken`. O estado é o da criação: consulte
   * `getOperation` para o estado oficial.
   */
  reused: boolean
}

/**
 * Cria a operação de pagamento. Revalida tudo no servidor (prova de identificação, pessoas,
 * data, duplicidade), calcula quantidade e total (R$ 30,00 por pessoa), define a expiração em
 * 15 minutos e agenda a expiração. Argumentos extras (por exemplo um `totalAmountCents`
 * enviado pelo navegador) são recusados pelo validador do Convex.
 *
 * Duplicidade com operações simultâneas: a verificação e a inserção das reservas ocorrem nesta
 * mesma mutation, que é uma transação serializável com controle otimista de concorrência
 * (ver docs/business-rules.md).
 *
 * IDEMPOTÊNCIA (`requestId` opcional, UUID gerado pelo navegador por tentativa de confirmação):
 * a repetição da MESMA solicitação (mesmo associado, mesmo `requestId`, mesmos dados) não cria
 * outra operação: devolve a original, com o mesmo `accessToken` (derivado por HMAC) e
 * `reused: true`. A consulta da chave e a inserção ocorrem nesta mesma transação; chamadas
 * simultâneas com a mesma chave resultam em uma única operação. O mesmo `requestId` com outros
 * dados é recusado (`request_id_conflict`). Sem `requestId` o comportamento é o original.
 * Só o hash da chave e o hash do token são guardados.
 */
export const createOperation = mutation({
  args: { ...selectionArgs, usageDate: v.string(), requestId: v.optional(v.string()) },
  handler: async (ctx, args): Promise<CreateOperationResult> => {
    await requireSession(ctx, args.memberId, args.identificationToken)

    let request: { requestId: string; requestKeyHash: string; secret: string } | undefined
    if (args.requestId !== undefined) {
      if (!isValidRequestId(args.requestId)) throw publicError('invalid_request_id')
      const secrets = readTokenSecrets(process.env)
      if (secrets.length === 0) {
        console.error('createOperation: OPERATION_TOKEN_SECRET ausente ou curto')
        throw publicError('service_unavailable')
      }
      const requestKeyHash = await hashRequestKey(args.memberId, args.requestId)

      // Repetição: devolve a original, sem passar pelo limite de criações nem pela duplicidade
      // (a própria operação original é quem reserva as pessoas).
      const existing = await findOperationByRequest(ctx, args.memberId, requestKeyHash)
      if (existing) {
        return await replayOperation(ctx, existing, {
          memberId: args.memberId,
          usageDate: args.usageDate,
          linkIds: args.linkIds,
          request: { requestId: args.requestId, secrets },
        })
      }
      request = { requestId: args.requestId, requestKeyHash, secret: secrets[0]! }
    }

    // Proteção contra abuso: limite de operações criadas por titular. O contador só avança
    // quando a criação termina com sucesso (um erro desfaz a transação).
    const now = Date.now()
    const key = `create:${args.memberId}`
    const usage = await readRateLimit(ctx, key, now)
    if (usage.count >= CREATE_OPERATION_MAX_PER_MEMBER) {
      throw publicError('too_many_requests', {
        retryAfterSeconds: Math.ceil(usage.retryAfterMs / 1000),
      })
    }

    const created = await createOperationCore(ctx, {
      memberId: args.memberId,
      usageDate: args.usageDate,
      linkIds: args.linkIds,
      ...(request ? { request } : {}),
    })
    await recordRateLimitHit(ctx, key, CREATE_OPERATION_WINDOW_MS, now)
    return created
  },
})

export interface ReceiptSummary {
  receiptNumber: string
  /** PDF já gravado no File Storage. */
  fileReady: boolean
}

export interface NotificationSummary {
  channel: 'email' | 'whatsapp'
  status: 'pending' | 'sent' | 'failed' | 'not_configured'
  /** Motivo sanitizado (nunca stack/token). */
  failureReason: string | null
}

export interface OperationView {
  operationId: Id<'paymentOperations'>
  usageDate: string
  quantity: number
  unitAmountCents: number
  totalAmountCents: number
  expiresAt: number
  /**
   * Estado operacional EXIBIDO. Se o prazo já passou e a expiração agendada ainda não rodou,
   * mostra `expired` (a mutation de expiração é quem, de fato, libera as reservas).
   */
  operationalStatus: OperationalStatus
  financialStatus: FinancialStatus
  /** Código e texto para exibir ao associado (o motivo interno da análise não é exposto). */
  presentation: OperationPresentation
  people: { name: string; role: HouseholdRole }[]
  /** Número do comprovante, quando já emitido. Preferir `receipt` quando presente. */
  receiptNumber: string | null
  /** Comprovante definitivo (só existe após confirmação válida). */
  receipt: ReceiptSummary | null
  /** Último estado conhecido por canal (e-mail / WhatsApp). */
  notifications: NotificationSummary[]
  /** Instante da confirmação (ms), quando houver. */
  paidAt: number | null
  /** Cobrança mais recente da operação (para reexibir o Pix após recarregar a página). */
  payment: PaymentView | null
}

/**
 * Consulta de uma operação pela credencial dela (`operationId` + `accessToken`). Operação
 * inexistente e credencial incorreta produzem a mesma resposta (`operation_not_found`), então
 * não há como consultar operações de terceiros nem descobrir se um id existe. Não devolve
 * `memberId`, `personId`, ids de vínculo, CPF, contato nem transações do provedor.
 */
export const getOperation = query({
  args: { operationId: v.id('paymentOperations'), accessToken: v.string() },
  handler: async (ctx, args): Promise<OperationView> => {
    const operation = await ctx.db.get(args.operationId)
    const providedHash =
      args.accessToken.length > 0 && args.accessToken.length <= 128
        ? await hashAccessToken(args.accessToken)
        : null
    if (!operation || providedHash === null || operation.accessTokenHash !== providedHash) {
      throw publicError('operation_not_found')
    }

    const people = await ctx.db
      .query('operationPeople')
      .withIndex('by_operation', (q) => q.eq('operationId', operation._id))
      .collect()
    const receipt = await ctx.db
      .query('receipts')
      .withIndex('by_operation', (q) => q.eq('operationId', operation._id))
      .first()
    const notificationRows = await ctx.db
      .query('notifications')
      .withIndex('by_operation', (q) => q.eq('operationId', operation._id))
      .collect()
    const latestByChannel = new Map<string, (typeof notificationRows)[number]>()
    for (const row of notificationRows.sort((a, b) => a._creationTime - b._creationTime)) {
      latestByChannel.set(row.channel, row)
    }

    const now = Date.now()
    const state = describeOperationState(operation, now)
    const latestTransaction = await ctx.db
      .query('paymentTransactions')
      .withIndex('by_operation', (q) => q.eq('operationId', operation._id))
      .order('desc')
      .first()

    return {
      operationId: operation._id,
      usageDate: operation.usageDate,
      quantity: operation.quantity,
      unitAmountCents: operation.unitAmountCents,
      totalAmountCents: operation.totalAmountCents,
      expiresAt: operation.expiresAt,
      operationalStatus: state.operationalStatus,
      financialStatus: state.financialStatus,
      presentation: state.presentation,
      people: people.map((person) => ({ name: person.name, role: person.role })),
      receiptNumber: receipt?.receiptNumber ?? null,
      receipt: receipt
        ? {
            receiptNumber: receipt.receiptNumber,
            fileReady: receipt.fileStorageId !== undefined,
          }
        : null,
      notifications: [...latestByChannel.values()].map((row) => ({
        channel: row.channel,
        status: row.status,
        failureReason: row.failureReason ?? null,
      })),
      paidAt: operation.paidAt ?? null,
      payment: latestTransaction ? buildPaymentView(operation, latestTransaction, now) : null,
    }
  },
})

/**
 * Inicia o pagamento (Pix ou cartão) de uma operação existente.
 *
 * Recebe apenas a identificação da operação (`operationId` + `accessToken`, a mesma credencial de
 * `getOperation`), a forma de pagamento e, para cartão, o TOKEN gerado pelo SDK do provedor no
 * navegador. NUNCA recebe valor, estado, prazo, número de cartão, CVV ou dado bancário; qualquer
 * campo extra é recusado pelo validador do Convex. O valor cobrado é sempre o total armazenado da
 * operação.
 *
 * Validações (todas no servidor, em `payments/charges:begin`): a operação existe e a credencial
 * confere; está pendente (`unpaid` + `awaiting_payment`) e dentro do prazo; tem pessoas
 * selecionadas; o total é consistente (`quantidade × unitário`, inteiro e positivo); não há
 * cobrança anterior incompatível.
 *
 * Idempotência: repetir a chamada devolve a mesma cobrança (`reused: true`) sem chamar o
 * provedor; chamadas simultâneas competem pela mesma tentativa, registrada antes da chamada
 * externa, e a perdedora recebe `payment_in_progress` (basta repetir). A chave enviada ao
 * provedor é estável por operação, forma de pagamento e tentativa.
 *
 * O resultado da cobrança (ex.: cartão aprovado) entra pela porta única de eventos do provedor,
 * então um pagamento aprovado após o prazo vira `paid_late` + análise, nunca liberação
 * automática. O token de cartão não é gravado nem registrado em log.
 */
export const startPayment = action({
  args: {
    operationId: v.id('paymentOperations'),
    accessToken: v.string(),
    paymentMethod,
    /** Somente cartão: token do provedor (nunca dados do cartão). */
    paymentMethodToken: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<StartPaymentResult> => {
    const token = args.paymentMethodToken
    if (args.paymentMethod === 'pix' && token !== undefined) {
      throw publicError('invalid_payment_method')
    }
    if (
      args.paymentMethod === 'card' &&
      (token === undefined || token.length === 0 || token.length > MAX_PAYMENT_TOKEN_LENGTH)
    ) {
      throw publicError('invalid_payment_method')
    }
    if (args.accessToken.length === 0 || args.accessToken.length > 128) {
      throw publicError('operation_not_found')
    }

    const begun = await ctx.runMutation(internal.payments.charges.begin, {
      operationId: args.operationId,
      accessTokenHash: await hashAccessToken(args.accessToken),
      method: args.paymentMethod,
    })
    if (begun.kind === 'existing') return begun.result

    // A tentativa já está registrada. A chamada ao provedor usa o valor lido da operação.
    let providerName: PaymentProviderName
    let charge: PixCharge | CardCharge
    try {
      const provider = getPaymentProvider()
      providerName = provider.name
      const base = {
        operationId: begun.operationId,
        idempotencyKey: begun.idempotencyKey,
        amountCents: begun.amountCents,
        description: begun.description,
        expiresAt: begun.expiresAt,
      }
      charge =
        args.paymentMethod === 'pix'
          ? await provider.createPixCharge(base)
          : await provider.createCardCharge({ ...base, paymentMethodToken: token ?? '' })

      if (
        typeof charge.providerTransactionId !== 'string' ||
        charge.providerTransactionId.length === 0 ||
        charge.amountCents !== begun.amountCents
      ) {
        // O provedor respondeu algo diferente do que foi pedido: não registramos como válido.
        throw new ProviderError('rejected', 'Resposta do provedor inconsistente com o pedido.')
      }
    } catch (error) {
      const code = error instanceof ProviderError ? error.code : 'unknown'
      await ctx.runMutation(internal.payments.charges.fail, {
        attemptId: begun.attemptId,
        errorCode: code,
      })
      // Só o código técnico vai para o log (nunca o token nem dados do cartão).
      console.error('startPayment: falha no PaymentProvider', code)
      throw publicError(
        code === 'invalid_request' && args.paymentMethod === 'card'
          ? 'invalid_payment_token'
          : 'service_unavailable',
      )
    }

    return await ctx.runMutation(internal.payments.charges.complete, {
      attemptId: begun.attemptId,
      provider: providerName,
      charge: {
        providerTransactionId: charge.providerTransactionId,
        status: charge.status,
        amountCents: charge.amountCents,
        ...('pixCopyPasteCode' in charge
          ? {
              pixCopyPasteCode: charge.pixCopyPasteCode,
              qrCode: charge.qrCode,
              chargeExpiresAt: charge.expiresAt,
            }
          : charge.failureReason !== null
            ? { failureReason: charge.failureReason }
            : {}),
      },
    })
  },
})

export interface ReceiptDownloadResult {
  receiptNumber: string
  /** URL temporária do File Storage (não permanente e sem listagem pública). */
  url: string
}

/**
 * Download autorizado do PDF. Exige a mesma credencial da operação. Não gera outro comprovante.
 * Operações em análise ou sem confirmação recebem `receipt_not_available`.
 */
export const getReceiptDownloadUrl = action({
  args: {
    operationId: v.id('paymentOperations'),
    accessToken: v.string(),
  },
  handler: async (ctx, args): Promise<ReceiptDownloadResult> => {
    if (args.accessToken.length === 0 || args.accessToken.length > 128) {
      throw publicError('operation_not_found')
    }
    const access = await ctx.runQuery(internal.notifications.receiptAccess.resolveDownload, {
      operationId: args.operationId,
      accessTokenHash: await hashAccessToken(args.accessToken),
    })
    if (access.kind === 'not_found') throw publicError('operation_not_found')
    if (access.kind === 'unavailable') throw publicError('receipt_not_available')
    if (access.kind === 'not_ready') throw publicError('receipt_file_not_ready')

    const url = await ctx.storage.getUrl(access.storageId)
    if (!url) throw publicError('receipt_file_not_ready')
    return { receiptNumber: access.receiptNumber, url }
  },
})

export interface RequestReceiptEmailResult {
  status: 'queued' | 'already_sent' | 'in_progress'
}

/**
 * Solicita (re)envio do e-mail do comprovante. Não altera estado financeiro e não reemite PDF.
 * Só aceita operação confirmada com comprovante. Idempotente: se já enviado/pendente, informa.
 */
export const requestReceiptEmail = action({
  args: {
    operationId: v.id('paymentOperations'),
    accessToken: v.string(),
  },
  handler: async (ctx, args): Promise<RequestReceiptEmailResult> => {
    if (args.accessToken.length === 0 || args.accessToken.length > 128) {
      throw publicError('operation_not_found')
    }
    const access = await ctx.runQuery(internal.notifications.receiptAccess.resolveDownload, {
      operationId: args.operationId,
      accessTokenHash: await hashAccessToken(args.accessToken),
    })
    if (access.kind === 'not_found') throw publicError('operation_not_found')
    if (access.kind === 'unavailable') throw publicError('receipt_not_available')
    // Arquivo ainda gerando: mesmo assim o registro do comprovante existe e o e-mail pode
    // ser enfileirado; o anexo usa URL quando o PDF já estiver pronto.

    const result = await ctx.runMutation(internal.notifications.outbox.enqueueReceiptEmailRetry, {
      operationId: args.operationId,
      receiptId: access.receiptId,
    })
    if (result.queued) return { status: 'queued' }
    if (result.status === 'sent') throw publicError('email_already_sent')
    if (result.status === 'pending') throw publicError('email_in_progress')
    return { status: 'queued' }
  },
})
