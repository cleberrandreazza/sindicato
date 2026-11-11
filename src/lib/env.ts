/**
 * Variáveis de ambiente do cliente, validadas em um único ponto.
 * `VITE_CONVEX_URL` é opcional nesta fase: sem ela a aplicação sobe normalmente,
 * apenas sem conexão com o backend.
 */
export const env = {
  convexUrl: import.meta.env.VITE_CONVEX_URL as string | undefined,
} as const
