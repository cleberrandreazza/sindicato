import { v } from 'convex/values'
import { internal } from '../_generated/api'
import { internalMutation, type MutationCtx, type QueryCtx } from '../_generated/server'

/**
 * Limitador de janela fixa apoiado em `rateLimits`. Funções auxiliares (não registradas) para
 * serem usadas dentro de mutations/queries, mais a limpeza agendada.
 *
 * Atenção ao desenho: uma mutation que LANÇA erro desfaz tudo, inclusive o contador. Por isso o
 * contador só avança em caminhos que terminam com sucesso (ou em mutation própria chamada antes
 * de a action lançar o erro).
 */

export async function readRateLimit(
  ctx: Pick<QueryCtx, 'db'>,
  key: string,
  now: number,
): Promise<{ count: number; retryAfterMs: number }> {
  const row = await ctx.db
    .query('rateLimits')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique()
  if (!row || row.expiresAt <= now) return { count: 0, retryAfterMs: 0 }
  return { count: row.count, retryAfterMs: row.expiresAt - now }
}

/** Soma 1 ao contador da chave (abrindo uma nova janela se a anterior terminou). */
export async function recordRateLimitHit(
  ctx: MutationCtx,
  key: string,
  windowMs: number,
  now: number,
): Promise<number> {
  const row = await ctx.db
    .query('rateLimits')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique()

  if (row && row.expiresAt > now) {
    await ctx.db.patch(row._id, { count: row.count + 1 })
    return row.count + 1
  }

  const expiresAt = now + windowMs
  const rateLimitId = row
    ? (await ctx.db.patch(row._id, { count: 1, expiresAt }), row._id)
    : await ctx.db.insert('rateLimits', { key, count: 1, expiresAt })
  await ctx.scheduler.runAfter(windowMs, internal.security.rateLimit.purge, { rateLimitId })
  return 1
}

export async function clearRateLimit(ctx: MutationCtx, key: string): Promise<void> {
  const row = await ctx.db
    .query('rateLimits')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique()
  if (row) await ctx.db.delete(row._id)
}

/** Apaga o contador depois que a janela terminou (evita crescimento indefinido da tabela). */
export const purge = internalMutation({
  args: { rateLimitId: v.id('rateLimits') },
  handler: async (ctx, { rateLimitId }) => {
    const row = await ctx.db.get(rateLimitId)
    if (row && row.expiresAt <= Date.now()) await ctx.db.delete(rateLimitId)
  },
})
