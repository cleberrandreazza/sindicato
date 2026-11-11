import { convexTest } from 'convex-test'
import { ConvexError } from 'convex/values'
import { expect, vi } from 'vitest'
import { api, internal } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { issueSession } from '../../convex/members/sessions'
import schema from '../../convex/schema'

const modules = import.meta.glob('../../convex/**/*.*s')

export function createBackend() {
  return convexTest(schema, modules)
}
export type Backend = ReturnType<typeof createBackend>

/** Segunda-feira, 12:00 em São Paulo. Todos os cenários partem deste instante. */
export const NOW = Date.UTC(2026, 11, 1, 15, 0, 0)
export const USAGE_DATE = '2026-12-10'
export const FIFTEEN_MINUTES = 15 * 60 * 1000

export interface Fixture {
  memberId: Id<'members'>
  /** Vínculo do próprio titular (papel `holder`). */
  holderLinkId: Id<'householdLinks'>
  /** Vínculos de dependentes ativos: [Bruno, Clara]. */
  dependentLinkIds: [Id<'householdLinks'>, Id<'householdLinks'>]
  inactiveLinkId: Id<'householdLinks'>
  /** Identificadores estáveis das pessoas (`people.personId`), distintos dos ids de vínculo. */
  personIds: { holder: string; bruno: string; clara: string; helena: string }
}

/**
 * Dados 100% fictícios. Cada família tem 4 pessoas com `personId` derivado da carteirinha, salvo
 * `sharedPersonId`: faz o segundo dependente (Clara) ser a MESMA pessoa de outra família (mesmo
 * `personId`, vínculo próprio), como uma filha de dois titulares.
 */
export async function seedFamily(
  t: Backend,
  options: {
    membershipNumber?: string
    status?: 'active' | 'inactive'
    sharedPersonId?: string
  } = {},
): Promise<Fixture> {
  const membershipNumber = options.membershipNumber ?? 'T-0001'
  return await t.run(async (ctx) => {
    const memberId = await ctx.db.insert('members', {
      membershipNumber,
      cpfHash: `hash-${membershipNumber}`,
      cpfMasked: '***.***.***-00',
      status: options.status ?? 'active',
      updatedAt: NOW,
    })
    const ensurePerson = async (personId: string, name: string) => {
      const existing = await ctx.db
        .query('people')
        .withIndex('by_person_id', (q) => q.eq('personId', personId))
        .unique()
      if (existing) return existing._id
      return await ctx.db.insert('people', { personId, name, updatedAt: NOW })
    }
    const insertLink = async (
      externalLinkId: string,
      personId: string,
      name: string,
      role: 'holder' | 'spouse' | 'child',
      status: 'active' | 'inactive',
    ) =>
      ctx.db.insert('householdLinks', {
        memberId,
        personRef: await ensurePerson(personId, name),
        externalLinkId,
        role,
        status,
        updatedAt: NOW,
      })

    const personIds = {
      holder: `p-${membershipNumber}-holder`,
      bruno: `p-${membershipNumber}-bruno`,
      clara: options.sharedPersonId ?? `p-${membershipNumber}-clara`,
      helena: `p-${membershipNumber}-helena`,
    }
    const holderLinkId = await insertLink(
      'holder',
      personIds.holder,
      'Ana Teste',
      'holder',
      'active',
    )
    const first = await insertLink('dep-1', personIds.bruno, 'Bruno Teste', 'spouse', 'active')
    const second = await insertLink('dep-2', personIds.clara, 'Clara Teste', 'child', 'active')
    const inactiveLinkId = await insertLink(
      'dep-3',
      personIds.helena,
      'Helena Teste',
      'child',
      'inactive',
    )
    return { memberId, holderLinkId, dependentLinkIds: [first, second], inactiveLinkId, personIds }
  })
}

export function createOperation(
  t: Backend,
  fixture: Fixture,
  options: {
    usageDate?: string
    people?: { linkId: Id<'householdLinks'> }[]
  } = {},
) {
  return t.mutation(internal.payments.operations.create, {
    memberId: fixture.memberId,
    usageDate: options.usageDate ?? USAGE_DATE,
    people: options.people ?? [
      { linkId: fixture.holderLinkId },
      { linkId: fixture.dependentLinkIds[0] },
    ],
  })
}

/** Registra uma cobrança pendente no provedor para a operação (simula `createPixCharge`). */
export function seedTransaction(
  t: Backend,
  operationId: Id<'paymentOperations'>,
  options: { providerTransactionId: string; amountCents: number },
) {
  return t.run((ctx) =>
    ctx.db.insert('paymentTransactions', {
      operationId,
      provider: 'mock',
      providerTransactionId: options.providerTransactionId,
      method: 'pix',
      amountCents: options.amountCents,
      status: 'pending',
      updatedAt: NOW,
    }),
  )
}

let eventCounter = 0

/**
 * Entrega um evento do provedor pela porta única (`providerEvents.ingest`) e devolve o resultado
 * do processamento (`result`) para que os cenários de ciclo de vida continuem iguais.
 * Por padrão cada chamada usa um `eventId` novo; passe `eventId` para simular reenvio.
 */
export async function confirmPayment(
  t: Backend,
  params: {
    providerTransactionId: string
    occurredAt: number
    amountCents: number
    status?: 'succeeded' | 'failed' | 'canceled' | 'expired' | 'pending'
    eventId?: string
  },
) {
  const ingested = await ingestEvent(t, params)
  if (ingested.result === null) {
    throw new Error('Evento repetido já resolvido: use ingestEvent para inspecionar o registro.')
  }
  return ingested.result
}

export function ingestEvent(
  t: Backend,
  params: {
    providerTransactionId: string
    occurredAt: number
    amountCents: number
    status?: 'succeeded' | 'failed' | 'canceled' | 'expired' | 'pending'
    eventId?: string
  },
) {
  eventCounter += 1
  return t.mutation(internal.payments.providerEvents.ingest, {
    provider: 'mock',
    eventId: params.eventId ?? `evt-${eventCounter}`,
    providerTransactionId: params.providerTransactionId,
    status: params.status ?? 'succeeded',
    amountCents: params.amountCents,
    occurredAt: params.occurredAt,
  })
}

export function loadProviderEvents(t: Backend) {
  return t.run((ctx) => ctx.db.query('providerEvents').collect())
}

export function expireOperation(t: Backend, operationId: Id<'paymentOperations'>) {
  return t.mutation(internal.payments.operations.expire, { operationId })
}

export async function expectConvexError(promise: Promise<unknown>, code: string) {
  try {
    await promise
  } catch (error) {
    if (error instanceof ConvexError) {
      expect(error.data).toMatchObject({ code })
      return
    }
    throw error
  }
  throw new Error(`Esperava ConvexError com code "${code}", mas a chamada foi bem-sucedida.`)
}

export function loadOperation(t: Backend, operationId: Id<'paymentOperations'>) {
  return t.run((ctx) => ctx.db.get(operationId))
}

export function loadPeople(t: Backend, operationId: Id<'paymentOperations'>) {
  return t.run((ctx) =>
    ctx.db
      .query('operationPeople')
      .withIndex('by_operation', (q) => q.eq('operationId', operationId))
      .collect(),
  )
}

export function loadReviews(t: Backend, operationId: Id<'paymentOperations'>) {
  return t.run((ctx) =>
    ctx.db
      .query('paymentReviews')
      .withIndex('by_operation', (q) => q.eq('operationId', operationId))
      .collect(),
  )
}

export function loadReceipts(t: Backend, operationId: Id<'paymentOperations'>) {
  return t.run((ctx) =>
    ctx.db
      .query('receipts')
      .withIndex('by_operation', (q) => q.eq('operationId', operationId))
      .collect(),
  )
}

export function loadEvents(t: Backend, operationId: Id<'paymentOperations'>) {
  return t.run((ctx) =>
    ctx.db
      .query('operationEvents')
      .withIndex('by_operation', (q) => q.eq('operationId', operationId))
      .collect(),
  )
}

export function loadTransaction(t: Backend, transactionId: Id<'paymentTransactions'>) {
  return t.run((ctx) => ctx.db.get(transactionId))
}

// ---------------------------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------------------------

/** Cadastros do provider mock (ver `convex/providers/mock/mockMembers.ts`). Dados fictícios. */
export const MOCK = {
  ana: { membershipNumber: '100001', cpf: '10000000108' }, // ativa, 2 dependentes (Bruno, Clara)
  carlos: { membershipNumber: '100002', cpf: '10000000280' }, // ativo, sem dependentes
  daniela: { membershipNumber: '100003', cpf: '10000000361' }, // ativa, 5 dependentes (1 inativo)
  igor: { membershipNumber: '900004', cpf: '90000000418' }, // INATIVO
} as const

/** Segredo de derivação do token de acesso (≥ 32 caracteres), só para testes. */
export const TEST_TOKEN_SECRET = 'segredo-de-token-de-teste-com-mais-de-32-caracteres'

/** Configura o ambiente do deployment simulado (providers mock + segredo do HMAC do CPF). */
export function stubPublicApiEnv() {
  vi.stubEnv('APP_ENV', 'development')
  vi.stubEnv('CPF_HASH_SECRET', 'segredo-de-teste-com-mais-de-16-chars')
  vi.stubEnv('OPERATION_TOKEN_SECRET', TEST_TOKEN_SECRET)
  vi.stubEnv('MEMBER_PROVIDER', 'mock')
  vi.stubEnv('PAYMENT_PROVIDER', 'mock')
  vi.stubEnv('NOTIFICATION_PROVIDER', 'mock')
}

export function lookup(t: Backend, input: { membershipNumber: string; cpf: string }) {
  return t.action(api.public.members.lookup, input)
}

/** Identifica um associado do mock e devolve o resultado com a prova de identificação. */
export async function identify(t: Backend, who: { membershipNumber: string; cpf: string }) {
  const result = await lookup(t, who)
  if (!result.session) throw new Error('Esperava uma prova de identificação.')
  return { ...result, token: result.session.token }
}

/** Emite uma prova de identificação para um titular criado por `seedFamily`. */
export function grantSession(t: Backend, memberId: Id<'members'>) {
  return t.run(async (ctx) => (await issueSession(ctx, memberId, Date.now())).token)
}

export function publicCreate(
  t: Backend,
  fixture: Fixture,
  token: string,
  options: { usageDate?: string; linkIds?: Id<'householdLinks'>[]; requestId?: string } = {},
) {
  return t.mutation(api.public.payments.createOperation, {
    memberId: fixture.memberId,
    identificationToken: token,
    usageDate: options.usageDate ?? USAGE_DATE,
    linkIds: options.linkIds ?? [fixture.holderLinkId, fixture.dependentLinkIds[0]],
    ...(options.requestId !== undefined ? { requestId: options.requestId } : {}),
  })
}

// ---------------------------------------------------------------------------------------------
// Cobranças
// ---------------------------------------------------------------------------------------------

export interface CreatedOperation {
  operationId: Id<'paymentOperations'>
  accessToken: string
  expiresAt: number
}

export type SimulatedOutcome = 'approved' | 'declined' | 'pending' | 'approved_after_expiry'

/** Inicia o pagamento pela função PÚBLICA (a mesma que a tela usará). */
export function startPayment(
  t: Backend,
  created: CreatedOperation,
  method: 'pix' | 'card',
  paymentMethodToken?: string,
) {
  return t.action(api.public.payments.startPayment, {
    operationId: created.operationId,
    accessToken: created.accessToken,
    paymentMethod: method,
    ...(paymentMethodToken !== undefined ? { paymentMethodToken } : {}),
  })
}

/** Simulação de desenvolvimento (função interna): faz o papel do provedor via webhook assinado. */
export function simulate(
  t: Backend,
  operationId: Id<'paymentOperations'>,
  outcome: SimulatedOutcome,
  eventId?: string,
) {
  return t.action(internal.dev.simulate.simulatePayment, {
    operationId,
    outcome,
    ...(eventId !== undefined ? { eventId } : {}),
  })
}

/** Simulação pública de demonstração (exige APP_ENV=demonstration + accessToken). */
export function simulateDemo(
  t: Backend,
  created: CreatedOperation,
  outcome: 'approved' | 'declined',
  accessToken = created.accessToken,
) {
  return t.action(api.public.payments.simulateDemoPayment, {
    operationId: created.operationId,
    accessToken,
    outcome,
  })
}

export function loadTransactions(t: Backend, operationId: Id<'paymentOperations'>) {
  return t.run((ctx) =>
    ctx.db
      .query('paymentTransactions')
      .withIndex('by_operation', (q) => q.eq('operationId', operationId))
      .collect(),
  )
}

export function loadAttempts(t: Backend, operationId: Id<'paymentOperations'>) {
  return t.run((ctx) =>
    ctx.db
      .query('chargeAttempts')
      .withIndex('by_operation', (q) => q.eq('operationId', operationId))
      .collect(),
  )
}

export function getOperationView(t: Backend, created: CreatedOperation) {
  return t.query(api.public.payments.getOperation, {
    operationId: created.operationId,
    accessToken: created.accessToken,
  })
}

/** Lê o `data` de um ConvexError lançado (ou falha se a chamada der certo). */
export async function errorData(promise: Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await promise
  } catch (error) {
    if (error instanceof ConvexError) return error.data as Record<string, unknown>
    throw error
  }
  throw new Error('Esperava um ConvexError, mas a chamada foi bem-sucedida.')
}
