// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { internal } from '../../convex/_generated/api'
import {
  FIFTEEN_MINUTES,
  NOW,
  USAGE_DATE,
  confirmPayment,
  createBackend,
  createOperation,
  expectConvexError,
  expireOperation,
  loadOperation,
  loadPeople,
  seedFamily,
  seedTransaction,
  type Backend,
} from './helpers'

let t: Backend

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  t = createBackend()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('prevenção de duplicidade (pessoa + data)', () => {
  it('bloqueia nova operação para a mesma pessoa e data enquanto há uma pendente', async () => {
    const family = await seedFamily(t)
    await createOperation(t, family, { people: [{ linkId: family.holderLinkId }] })

    await expectConvexError(
      createOperation(t, family, { people: [{ linkId: family.holderLinkId }] }),
      'duplicate_usage',
    )
  })

  it('bloqueia se QUALQUER pessoa selecionada já estiver reservada e não cria nada', async () => {
    const family = await seedFamily(t)
    const [first, second] = family.dependentLinkIds
    await createOperation(t, family, { people: [{ linkId: first }] })

    await expectConvexError(
      createOperation(t, family, {
        people: [{ linkId: second }, { linkId: first }],
      }),
      'duplicate_usage',
    )
    // A pessoa livre não foi reservada pela tentativa rejeitada.
    const retry = await createOperation(t, family, {
      people: [{ linkId: second }],
    })
    expect(retry.quantity).toBe(1)
  })

  it('permite pessoas diferentes na mesma data e a mesma pessoa em datas diferentes', async () => {
    const family = await seedFamily(t)
    const [first, second] = family.dependentLinkIds
    await createOperation(t, family, { people: [{ linkId: first }] })

    await expect(
      createOperation(t, family, { people: [{ linkId: second }] }),
    ).resolves.toBeDefined()
    await expect(
      createOperation(t, family, {
        usageDate: '2026-12-11',
        people: [{ linkId: first }],
      }),
    ).resolves.toBeDefined()
  })

  it('bloqueia pagamento já aprovado para a mesma pessoa e data', async () => {
    const family = await seedFamily(t)
    const operation = await createOperation(t, family, {
      people: [{ linkId: family.holderLinkId }],
    })
    await seedTransaction(t, operation.operationId, {
      providerTransactionId: 'mock_pix_pending_a',
      amountCents: 3000,
    })
    await confirmPayment(t, {
      providerTransactionId: 'mock_pix_pending_a',
      occurredAt: NOW + 60_000,
      amountCents: 3000,
    })

    await expectConvexError(
      createOperation(t, family, { people: [{ linkId: family.holderLinkId }] }),
      'duplicate_usage',
    )
  })

  it('duas solicitações simultâneas: no máximo uma passa pela validação', async () => {
    const family = await seedFamily(t)
    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        createOperation(t, family, { people: [{ linkId: family.holderLinkId }] }),
      ),
    )

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1)
    const rejected = attempts.filter((attempt) => attempt.status === 'rejected')
    expect(rejected).toHaveLength(4)

    const activeClaims = await t.run((ctx) =>
      ctx.db
        .query('operationPeople')
        .withIndex('by_person_date_claim', (q) =>
          q
            .eq('personId', family.personIds.holder)
            .eq('usageDate', USAGE_DATE)
            .eq('claim', 'active'),
        )
        .collect(),
    )
    expect(activeClaims).toHaveLength(1)
  })

  it('o navegador não consegue enviar valores: argumentos desconhecidos são recusados', async () => {
    const family = await seedFamily(t)
    await expect(
      t.mutation(internal.payments.operations.create, {
        memberId: family.memberId,
        usageDate: USAGE_DATE,
        people: [{ linkId: family.holderLinkId }],
        // @ts-expect-error valor de cobrança não faz parte do contrato
        totalAmountCents: 1,
      }),
    ).rejects.toThrow()
  })
})

describe('operações expiradas, tardias e em análise', () => {
  it('operação expirada sem recebimento NÃO bloqueia nova tentativa', async () => {
    const family = await seedFamily(t)
    const first = await createOperation(t, family, { people: [{ linkId: family.holderLinkId }] })

    vi.setSystemTime(NOW + FIFTEEN_MINUTES)
    await expireOperation(t, first.operationId)

    const people = await loadPeople(t, first.operationId)
    expect(people.every((person) => person.claim === 'released')).toBe(true)

    const second = await createOperation(t, family, { people: [{ linkId: family.holderLinkId }] })
    expect(second.operationId).not.toBe(first.operationId)
  })

  it('pagamento tardio em análise continua bloqueando novas cobranças', async () => {
    const family = await seedFamily(t)
    const first = await createOperation(t, family, { people: [{ linkId: family.holderLinkId }] })
    await seedTransaction(t, first.operationId, {
      providerTransactionId: 'mock_pix_pending_late',
      amountCents: 3000,
    })

    // Pago depois dos 15 minutos, com a operação já expirada e as reservas liberadas.
    vi.setSystemTime(NOW + FIFTEEN_MINUTES + 120_000)
    await expireOperation(t, first.operationId)
    await confirmPayment(t, {
      providerTransactionId: 'mock_pix_pending_late',
      occurredAt: NOW + FIFTEEN_MINUTES + 60_000,
      amountCents: 3000,
    })

    expect((await loadOperation(t, first.operationId))?.operationalStatus).toBe('under_review')
    await expectConvexError(
      createOperation(t, family, { people: [{ linkId: family.holderLinkId }] }),
      'duplicate_usage',
    )
  })

  it('análise rejeitada libera a pessoa para uma nova tentativa', async () => {
    const family = await seedFamily(t)
    const first = await createOperation(t, family, { people: [{ linkId: family.holderLinkId }] })
    await seedTransaction(t, first.operationId, {
      providerTransactionId: 'mock_pix_pending_rej',
      amountCents: 3000,
    })
    vi.setSystemTime(NOW + FIFTEEN_MINUTES + 120_000)
    await confirmPayment(t, {
      providerTransactionId: 'mock_pix_pending_rej',
      occurredAt: NOW + FIFTEEN_MINUTES + 60_000,
      amountCents: 3000,
    })

    const review = await t.run((ctx) => ctx.db.query('paymentReviews').first())
    if (!review) throw new Error('Análise não encontrada.')
    await t.mutation(internal.payments.reviews.resolve, {
      reviewId: review._id,
      decision: 'rejected',
      resolvedBy: 'admin-de-teste',
    })

    await expect(
      createOperation(t, family, { people: [{ linkId: family.holderLinkId }] }),
    ).resolves.toBeDefined()
  })
})

describe('validações da criação', () => {
  it('bloqueia datas passadas no backend', async () => {
    const family = await seedFamily(t)
    await expectConvexError(
      createOperation(t, family, {
        usageDate: '2026-11-30',
        people: [{ linkId: family.holderLinkId }],
      }),
      'past_usage_date',
    )
  })

  it('bloqueia datas inválidas', async () => {
    const family = await seedFamily(t)
    await expectConvexError(
      createOperation(t, family, {
        usageDate: '2026-02-30',
        people: [{ linkId: family.holderLinkId }],
      }),
      'invalid_usage_date',
    )
  })

  it('não cria operação para titular inativo', async () => {
    const family = await seedFamily(t, { status: 'inactive' })
    await expectConvexError(
      createOperation(t, family, { people: [{ linkId: family.holderLinkId }] }),
      'member_inactive',
    )
  })

  it('não cria operação com dependente inativo', async () => {
    const family = await seedFamily(t)
    await expectConvexError(
      createOperation(t, family, {
        people: [{ linkId: family.inactiveLinkId }],
      }),
      'link_inactive',
    )
  })

  it('não aceita dependente de outro titular', async () => {
    const family = await seedFamily(t)
    const other = await seedFamily(t, { membershipNumber: 'T-0002' })
    await expectConvexError(
      createOperation(t, family, {
        people: [{ linkId: other.dependentLinkIds[0] }],
      }),
      'link_not_found',
    )
  })

  it('seleção individual: calcula valor, quantidade e prazo no backend', async () => {
    const family = await seedFamily(t)
    const onlyDependents = await createOperation(t, family, {
      people: [{ linkId: family.dependentLinkIds[0] }, { linkId: family.dependentLinkIds[1] }],
    })
    expect(onlyDependents).toMatchObject({
      quantity: 2,
      unitAmountCents: 3000,
      totalAmountCents: 6000,
      expiresAt: NOW + FIFTEEN_MINUTES,
    })

    const people = await loadPeople(t, onlyDependents.operationId)
    expect(people.map((person) => person.role)).toEqual(['spouse', 'child'])
    expect(people.map((person) => person.personId)).toEqual([
      family.personIds.bruno,
      family.personIds.clara,
    ])
  })
})

describe('duplicidade global por personId (entre titulares diferentes)', () => {
  const SHARED = 'p-shared-clara'

  it('a mesma pessoa em duas famílias não pode ser cobrada duas vezes na mesma data', async () => {
    const mother = await seedFamily(t, { membershipNumber: 'T-0001', sharedPersonId: SHARED })
    const father = await seedFamily(t, { membershipNumber: 'T-0002', sharedPersonId: SHARED })
    // Vínculos diferentes, mesma pessoa.
    expect(mother.dependentLinkIds[1]).not.toBe(father.dependentLinkIds[1])

    await createOperation(t, mother, { people: [{ linkId: mother.dependentLinkIds[1] }] })

    await expectConvexError(
      createOperation(t, father, { people: [{ linkId: father.dependentLinkIds[1] }] }),
      'duplicate_usage',
    )
  })

  it('o bloqueio vale para pessoa já paga por outro titular na data', async () => {
    const mother = await seedFamily(t, { membershipNumber: 'T-0001', sharedPersonId: SHARED })
    const father = await seedFamily(t, { membershipNumber: 'T-0002', sharedPersonId: SHARED })
    const operation = await createOperation(t, mother, {
      people: [{ linkId: mother.dependentLinkIds[1] }],
    })
    await seedTransaction(t, operation.operationId, {
      providerTransactionId: 'tx-shared',
      amountCents: operation.totalAmountCents,
    })
    await confirmPayment(t, {
      providerTransactionId: 'tx-shared',
      occurredAt: NOW + 1000,
      amountCents: operation.totalAmountCents,
    })

    await expectConvexError(
      createOperation(t, father, { people: [{ linkId: father.dependentLinkIds[1] }] }),
      'duplicate_usage',
    )
  })

  it('em outra data, ou após a expiração da operação, o outro titular pode cobrar a pessoa', async () => {
    const mother = await seedFamily(t, { membershipNumber: 'T-0001', sharedPersonId: SHARED })
    const father = await seedFamily(t, { membershipNumber: 'T-0002', sharedPersonId: SHARED })
    const first = await createOperation(t, mother, {
      people: [{ linkId: mother.dependentLinkIds[1] }],
    })

    const otherDate = await createOperation(t, father, {
      usageDate: '2026-12-11',
      people: [{ linkId: father.dependentLinkIds[1] }],
    })
    expect(otherDate.quantity).toBe(1)

    // O relógio simulado avança alguns ms por operação: usa-se o prazo exato da operação.
    vi.setSystemTime(first.expiresAt)
    await expireOperation(t, first.operationId)
    const afterExpiry = await createOperation(t, father, {
      people: [{ linkId: father.dependentLinkIds[1] }],
    })
    expect(afterExpiry.quantity).toBe(1)
  })

  it('pessoas com personId diferente não se bloqueiam, mesmo com nomes iguais', async () => {
    const one = await seedFamily(t, { membershipNumber: 'T-0001' })
    const two = await seedFamily(t, { membershipNumber: 'T-0002' })
    await createOperation(t, one, { people: [{ linkId: one.dependentLinkIds[1] }] })
    const result = await createOperation(t, two, { people: [{ linkId: two.dependentLinkIds[1] }] })
    expect(result.quantity).toBe(1)
  })

  it('a reserva guarda o personId (não o id do vínculo) e o papel', async () => {
    const mother = await seedFamily(t, { membershipNumber: 'T-0001', sharedPersonId: SHARED })
    const operation = await createOperation(t, mother, {
      people: [{ linkId: mother.dependentLinkIds[1] }],
    })
    const [person] = await loadPeople(t, operation.operationId)
    expect(person).toMatchObject({
      personId: SHARED,
      linkId: mother.dependentLinkIds[1],
      role: 'child',
    })
  })
})
