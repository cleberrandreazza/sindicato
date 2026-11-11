/**
 * O front importa APENAS TIPOS e `api` de `convex/_generated/api`, o que faz o TypeScript
 * verificar também o código das funções Convex, que lê variáveis de ambiente do deployment via
 * `process.env`. Este projeto (navegador) não tem os tipos do Node, então declaramos só o que
 * o backend usa. Esse código nunca executa no navegador; não use `process` em `src/`.
 */
declare const process: { readonly env: Readonly<Record<string, string | undefined>> }
