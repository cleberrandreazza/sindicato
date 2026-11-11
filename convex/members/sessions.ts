import { v } from 'convex/values'
import { internal } from '../_generated/api'
import type { Doc, Id } from '../_generated/dataModel'
import { internalMutation, type MutationCtx, type QueryCtx } from '../_generated/server'
import { IDENTIFICATION_SESSION_TTL_MS, MAX_RAW_INPUT_LENGTH } from '../domain/limits'
import { generateAccessToken, hashAccessToken } from '../domain/privacy'
import { publicError } from '../domain/publicErrors'

/**
 * Prova de identificação (não é login). Emitida quando carteirinha + CPF conferem e exigida por
 * toda função pública que recebe `memberId`. Assim, conhecer um id nunca dá acesso a nada.
 */

export async function issueSession(
  ctx: MutationCtx,
  memberId: Id<'members'>,
  now: number,
): Promise<{ token: string; expiresAt: number }> {
  const token = generateAccessToken()
  const expiresAt = now + IDENTIFICATION_SESSION_TTL_MS
  const sessionId = await ctx.db.insert('identificationSessions', {
    memberId,
    tokenHash: await hashAccessToken(token),
    expiresAt,
  })
  await ctx.scheduler.runAfter(IDENTIFICATION_SESSION_TTL_MS, internal.members.sessions.purge, {
    sessionId,
  })
  return { token, expiresAt }
}

/**
 * Confere que `token` foi emitido para `memberId` e ainda vale. Qualquer falha (token
 * desconhecido, de outro titular, expirado, titular inexistente) produz o MESMO erro, para não
 * revelar qual parte estava incorreta. Devolve o titular.
 */
export async function requireSession(
  ctx: Pick<QueryCtx, 'db'>,
  memberId: Id<'members'>,
  token: string,
): Promise<Doc<'members'>> {
  if (token.length === 0 || token.length > MAX_RAW_INPUT_LENGTH * 2) {
    throw publicError('session_invalid')
  }
  const hashToken = await hashAccessToken(token)
  const session = await ctx.db
    .query('identificationSessions')
    .withIndex('by_token_hash', (q) => q.eq('tokenHash', hashToken))
    .unique()
  if (!session || session.memberId !== memberId || session.expiresAt <= Date.now()) {
    throw publicError('session_invalid')
  }
  const member = await ctx.db.get(memberId)
  if (!member) throw publicError('session_invalid')
  return member
}

/** Remove a prova depois que expira. */
export const purge = internalMutation({
  args: { sessionId: v.id('identificationSessions') },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId)
    if (session && session.expiresAt <= Date.now()) await ctx.db.delete(sessionId)
  },
})
