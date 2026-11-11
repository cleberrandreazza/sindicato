export class TimeoutError extends Error {
  constructor() {
    super('Tempo esgotado.')
    this.name = 'TimeoutError'
  }
}

/**
 * Rejeita com `TimeoutError` se `promise` não terminar em `ms`. O cliente Convex mantém as
 * chamadas na fila enquanto está sem conexão (e não falha); sem limite, a tela ficaria
 * "Consultando…" indefinidamente. A resposta tardia, se vier, é ignorada.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError()), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error('Falha desconhecida.'))
      },
    )
  })
}
