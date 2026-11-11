import { convexTest } from 'convex-test'
import { ConvexError } from 'convex/values'
import { expect } from 'vitest'
import { internal } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
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
