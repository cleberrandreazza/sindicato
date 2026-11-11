# Respostas finais do assistente em cada etapa do projeto (Pagamento das piscinas — Sindicomerciários)

> Compilação, em ordem cronológica, dos relatórios finais entregues ao fim de cada etapa (Prompts 01 a 06 e a verificação final), gerada em 11/11/2026. Cada seção mostra o título do pedido e, abaixo, a resposta dada. Os textos estão como foram entregues; quando uma etapa posterior alterou algo, a etapa mais recente prevalece. Para o estado consolidado e os contratos atuais, consulte também `CONTEXTO_PARA_GPT.md`.

---

## Etapa 1: PROMPT 01 — Inicialização do Projeto Sede Campestre

A estrutura inicial está pronta. `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm format:check` e `pnpm build` passaram sem erros. O servidor de desenvolvimento sobe e responde 200 em `http://localhost:5173/`. Não executei `convex dev`, porque ele exige login no Convex. O app já está pronto para o `VITE_CONVEX_URL` quando você configurar.

## Estrutura criada

```text
.env.example  .gitignore  .prettierrc.json  .prettierignore
components.json  eslint.config.js  index.html  package.json
tsconfig.json  tsconfig.app.json  tsconfig.node.json  vite.config.ts  README.md
convex/
  schema.ts            # defineSchema({}) vazio
  tsconfig.json
  members/  payments/  notifications/
src/
  main.tsx  index.css  vite-env.d.ts  routeTree.gen.ts (gerado)
  app/router/          router.ts, app-router.tsx
  app/providers/       app-providers.tsx, convex-provider.tsx
  components/ui/       button.tsx (shadcn)
  components/shared/
  features/            member-identification, dependents, pool-payment,
                       payment-status, receipts, admin
  lib/                 utils.ts (cn), env.ts
  services/  types/
  routes/              __root.tsx, index.tsx
```

Os diretórios vazios (`features/*`, `services`, `types`, `shared`, `convex/members`, `convex/payments`, `convex/notifications`) existem no disco. Como você pediu para não criar arquivos só para preencher pastas, não coloquei `.gitkeep`. O Git não versiona pastas vazias, então elas só aparecem num clone depois que receberem arquivos. O diretório ainda não é um repositório git.

## Configuração

- **TypeScript:** `strict` e `noUncheckedIndexedAccess` ligados. O ESLint bloqueia `any` e exige `import type` onde couber.
- **Alias:** `@` aponta para `src`, configurado no `tsconfig` e no `vite.config.ts`.
- **Convex:** `AppConvexProvider` só cria o cliente se `VITE_CONVEX_URL` existir. Sem a variável, o app sobe normalmente, sem backend.
- **shadcn/ui:** estilo `new-york`, Tailwind v4 e variáveis CSS. Instalei só o `button`, para provar que a configuração funciona.
- **Prettier:** inclui o plugin do Tailwind, que ordena as classes.

## Dependências instaladas

**Produção:**

- `react`, `react-dom`
- `@tanstack/react-router`
- `convex`
- `tailwindcss`, `@tailwindcss/vite`, `tw-animate-css`
- `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`
- `radix-ui` (adicionada pelo shadcn junto com o `button`)

**Desenvolvimento:**

- `vite`, `@vitejs/plugin-react`
- `typescript` 6.0, `@types/node` 20, `@types/react`, `@types/react-dom`
- `@tanstack/router-plugin`
- `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `eslint-config-prettier`, `globals`
- `prettier`, `prettier-plugin-tailwindcss`

Fixei o TypeScript em 6.0 em vez de 7.0, porque o `typescript-eslint` ainda não suporta a versão 7. Fixei o `@types/node` em 20 para casar com o Node instalado.

## Como iniciar

```bash
pnpm install
cp .env.example .env.local
pnpm dev            # http://localhost:5173
pnpm dev:convex     # opcional agora; pede login e preenche VITE_CONVEX_URL
```

Os demais scripts (`build`, `lint`, `typecheck`, `format`) estão no `README.md`.

## Observações

- **`src/routeTree.gen.ts`:** o plugin do TanStack Router gera esse arquivo e ele precisa ser versionado. Sem ele, o `typecheck` falha num clone novo.
- **Falha do `vite` no pnpm (Windows):** neste ambiente o pnpm usa o Git Bash como shell de scripts. Depois de um `pnpm install --frozen-lockfile`, o comando `vite` deixou de ser encontrado. Um `pnpm install --force` resolveu. Isso é um problema do ambiente, não do projeto, mas pode aparecer de novo se você rodar `install --frozen-lockfile` na sua máquina.

Não implementei regras de negócio, telas, Stripe, WhatsApp, integração com o cadastro do sindicato nem nada de reservas.

The build output folder is generated and gitignored, so it doesn't need attention. Next I'll write the final summary, flagging the pnpm.shim quirk, the pinned TypeScript version, the missing .gitkeep, and that this isn't a git repo.

---

## Etapa 2: PROMPT 02 — Arquitetura e Modelo de Dados

Esta etapa fica pronta para você revisar. Lint, typecheck, format e build passam. O schema também foi aceito por um backend Convex local, numa cópia temporária do projeto.

## O que foi validado

- **Schema:** o Convex local criou as 6 tabelas e os 9 índices. Todos os módulos de `convex/` também foram empacotados sem erro.
- **Contratos e mocks:** rodei um script descartável, já removido, com cerca de 50 verificações. Ele cobriu:
  - CPF e preço;
  - transições de estado;
  - HMAC e máscaras;
  - registry seguro por padrão;
  - os três mocks, incluindo webhook com assinatura inválida.

  Todas passaram. Não instalei test runner, então esses testes não ficam no repositório.

- **Node 22:** o CLI do Convex 1.49 exige Node ≥ 22 e esta máquina tem Node 20. Rodei a validação com Node 22 temporário via `pnpm dlx node@22`, sem mexer na sua instalação. Para usar `pnpm dev:convex` você vai precisar do Node 22. Atualizei `engines` e o README. Por isso o pnpm agora mostra um aviso de engine enquanto você estiver no Node 20.

## Estrutura nova

```text
convex/
  schema.ts
  domain/      statuses.ts  cpf.ts  pricing.ts  privacy.ts
  providers/   errors.ts  memberProvider.ts  paymentProvider.ts  notificationProvider.ts
               registry.ts
               mock/  mockMembers.ts  mockMemberProvider.ts
                      mockPaymentProvider.ts  mockNotificationProvider.ts
  members/ payments/ notifications/      (ainda vazias, para as funções da próxima etapa)
docs/  architecture.md  data-model.md  integrations.md
```

O README agora traz as credenciais fictícias: 3 associados ativos (2, 0 e 4 dependentes, um deles inativo) e 1 associado inativo. Os CPFs foram gerados algoritmicamente, então não pertencem a pessoas reais por intenção. Também documentei como configurar `APP_ENV` e `CPF_HASH_SECRET` no deployment.

## Decisões arquiteturais

1. **Valores sempre no backend.** Dinheiro é inteiro em centavos, com sufixo `Cents`, e o navegador nunca envia valores.
2. **CPF como HMAC-SHA256 com segredo, mais uma versão mascarada.** O CPF completo nunca é gravado. Um hash simples seria quebrável por força bruta, porque o CPF tem poucas combinações.
3. **`members` é um cache do cadastro do sindicato.** A fonte da verdade é o `MemberProvider`, e a situação cadastral é reavaliada a cada identificação.
4. **`accessTokenHash` na operação.** Sem contas, o navegador precisa de uma credencial para acompanhar só a própria operação. Guardo apenas o hash do token.
5. **`selectedPeople` é um snapshot** com nome e vínculo no momento da operação.
6. **`createdAt` é o `_creationTime` nativo do Convex.** Só as tabelas mutáveis têm `updatedAt`.
7. **`recipientMasked` em `notifications`**, com uma linha por tentativa de envio. O destino real é lido do titular na hora de enviar.
8. **Expiração por função agendada.** Cada operação agenda a própria expiração, então não precisei de índice por `expiresAt`.
9. **Providers ficam em `convex/`, não em `src/services/`.** Só o backend fala com sistemas externos.
10. **Registry seguro por padrão.** Mocks só funcionam com `APP_ENV=development`. Sem configuração, o sistema falha em vez de usar dados simulados.
11. **Sem sessão de associado.** Cada operação sensível reautentica com carteirinha e CPF.

Ajustes em relação ao que você sugeriu:

- Adicionei três índices fora da sua lista, porque sem eles as consultas não funcionam:
  - `by_provider_transaction`, para localizar a transação de um webhook;
  - `receipts.by_operation`;
  - `receipts.by_receipt_number`, para gerar o próximo número e validar comprovantes.
- Adicionei `dependents.externalId`, para sincronizar dependentes de forma idempotente. O índice `by_member_and_external_id` também atende "dependentes por titular", pelo prefixo `memberId`.
- Os nomes de arquivo em `convex/` usam camelCase, porque o Convex não aceita hífen em nomes de módulo.

## Dúvidas e regras a confirmar

1. O titular entra na seleção e na cobrança como uma das pessoas? Ele é obrigatório?
2. Crianças ou idosos pagam o mesmo valor? Se houver isenção ou faixa de preço, precisamos de `birthDate` nos dependentes.
3. Quais datas de uso são permitidas: passadas, dias de funcionamento, antecedência máxima? E qual o fuso horário?
4. Pode haver duas operações pagas para a mesma pessoa na mesma data?
5. Além de ativo e inativo, existem outras situações cadastrais, como inadimplente? E dependente inativo deve ser bloqueado? Assumi que sim.
6. O que acontece com um pagamento confirmado depois dos 15 minutos? Hoje a transição `expired → paid` está proibida. Precisamos decidir entre reembolso e aceite.
7. Haverá reembolso ou cancelamento depois de pago?
8. Como o cadastro real será acessado: API, banco ou planilha? Dependentes têm CPF? Quais são os vínculos reais?
9. Qual provedor de e-mail e de WhatsApp? WhatsApp exige templates aprovados e opt-in. O comprovante é obrigatório nos dois canais?
10. O comprovante será em PDF? Qual o layout e a numeração (`SC-AAAA-NNNNNN` foi um palpite meu)?
11. Como proteger a identificação contra abuso: rate limit, CAPTCHA ou os dois?
12. Qual autenticação para o painel administrativo? A arquitetura já prevê um wrapper único para isso.
13. Qual o prazo de retenção dos dados, pela LGPD?
14. Quer que eu adicione o Vitest? Já existe lógica pura que merece testes automatizados.

Não implementei funções Convex, telas, Stripe, WhatsApp, painel administrativo nem fluxo de pagamento. A próxima etapa seria a action de identificação e a criação da operação. Prefiro esperar suas respostas, principalmente das perguntas 1 a 6, antes de avançar.

The Node 20 warning is only a local concern: Vite 8 already supports Node 20.19+ and 22.12+, so the frontend works on 20. Forcing engines to >=22 would just push warnings onto the user, who would need Node 22 for the Convex dev workflow regardless. I'll keep the setting but mention it. Next I'm putting together the structure listing and writing a concise summary with the decisions and open questions.

---

## Etapa 3: PROMPT 03 — Consolidação das Regras de Negócio e Ajustes Arquiteturais

Esta etapa está concluída. Lint, typecheck, build e os 93 testes passam, em 8 arquivos. Não implementei telas, Stripe, WhatsApp, cadastro oficial, reservas, reembolso automático nem políticas por idade.

## Mudanças no schema

| Mudança                                                                                                                                                             | Motivo                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `status` virou `financialStatus` (`unpaid`, `paid`, `paid_late`) mais `operationalStatus` (`awaiting_payment`, `confirmed`, `expired`, `under_review`, `rejected`). | Um campo só não separa "recebi o dinheiro" de "posso liberar o uso".                                                |
| Removi `selectedPeople` (array) e criei a tabela `operationPeople`.                                                                                                 | Arrays não são indexáveis. A tabela guarda uma linha por pessoa e sustenta a prevenção de duplicidade.              |
| Nova tabela `paymentReviews`, com índice `by_status`.                                                                                                               | Fila de análise administrativa. Motivos: `late_payment`, `amount_mismatch`, `unexpected_payment`, `claim_conflict`. |
| Nova tabela `operationEvents`.                                                                                                                                      | Histórico de alterações, só com inserções.                                                                          |
| `notifications.receiptId` ficou opcional e ganhou o campo `kind`.                                                                                                   | A atualização sobre análise não tem comprovante.                                                                    |
| Removi o estado `canceled`.                                                                                                                                         | Não existe fluxo de cancelamento definido.                                                                          |

**Financeiro e operacional:** o primeiro diz se o dinheiro chegou. O segundo diz se a utilização está liberada. No pagamento tardio os dois divergem de propósito: `paid_late` com `under_review` significa que o dinheiro existe, mas a utilização ainda não foi liberada.

## Prevenção de duplicidade

- Cada pessoa selecionada vira uma linha em `operationPeople` com `claim = active`. Ela fica `released` quando a operação expira sem recebimento ou quando a análise é rejeitada.
- Operações pendentes, pagas e tardias em análise mantêm a reserva ativa. Por isso bloqueiam nova cobrança. Operação expirada sem recebimento não bloqueia.
- A verificação e a inserção acontecem na mesma mutation (`payments/operations.create`). O navegador só envia quem e quando, e o validator rejeita campos como `totalAmountCents`.
- Mutations do Convex são serializáveis. A consulta lê o intervalo `(personKey, usageDate, 'active')` do índice. Se outra transação inserir uma reserva nesse intervalo antes de esta confirmar, o Convex reexecuta a mutation, que então vê a reserva e recusa com `duplicate_usage`.
- Verifiquei isso num backend Convex local real: 50 chamadas HTTP simultâneas para a mesma pessoa e data resultaram em 1 operação criada e 49 recusas. Esse teste foi manual e **não está na suíte**. O `convex-test` valida a lógica, mas não simula esse controle de concorrência.

## Pagamento tardio

- Quem decide se o pagamento foi no prazo é o `occurredAt` do provedor, não a hora em que o webhook chegou. Recebimento exatamente em `expiresAt` já conta como tardio. A decisão fica numa função pura, `decideConfirmation`.
- Pagamento tardio: a transação vira `succeeded`, a operação vai para `paid_late` / `under_review` e abre-se um `paymentReviews`. As reservas são retomadas para impedir nova cobrança. Não há comprovante, liberação nem reembolso.
- Pagamento no prazo cuja notificação chegou depois da expiração é confirmado normalmente.
- Notificação repetida ou simultânea é ignorada, porque `succeeded` é terminal. Não há segundo comprovante nem segunda análise. Um evento de falha que chegue depois do sucesso também é ignorado.
- Valor divergente e segundo pagamento na mesma operação vão para análise. Uma operação já em análise nunca é liquidada automaticamente.
- A decisão do administrador está em `payments/reviews.resolve`, uma função interna. Aprovar libera a utilização e emite o comprovante. Rejeitar libera as reservas, sem reembolso pelo sistema.
- A mensagem de referência está em `domain/messages.ts`. Acrescentei uma frase final dizendo que a utilização só é liberada após a validação da equipe, porque a sua mensagem não deixava isso explícito.

Os testes de e-mail e WhatsApp para essa atualização ainda não existem. Só o contrato (`sendPaymentUpdate*`), o schema e o mock foram preparados.

## Testes e documentação

Adicionei `vitest`, `convex-test` e `@edge-runtime/vm`. Cobrem os 10 itens que você listou. Sabotei a regra de duplicidade e a de atraso de propósito, e os testes quebraram (12 e 16 falhas); depois desfiz as edições.

`docs/business-rules.md` é novo e reúne regras confirmadas e pendentes, estados, pagamento tardio, duplicidade, mensagens e limitações do mock. Atualizei `architecture.md`, `data-model.md`, `integrations.md` e o `README.md`.

Gerei o `convex/_generated` rodando o Convex localmente e ele está versionado. Ele precisa ser regenerado quando mudarem os módulos de `convex/`.

## Regras ainda pendentes

- **Pendentes do sindicato:** dias e horários de funcionamento, antecedência mínima e máxima, isenções (crianças e idosos) e faixas etárias com preços diferentes. Hoje qualquer data não passada é aceita e todos pagam R$ 30,00. Entram trocando a implementação de `UsagePolicy`, sem mexer nas mutations.
- **Premissa minha a confirmar:** "hoje" é calculado no fuso `America/Sao_Paulo`.
- **Limitação:** a mesma pessoa cadastrada como dependente de dois titulares não é detectada como duplicada. Isso exige um identificador único de pessoa no cadastro oficial.
- **Textos a aprovar:** as mensagens `awaiting_payment`, `confirmed`, `expired`, `under_review` e `rejected` são rascunhos meus.
- **Pendências técnicas:** a numeração `SC-AAAA-NNNNNN` do comprovante é provisória, e ainda não há rate limit nem CAPTCHA na identificação.

Dois pontos que você pode estranhar: o requisito de Node 22 agora gera um aviso do pnpm no seu Node 20. E um webhook de cobrança desconhecida só devolve `unknown_transaction`, sem registrar o recebimento. Ele precisará gerar um alerta quando a integração real existir.

I'm checking that the generated API types still match the final code; the module list hasn't changed and the operations file ended up identical to before. Next I'm drafting the summary: schema changes, duplicate prevention, late payments, pending rules, new dependencies, and the caveats, including that the test setup doesn't simulate concurrency control and that the real-world test still needs doing by hand.

I'm listing the remaining assumptions for the summary: the timezone choice, the extra review reasons, dropping canceled and selectedPeople, and the open questions, while keeping it brief.

---

## Etapa 4: PROMPT 04 — Revisão Técnica e Estabilização do Backend

A estabilização do backend (Prompt 04) está concluída. Todas as verificações passam no Node 22, e nenhuma regra confirmada foi removida ou alterada. Os testes continuam passando depois do refactor, e quase todos os anteriores seguem sem mudança. Os que mudaram são os de seleção e de data, reescritos para o novo modelo, mais três ajustes pontuais descritos abaixo. Não há interfaces nem integrações reais.

## Resultados dos comandos

No Node 22.23 (alvo oficial), tudo passou:

| Comando                 | Resultado                                      |
| ----------------------- | ---------------------------------------------- |
| `prettier --check .`    | OK                                             |
| `eslint .`              | OK                                             |
| `tsc -b --noEmit`       | OK                                             |
| `vitest run`            | 11 arquivos, **143 testes passando** (eram 93) |
| `tsc -b` e `vite build` | OK                                             |

No Node 20 (o que está instalado nesta máquina), `pnpm lint`, `typecheck` e `build` passam. Com Node 20, o `pnpm` avisa sobre `engines`. O `vitest` quebra ao relatar falhas (`Map.groupBy`), então a suíte só é confiável no Node 22.

Além da suíte, rodei um backend Convex local. Ele aceitou o schema e os índices novos. A função de data com fuso (`Intl`) funciona no runtime real. Disparei criações simultâneas da mesma pessoa por dois titulares diferentes: 1 foi criada e 13 receberam `duplicate_usage`. Outras 6 chamadas falharam no cliente da CLI (`fetch failed`) e nunca chegaram à função. Esse teste foi manual e não faz parte da suíte.

## O que mudou

1. **`personId` estável.** Pessoa, vínculo e papel agora são separados em `people`, `householdLinks` (que inclui o titular com papel `holder`) e `role`. A duplicidade usa `personId` e vale entre titulares diferentes.
   - Os dados fictícios usam `mock-person-NNNN`. Clara é dependente de dois titulares (Ana e Daniela) com o mesmo `personId` e vínculos diferentes. Por isso Daniela passou a ter 5 dependentes no mock, e o README foi atualizado.
   - A sincronização com o cadastro fica em `members/sync.ts`.
2. **Datas e fuso.** A lógica de datas foi isolada em `domain/time.ts`.
   - Datas de utilização são calendário `YYYY-MM-DD`, sem hora nem fuso.
   - Prazos e recebimentos são instantes em UTC.
   - Há uma única conversão explícita para "hoje" em `America/Sao_Paulo`. Um instante inválido ou um fuso desconhecido lançam erro.
   - Testei os limites da meia-noite local (UTC-3), a virada de ano, o ano bissexto e a meia-noite UTC, que não vira o dia em São Paulo.
3. **Eventos do provedor.** A nova tabela `providerEvents` registra cada evento recebido, e `providerEvents.ingest` é a porta única de entrada.
   - O evento é identificado por origem e id, e os repetidos só incrementam `occurrences`.
   - Uma cobrança desconhecida gera alerta administrativo e não confirma nem libera nada.
   - Se o evento chegar antes de a transação existir, o reenvio dele é processado e o alerta é encerrado.
   - Isso substituiu `confirmations.apply`, que agora é só um helper interno.
4. **Node 22.** Criei o `.nvmrc` com `22` e o `engines` com `^22.13.0 || ^24.0.0 || >=26.0.0`. Removi a dependência `cn`, que tinha entrado por engano.
5. **Documentação.** Atualizei `data-model.md`, `architecture.md`, `business-rules.md`, `integrations.md` e o README. A seção "Testes que dependem de regras ainda não definidas" em `business-rules.md` lista as premissas dos testes.

Para conferir que os testes novos protegem de fato, quebrei o código de propósito duas vezes. A duplicidade por id de vínculo em vez de `personId` fez 7 testes falharem. A repetição de evento desconhecido fez 1 falhar. Depois restaurei o código.

## O que ajustei nos testes

- Os testes foram adaptados ao modelo novo, sem remover nenhum cenário. Só mudaram a forma de selecionar pessoas, `personId` no lugar de `personKey` e os helpers.
- Dois códigos de erro mudaram de nome: `dependent_not_found` e `dependent_inactive` viraram `link_not_found` e `link_inactive`. A regra é a mesma.
- Um teste novo de expiração usa o prazo exato da operação, porque o relógio simulado avança uns milissegundos a cada operação.

## Pendências e limitações

- **O cadastro oficial precisa fornecer um `personId` estável e único por pessoa.** Sem ele, a duplicidade entre titulares diferentes não é garantida. Não usei CPF de dependente nem nome com nascimento como substituto. Isso está documentado, e os testes que dependem dessa premissa estão listados.
- Os alertas de eventos desconhecidos (`resolveAlert` e `listOpenAlerts`) são funções internas, sem painel nem autenticação.
- O corpo bruto dos webhooks não é guardado.
- O fuso `America/Sao_Paulo` e a ausência de horário de corte para "hoje" continuam sendo premissas a confirmar com o sindicato.
- Alertar também falhas de cobranças desconhecidas é uma decisão técnica provisória.

---

## Etapa 5: VERIFICAÇÃO FINAL — ESTABILIDADE DA FUNDAÇÃO TÉCNICA

# Verificação final da fundação técnica

Não alterei código. Os comandos de verificação (`build`, `tsc -b`) regeneram apenas `dist/` e `*.tsbuildinfo`, que já estão no `.gitignore`.

## 1. Testes

Rodei no Node 22.23, que é o alvo oficial do projeto.

| Item                           | Resultado                                              |
| ------------------------------ | ------------------------------------------------------ |
| Executados                     | **143** (11 arquivos)                                  |
| Passaram                       | **143**                                                |
| Falharam                       | **0**                                                  |
| Ignorados, pendentes ou `todo` | **0**. Não há `.skip`, `.only` nem `.todo` nos testes. |

No Node 20, que é o que está instalado aqui, `pnpm test` também deu 143 de 143. O problema do Node 20 aparece só quando há falha: o Vitest 5 quebra ao relatar o erro (`Map.groupBy`).

## 2. Qualidade (`pnpm`, Node 20 padrão da máquina)

| Comando             | Resultado |
| ------------------- | --------- |
| `pnpm lint`         | OK        |
| `pnpm typecheck`    | OK        |
| `pnpm build`        | OK        |
| `pnpm format:check` | OK        |

`pnpm` mostra o aviso "Unsupported engine" no Node 20. No Node 22, `lint`, `typecheck`, testes e build passaram na verificação anterior, sem nenhuma alteração de código desde então.

## 3. Dependências e arquivos

- **Node:**
  - A máquina tem Node 20.19.6, que o projeto não suporta.
  - `.nvmrc` indica `22`, e `engines` pede `^22.13.0 || ^24.0.0 || >=26.0.0`.
  - Para rodar tudo, usei um binário temporário do Node 22.
- **`package.json`:** consistente, com `packageManager` pnpm 10.24.0 e as dependências `cn` e `cn`-like já removidas.
- **`pnpm-lock.yaml`:** em sincronia. `pnpm install --frozen-lockfile --lockfile-only` passou.
- **Compatibilidade:**
  - `pnpm audit --prod` não encontrou vulnerabilidades.
  - `pnpm outdated` lista só `@types/node` (22 → 26) e `typescript` (6.0 → 7.0).
  - O TypeScript está fixado em 6.x de propósito, porque o `typescript-eslint` ainda não suporta o 7.
- **`convex/_generated`:** eu havia editado o `api.d.ts` à mão para incluir os módulos novos. Agora regenerei com a CLI do Convex num diretório temporário (já removido) e comparei: os 5 arquivos são **idênticos** aos gerados.
- **Versionamento:** a pasta **não é um repositório git** (`fatal: not a git repository`). Portanto não há histórico, e todo o conteúdo está "pendente de versionamento". O `.gitignore` já cobre `node_modules`, `dist`, `.env*` (exceto `.env.example`), `*.tsbuildinfo` e `.tanstack`. `convex/_generated` deve ser commitado. A pasta vazia `convex/notifications/` não será versionada pelo git.

## 4. Regras de negócio: implementadas e cobertas

| Regra                                                 | Implementação                                             | Testes                                                                                                          |
| ----------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| R$ 30 por pessoa                                      | `pricing.ts`, `defaultUsagePolicy`                        | `pricing.test`, `usagePolicy.test` (preço único) e a quantidade/total nos testes de criação                     |
| Seleção individual (titular opcional, sem convidados) | `selection.ts`                                            | `selection.test` (11) e testes de criação em `duplicates.test`                                                  |
| Data de utilização obrigatória e não passada          | `usagePolicy.ts` + `time.ts` + validação dos argumentos   | `usagePolicy.test`, `time.test` (13, com meia-noite de São Paulo) e `duplicates.test` (data inválida e passada) |
| Prazo de 15 minutos                                   | `pricing.ts`, `operations.expire` e agendamento           | `pricing.test`, `lifecycle.test` (limites exatos e agendador)                                                   |
| Bloqueio de duplicados                                | `claims.ts` (índice por `personId`, data e reserva ativa) | `duplicates.test` (20), inclusive entre titulares diferentes e simultâneos                                      |
| Pagamentos tardios                                    | `confirmation.ts`, `confirmations.ts`, `reviews.ts`       | `confirmation.test`, `lifecycle.test` (23)                                                                      |
| Estado financeiro separado do operacional             | `statuses.ts` e dois campos em `paymentOperations`        | `statuses.test`, `lifecycle.test`                                                                               |

Dois pontos de precisão. A "data obrigatória" é garantida pelo validador de argumentos do Convex. Os testes cobrem string vazia e formato inválido, mas não há um teste que omita o argumento. Os testes do Convex usam `convex-test`, que **não simula** a concorrência otimista real. Essa garantia só foi verificada manualmente num backend local, duas vezes, fora da suíte.

## 5. Pendências

**Informações do sindicato**

- Dias e horários de funcionamento, antecedência mínima e máxima, isenções (crianças e idosos) e faixas etárias com preços diferentes.
- Se o cadastro oficial tem um identificador estável e único por pessoa.
- Confirmar o fuso `America/Sao_Paulo` e se há horário de corte para "hoje".
- Prefixo oficial do número do comprovante (hoje o `SC` é provisório) e o layout do PDF.
- Textos oficiais das mensagens, hoje rascunhos, exceto o da confirmação tardia.
- Política sobre outras situações cadastrais além de ativo e inativo.

**Integrações externas**

- Acesso real ao cadastro de associados (`MemberProvider`).
- Stripe: conta, chaves, webhook público e mapeamento do `eventId` e do `occurredAt`.
- E-mail e WhatsApp Business, com templates aprovados.
- Provedor de autenticação do painel administrativo.

**Técnicas**

- Não há funções públicas nem actions: identificação, criação, cobrança, webhook HTTP e notificações ainda não existem.
- Faltam rate limit e CAPTCHA na identificação.
- Geração do PDF do comprovante.
- Painel administrativo com autenticação (`reviews.resolve`, `resolveAlert` e `listOpenAlerts` são internas).
- Falta cobertura de testes em `cpf.ts`, `privacy.ts`, `registry.ts` e nos providers mock. Falta teste direto de `reviews.resolve` na rejeição de conflito de reserva.
- Falta um repositório git.
- A máquina precisa do Node 22 instalado.
- Variáveis do deployment Convex (`APP_ENV`, `CPF_HASH_SECRET`, etc.) ainda precisam ser configuradas.

**Decisões administrativas**

- Quem aprova ou rejeita pagamentos em análise, e com qual prazo.
- Como tratar manualmente o reembolso, já que o sistema não inicia nenhum.
- Quem recebe e trata os alertas de eventos desconhecidos.
- Retenção de dados e LGPD, incluindo se o corpo bruto dos webhooks será guardado.
- Se `taxa médica` continua sendo o nome oficial da cobrança.

## 6. Resultado

- **Estado geral:** estável. 143 de 143 testes passam, `lint`, `typecheck`, `build` e formatação passam, e o lockfile e os arquivos gerados estão consistentes.
- **Problemas encontrados:**
  - Node 20 na máquina, não suportado.
  - Pasta fora de qualquer repositório git.
  - Alguns módulos sem teste (`cpf.ts`, `privacy.ts`, `registry.ts`, providers mock).
- **Riscos que permanecem:**
  - O `personId` oficial pode não existir. Nesse caso a duplicidade entre titulares diferentes não é garantida.
  - A concorrência real só foi verificada manualmente.
  - O comportamento dos webhooks reais do Stripe (ordem, `eventId` e `occurredAt`) é desconhecido.
  - As regras de funcionamento e isenções ainda são desconhecidas.
- **Recomendação:** pode iniciar as interfaces, desde que:
  1. Instale o Node 22 e rode `git init` antes de começar.
  2. Antes das telas, o backend ganhe as actions públicas que elas vão chamar. Ainda não existem.
  3. As telas partam dos contratos e dos mocks atuais, tratando o `personId` oficial e as regras pendentes como premissas abertas.

  Não há bloqueio técnico na fundação. Os bloqueios restantes dependem do sindicato e das integrações.

I'm skipping tests for the cpf, privacy, registry, and mock provider files, since those carry low risk. There's a gitignored `.env.local`, the dev server is already running, and the remaining items are ignored or generated, so I'll note them in the report: it's not a git repo, there's no `.convex` directory, and my build refreshed `dist`.

I'm checking how to word the test coverage for the "data de utilização obrigatória" requirement. The usage policy test covers an empty string, and the duplicates test covers an invalid date, so that's handled. The backend validator enforces the argument, but there's no explicit test for a missing argument, so I'll say that in the report.

---

## Etapa 6: PROMPT 05 — Implementação da API Pública do Convex

A API pública do Convex está implementada e passa em todas as verificações. Não comecei nenhuma tela.

Rodei `pnpm lint`, `typecheck`, `format:check`, `test` e `build` no Node 22.23.4, e os arquivos `_generated` batem com o que a CLI do Convex gera. A suíte passou de 143 para 215 testes (14 arquivos), sem remover nem alterar nenhum teste anterior.

## Funções implementadas

Tudo o que o navegador pode chamar está em `convex/public/`. Um teste varre o código e falha se qualquer função pública aparecer fora dessa pasta ou se a lista mudar. A lista atual é:

| Função                             | Tipo     | Argumentos                                                | Retorno                                                                                                                          |
| ---------------------------------- | -------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `public/members:lookup`            | action   | `membershipNumber`, `cpf`                                 | titular, situação, dependentes (cada um com situação individual), `cpfMasked` e `session` (prova de identificação de 30 minutos) |
| `public/members:validateSelection` | query    | `memberId`, `identificationToken`, `linkIds`              | `{ok: true, quantity, people}` ou `{ok: false, code, message}`                                                                   |
| `public/payments:checkDuplicates`  | query    | `memberId`, `identificationToken`, `linkIds`, `usageDate` | `{ok: true, hasConflicts, conflicts}` ou `{ok: false, code, message}`                                                            |
| `public/payments:createOperation`  | mutation | os mesmos quatro argumentos                               | `operationId`, `accessToken`, valores em centavos, `expiresAt`, `people`                                                         |
| `public/payments:getOperation`     | query    | `operationId`, `accessToken`                              | status operacional e financeiro, mensagem, pessoas, número do comprovante                                                        |

Os contratos completos e os códigos de erro estão em `docs/architecture.md` e `docs/integrations.md`. Também atualizei `docs/data-model.md`, `docs/business-rules.md` e o README.

## Decisões de segurança

- **Prova de identificação em vez de `memberId` sozinho.** Sem login, um `memberId` isolado daria acesso a tudo. A consulta cadastral devolve uma prova de 30 minutos, guardada só como hash e emitida para aquele titular. As demais funções exigem `memberId` e prova juntos.
- **Cada operação tem seu próprio `accessToken`**, que só aparece na criação. Operação inexistente e credencial errada dão a mesma resposta, então não dá para consultar operação de terceiros.
- **Pessoas por `linkId`, nunca por `personId`.** O servidor só aceita vínculos do próprio titular.
- **O frontend não manda valores.** Campo extra (`totalAmountCents`, `financialStatus` etc.) é recusado pelo validador do Convex, e nenhuma função pública escreve estado de pagamento.
- **Erros genéricos.** Carteirinha inexistente e CPF divergente dão a mesma resposta.
- **Respostas enxutas.** O CPF só sai mascarado, e as respostas não trazem contato, `personId` nem hashes. Testes serializam as respostas e procuram esses valores.
- **Limites contra abuso:** 5 falhas por carteirinha em 15 minutos, 120 consultas por minuto no total e 10 operações por titular em 15 minutos.

## Consistência na duplicidade

A consulta seguida de inserção em chamadas separadas não garante exclusividade. Por isso a verificação e a inserção acontecem na mesma mutation (`createOperation`), e `checkDuplicates` é só informativa. O `convex-test` não simula a concorrência real do Convex, então testei contra um backend local pela API pública: 20 chamadas simultâneas de dois titulares diferentes para a mesma pessoa e data resultaram em **1 operação criada e 19 `duplicate_usage`**. Encerrei o backend e removi os arquivos temporários depois.

## Testes

- `publicMembers.test.ts`: 31 testes, cobrindo consulta válida, carteirinha inexistente, CPF divergente, associado e dependente inativos, pessoa não vinculada, seleção vazia e os limites de uso.
- `publicPayments.test.ts`: cobre criação válida e valor correto (R$ 30,00 por pessoa), data passada, duplicidade, operação expirada, tentativas de manipular valores e tentativas de acessar operação de terceiros.
- `publicSurface.test.ts`: o teste que guarda a lista de funções públicas.
- Conferi a força dos testes de segurança removendo temporariamente a prova de identificação e a checagem do `accessToken`. Três testes falharam como esperado, e restaurei os dois trechos.

## Problemas encontrados

- Os testes de acesso de terceiros só cobrem a lógica. A garantia de exclusividade sob concorrência real só aparece no teste manual contra o backend local.
- Atualizei a decisão arquitetural 11 ("reautenticar a cada operação") para a prova de curta duração, porque reenviar o CPF em toda chamada o expõe mais.
- Titular inativo agora recebe a situação cadastral e fica sem prova de identificação, em vez de um erro genérico, porque o requisito pede informar a situação. Isso muda o comportamento descrito antes.

## Limitações restantes

- **Sem IP no Convex.** Não há limite por origem, então um atacante pode bloquear uma carteirinha por 15 minutos ou esgotar o limite global por um minuto. A solução definitiva é CAPTCHA ou Turnstile na tela, ou um proxy que repasse a origem.
- **Temporização.** Não há proteção contra diferença de tempo de resposta entre "não existe" e "CPF diverge", o que importa com um provedor real.
- **Cobrança sem função pública.** Falta a função que cria a cobrança Pix ou cartão, então a operação já pode ser criada, mas ainda não pode ser paga pela API. Também não existe a rota HTTP do webhook.
- **Premissas pendentes.** O formato da carteirinha (1 a 20 letras ou números) é uma premissa a confirmar, e o `personId` oficial depende do cadastro do sindicato.
- **Mocks.** Devolvem sempre os mesmos dados e não simulam latência nem indisponibilidade.
- **Dados antigos.** Operações antigas não são removidas.
- **Projeto fora do git.** O diretório continua sem repositório.

## Próximo passo

Antes das telas, falta a função pública de cobrança Pix e cartão, que eu faria como a próxima etapa do backend. Se preferir começar pela interface já com o que existe, dá para construir identificação, seleção, data e criação da operação agora.

---

## Etapa 7: PROMPT 06 — Implementação da Criação de Cobranças Pix e Cartão

A criação de cobranças Pix e cartão está pronta, usando o `PaymentProvider` mockado e sem tocar em Stripe real. `pnpm lint`, `typecheck`, `format:check` e `build` passam. Os testes passaram de 215 para 314, todos aprovados, e nenhum teste anterior foi removido.

Também confirmei o comportamento num backend Convex local de verdade, porque o `convex-test` não reproduz concorrência real. Nada foi commitado: as alterações estão no working tree (o repositório tem só o commit inicial).

## Funções implementadas

| Função                                                       | Visibilidade     | Papel                                                                                         |
| ------------------------------------------------------------ | ---------------- | --------------------------------------------------------------------------------------------- |
| `public/payments:startPayment`                               | pública (action) | inicia o pagamento de uma operação existente                                                  |
| `public/payments:getOperation`                               | pública          | agora devolve também `payment`, para reexibir o Pix após recarregar a página                  |
| `payments/charges:begin`, `complete`, `fail`, `latestCharge` | internas         | criação idempotente da cobrança em três passos                                                |
| `payments/webhookProcessor:processNotification`              | interna          | assinatura e, em seguida, a porta única de eventos; é a base do futuro webhook, sem rota HTTP |
| `dev/simulate:simulatePayment`                               | interna          | simula o provedor: `approved`, `declined`, `pending`, `approved_after_expiry`                 |

Duas decisões que você pode querer revisar:

- **`startPayment` recebe também `accessToken`.** O prompt pedia só `operationId` e `paymentMethod`, mas um id sozinho deixaria qualquer pessoa cobrar a operação de outra. Usei a mesma credencial do `getOperation`.
- **Cartão recebe `paymentMethodToken`.** É só o token do SDK do provedor, que não é gravado nem logado. Dados reais de cartão nunca entram.

A cobrança só é aceita se a operação existir (com credencial correta), estiver pendente e dentro do prazo, tiver pessoas selecionadas e tiver um total válido (quantidade × unitário, inteiro e positivo). Qualquer inconsistência bloqueia a cobrança em vez de cobrar um valor duvidoso. O valor vem sempre da operação armazenada. Campos extras como `amountCents`, `status` ou `cardNumber` são recusados pelo validador do Convex.

## Contrato do PaymentProvider

- **`PixCharge`** devolve `providerTransactionId`, `status`, `amountCents`, `pixCopyPasteCode`, `qrCode` (`{kind, value}`) e `expiresAt`.
- **`CardCharge`** devolve `providerTransactionId`, `status`, `amountCents`, `clientSecret` e `failureReason`.
- O backend compara o `amountCents` da resposta com o pedido. Se divergir, não registra a cobrança.
- A `idempotencyKey` é estável por operação, forma de pagamento e tentativa. Uma retomada usa a mesma chave.
- O "copia e cola" do mock começa com `MOCK-PIX-NAO-PAGAVEL:`, não segue o formato de um Pix real e não embute id interno. O QR é um desenho "DEMONSTRAÇÃO" que não dá para escanear.
- Tokens de cartão fictícios do mock: `tok_mock_approved`, `tok_mock_declined`, `tok_mock_pending` e `tok_mock_unavailable`.

## Idempotência e concorrência

Antes de chamar o provedor, o backend grava uma tentativa em `chargeAttempts`. Isso exclui chamadas simultâneas: no máximo uma cobrança fica em aberto por operação.

- Repetir a chamada devolve a mesma cobrança (`reused: true`) sem chamar o provedor.
- Outra forma de pagamento com uma cobrança pendente dá `payment_method_conflict`. Isso impede dois pagamentos simultâneos.
- Se outra chamada está criando agora, o resultado é `payment_in_progress`.
- Cartão recusado permite nova tentativa dentro do prazo, até 3 por operação.
- Uma tentativa interrompida é retomada com a mesma chave de idempotência.

**Teste no backend real:** 20 chamadas simultâneas (10 Pix e 10 cartão pendente) para a mesma operação criaram uma única cobrança. Quatro chamadas tiveram sucesso, todas descrevendo essa cobrança, e as outras 16 foram recusadas.

## Estados e transições

São três estados separados:

- **Cobrança:** `pending`, `succeeded`, `failed`, `canceled` ou `expired`.
- **Financeiro:** `unpaid`, `paid` ou `paid_late`.
- **Operacional:** `awaiting_payment`, `confirmed`, `expired`, `under_review` ou `rejected`.

Só um recebimento (`succeeded`) validado por `decideConfirmation` move o estado financeiro. Recusa, cancelamento e expiração da cobrança só atualizam a transação.

O resultado imediato do provedor na criação (cartão aprovado ou recusado) entra pela mesma porta dos webhooks. Um cartão aprovado depois do prazo vira `paid_late` e `under_review`, sem liberação automática e sem reembolso. As tabelas de transições estão em `docs/business-rules.md`.

## Testes

- 99 testes novos: 72 em `tests/convex/payments.test.ts`, 25 em `tests/domain/charges.test.ts` e 2 em `publicSurface`.
- Os 14 casos pedidos estão cobertos, inclusive pagamento tardio, confirmação repetida e tentativa de confirmação não autorizada. Esta última cobre: rejeição de campos extras, `simulation_disabled` fora de desenvolvimento ou com provider diferente do mock, webhook com assinatura inválida ou ausente, e o teste de superfície que garante que nenhuma função pública confirma pagamento.
- No backend real verifiquei também que as funções internas (`ingest`, `simulatePayment`, `processNotification`, `complete`) não são alcançáveis por HTTP. A simulação aprovou e confirmou a operação com comprovante, detectou o evento repetido como duplicado e foi recusada com `APP_ENV=production`.

## Problemas encontrados

- **O teste de concorrência inicial era fraco.** Ao desligar a exclusão de propósito, ele continuou passando, porque o `convex-test` serializa as chamadas. Escrevi testes que suspendem a primeira chamada dentro do provedor. Eles falham quando a exclusão é removida, e restaurei o código depois.
- **O "copia e cola" do mock vazava a chave de idempotência.** Corrigi com um sufixo opaco.

## Limitações restantes

- **Sem Stripe real.** Faltam o adaptador, a verificação real da assinatura, o mapeamento de `occurredAt` para o instante em que o dinheiro foi recebido e a rota HTTP do webhook. A lista completa está em `docs/integrations.md`.
- **3-D Secure.** `startPayment` não repassa o `clientSecret` ao navegador.
- **Trocar de Pix para cartão** exige esperar o Pix pendente terminar, porque o contrato ainda não tem cancelamento de cobrança.
- **Cobranças órfãs.** Se a action cair depois de o provedor criar a cobrança e ninguém retomar, o webhook posterior vira alerta de cobrança desconhecida. Não há reconciliação automática nem limpeza de tentativas `creating` órfãs.
- **No desenvolvimento**, o navegador escolhe o resultado do cartão pelo token. Com um provedor real o provedor decide.
- **Continuam fora do escopo:** comprovante em PDF, e-mail, WhatsApp e telas.
- **Pendências anteriores:** o limite por IP/CAPTCHA, o formato da carteirinha e o `personId` oficial continuam como antes.

A documentação foi atualizada em `docs/architecture.md`, `integrations.md`, `business-rules.md` e `data-model.md`, e o README ganhou como usar a simulação.

I got nothing back from the grep, so I'm assuming the non-verbose summary only lists failing tests. Going by the earlier count, payments.test.ts has 72 tests, and the total moved from 215 to 314, so 99 are new. That leaves 25 for the domain charges file, since the surface file accounts for 2 more.

I'm checking the arithmetic against the earlier counts: 5 checkOperationPayable cases plus 9 parameterized ones make 14, planCharge brings in about 7, the idempotency key test adds 1, and the describe blocks add 3, which totals 25. Next I'm planning the final report, covering the added accessToken argument on startPayment, the card token argument, the verified concurrency, the weak convex-test concurrency that I patched with deterministic tests, the limitations, the mock-pix finding, and the test count moving from 215 to 314 with nothing removed. I also need to flag that I haven't committed anything to git.

---
