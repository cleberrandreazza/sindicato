import { v } from 'convex/values'
import { internalMutation } from '../_generated/server'
import {
  LOOKUP_FAILURE_WINDOW_MS,
  LOOKUP_GLOBAL_WINDOW_MS,
  LOOKUP_MAX_FAILURES_PER_MEMBERSHIP,
  LOOKUP_MAX_PER_MINUTE,
} from '../domain/limits'
import { clearRateLimit, readRateLimit, recordRateLimitHit } from '../security/rateLimit'
import { issueSession } from './sessions'
import { syncMemberFromProvider } from './sync'
import { dependentRole, linkStatus, memberStatus } from '../domain/statuses'

/**
 * Etapas internas da consulta cadastral (`public/members:lookup`), que é uma action (precisa
 * falar com o `MemberProvider`) e por isso grava via estas mutations.
 */

const failureKey = (membershipNumber: string) => `lookup:fail:${membershipNumber}`
const GLOBAL_KEY = 'lookup:global'

/** Porta de entrada: aplica os limites e conta a consulta. */
export const enter = internalMutation({
  args: { membershipNumber: v.string() },
  handler: async (ctx, { membershipNumber }) => {
    const now = Date.now()

    const failures = await readRateLimit(ctx, failureKey(membershipNumber), now)
    if (failures.count >= LOOKUP_MAX_FAILURES_PER_MEMBERSHIP) {
      return { allowed: false as const, retryAfterMs: failures.retryAfterMs }
    }
    const global = await readRateLimit(ctx, GLOBAL_KEY, now)
    if (global.count >= LOOKUP_MAX_PER_MINUTE) {
      return { allowed: false as const, retryAfterMs: global.retryAfterMs }
    }

    await recordRateLimitHit(ctx, GLOBAL_KEY, LOOKUP_GLOBAL_WINDOW_MS, now)
    return { allowed: true as const }
  },
})

/** Registra uma identificação que não conferiu (carteirinha inexistente OU CPF divergente). */
export const recordFailure = internalMutation({
  args: { membershipNumber: v.string() },
  handler: async (ctx, { membershipNumber }) => {
    await recordRateLimitHit(
      ctx,
      failureKey(membershipNumber),
      LOOKUP_FAILURE_WINDOW_MS,
      Date.now(),
    )
  },
})

/**
 * Identificação confirmada: sincroniza titular, pessoas e vínculos, zera as falhas e, se o
 * cadastro estiver ativo, emite a prova de identificação. Titular inativo não recebe prova:
 * não há nada que ele possa fazer em seguida.
 */
export const complete = internalMutation({
  args: {
    membershipNumber: v.string(),
    cpfHash: v.string(),
    cpfMasked: v.string(),
    status: memberStatus,
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    holder: v.object({ personId: v.string(), name: v.string() }),
    dependents: v.array(
      v.object({
        linkId: v.string(),
        person: v.object({ personId: v.string(), name: v.string() }),
        role: dependentRole,
        status: linkStatus,
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const synced = await syncMemberFromProvider(ctx, args)
    await clearRateLimit(ctx, failureKey(args.membershipNumber))
    const session = args.status === 'active' ? await issueSession(ctx, synced.memberId, now) : null
    return { ...synced, session }
  },
})
