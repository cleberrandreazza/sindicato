import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'

/**
 * Reservas por pessoa/data (`operationPeople.claim`).
 *
 * INVARIANTE: para cada (`personId`, `usageDate`) existe no máximo UMA linha `active`.
 *
 * Como o Convex garante: toda mutation é uma transação serializável com controle otimista de
 * concorrência. A consulta de `findActiveClaim` lê o intervalo
 * (`personId`, `usageDate`, `'active'`) do índice `by_person_date_claim`. Se outra transação
 * inserir ou ativar uma reserva nesse mesmo intervalo antes de esta commitar, o Convex detecta o
 * conflito de leitura/escrita e reexecuta esta mutation, que então enxerga a reserva existente e
 * recusa. Por isso verificar e inserir na MESMA mutation é seguro; verificar em uma query e
 * inserir em outra chamada não seria.
 */

export async function findActiveClaim(
  ctx: Pick<QueryCtx, 'db'>,
  personId: string,
  usageDate: string,
): Promise<Doc<'operationPeople'> | null> {
  return await ctx.db
    .query('operationPeople')
    .withIndex('by_person_date_claim', (q) =>
      q.eq('personId', personId).eq('usageDate', usageDate).eq('claim', 'active'),
    )
    .first()
}

/** Libera as reservas ativas da operação (ex.: expiração sem recebimento, análise rejeitada). */
export async function releaseClaims(ctx: MutationCtx, operationId: Id<'paymentOperations'>) {
  const rows = await ctx.db
    .query('operationPeople')
    .withIndex('by_operation', (q) => q.eq('operationId', operationId))
    .collect()
  for (const row of rows) {
    if (row.claim === 'active') await ctx.db.patch(row._id, { claim: 'released' })
  }
}

/**
 * Retoma as reservas de uma operação cujo prazo já havia sido processado como expirado, mas
 * que recebeu um pagamento. Pessoas que já foram reservadas por outra operação nesse intervalo
 * permanecem liberadas e são devolvidas em `conflicts`.
 */
export async function reacquireClaims(
  ctx: MutationCtx,
  operationId: Id<'paymentOperations'>,
): Promise<{ conflicts: string[] }> {
  const rows = await ctx.db
    .query('operationPeople')
    .withIndex('by_operation', (q) => q.eq('operationId', operationId))
    .collect()

  const conflicts: string[] = []
  for (const row of rows) {
    if (row.claim === 'active') continue
    const other = await findActiveClaim(ctx, row.personId, row.usageDate)
    if (other) conflicts.push(row.name)
    else await ctx.db.patch(row._id, { claim: 'active' })
  }
  return { conflicts }
}

/**
 * Pessoas (entre as informadas) que já têm reserva ativa na data: operação pendente, paga ou com
 * recebimento em análise. Operação expirada sem recebimento já teve as reservas liberadas e não
 * aparece aqui. Chaveado por `personId`, portanto vale entre titulares diferentes.
 *
 * Em uma QUERY isto é só informativo. A garantia de exclusividade vem de chamar esta função
 * dentro da mesma mutation que insere as reservas (ver o comentário no topo do arquivo).
 */
export async function findConflicts<TPerson extends { readonly personId: string }>(
  ctx: Pick<QueryCtx, 'db'>,
  people: readonly TPerson[],
  usageDate: string,
): Promise<TPerson[]> {
  const conflicts: TPerson[] = []
  for (const person of people) {
    if (await findActiveClaim(ctx, person.personId, usageDate)) conflicts.push(person)
  }
  return conflicts
}
