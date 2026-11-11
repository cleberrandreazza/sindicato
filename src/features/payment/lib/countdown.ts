/**
 * Contagem regressiva VISUAL a partir do `expiresAt` oficial do backend (instante UTC, ms).
 * O navegador NÃO decide a expiração: só mede a diferença até o instante informado. Trocar Pix
 * por cartão, remontar a tela ou consultar de novo NÃO altera `expiresAt`.
 */

export function remainingMs(expiresAt: number, nowMs: number): number {
  if (!Number.isFinite(expiresAt) || !Number.isFinite(nowMs)) return 0
  return Math.max(0, Math.floor(expiresAt - nowMs))
}

export function isDeadlinePassed(expiresAt: number, nowMs: number): boolean {
  return remainingMs(expiresAt, nowMs) === 0
}

/** `mm:ss` a partir de milissegundos restantes (nunca negativo). */
export function formatCountdown(remaining: number): string {
  const totalSeconds = Math.max(0, Math.floor(remaining / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
