import { useEffect, useState } from 'react'
import { formatCountdown, isDeadlinePassed, remainingMs } from '../lib/countdown'

/**
 * Contagem regressiva ligada ao `expiresAt` oficial. O valor de `expiresAt` é estável: trocar de
 * método ou remontar o componente com o mesmo instante NÃO reinicia o prazo.
 *
 * O estado interno é só o "agora" (tick). O restante é derivado de `expiresAt - agora`.
 */
export function useCountdown(expiresAt: number, nowMs: () => number = Date.now) {
  const [now, setNow] = useState(() => nowMs())

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(nowMs())
    }, 1000)
    return () => window.clearInterval(id)
  }, [expiresAt, nowMs])

  const remaining = remainingMs(expiresAt, now)
  return {
    remainingMs: remaining,
    label: formatCountdown(remaining),
    expired: isDeadlinePassed(expiresAt, now),
  }
}
