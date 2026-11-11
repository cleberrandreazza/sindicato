# Relatório de homologação — 1ª entrega (jornada da taxa médica)

**Data da auditoria:** 2026-11-11  
**Commit base auditado:** `fc84c9baa33d6addb61474f971bccc47dcb9d9d9`  
**Commit deste relatório / correções de homologação:** `test: audit and homologate pool payment journey`  
**Suíte na auditoria:** 34 arquivos / 595 testes aprovados  

**Branch:** `master`  
**Ambiente:** desenvolvimento local (Windows), Vitest + `convex-test`, Node 22, pnpm

## 1. Objetivo da auditoria

Validar a primeira entrega das seis etapas da jornada pública de pagamento da taxa médica das
piscinas da Sede Campestre, sob os eixos: continuidade do fluxo, estados financeiros,
segurança, integrações mockadas, cobertura automatizada e prontidão para apresentação —
**sem** habilitar Stripe real, e-mail real ou WhatsApp real.

## 2. Escopo revisado

| Área            | Incluído                                                                               |
| --------------- | -------------------------------------------------------------------------------------- |
| Jornada 1→6     | Identificação → seleção → data → resumo/operação → pagamento → comprovante/notificação |
| Backend Convex  | Superfície pública, confirmação, comprovante, outbox                                   |
| Segurança       | Isolamento, tokens, idempotência, simulação, PII                                       |
| Estados         | Cobrança × financeiro × operacional                                                    |
| Documentação    | README, business-rules, architecture, data-model, integrations                         |
| Visual / mobile | Inventário de capturas existentes + limites desta auditoria                            |

**Fora de escopo:** novas funcionalidades de produto; integração Stripe; envio real de e-mail/WhatsApp;
testes destrutivos em produção; dados reais de associados.

## 3. Ambiente utilizado

| Item                        | Valor                                                                 |
| --------------------------- | --------------------------------------------------------------------- |
| Código                      | `origin/master` sincronizado no início da auditoria                   |
| Testes                      | `pnpm test` (Vitest: `edge-runtime` para Convex, `jsdom` para UI)     |
| Backend de teste            | `convex-test` + schema local (sem deployment de produção)             |
| Providers                   | `APP_ENV=development` + mocks (`MEMBER` / `PAYMENT` / `NOTIFICATION`) |
| Navegador real nesta sessão | Não executado ponta a ponta com Convex local (ver §8)                 |
| Dados                       | Exclusivamente fictícios (mock de associados / operações de teste)    |

## 4. Cenários testados (PROMPT 13, itens 1–53)

Cobertura após a rodada de homologação (automatizada):

| Faixa              | Resultado resumido                                                                  |
| ------------------ | ----------------------------------------------------------------------------------- |
| 1–7 Identificação  | Cobertos (6 parcial: queda do `MemberProvider` só via falha de rede/config na UI)   |
| 8–14 Seleção       | Cobertos (14 parcial: sync/desatualização no backend)                               |
| 15–20 Data         | Cobertos                                                                            |
| 21–29 Operação     | Cobertos (inclui F5 / `requestId` / 15 min)                                         |
| 30–40 Pagamento    | Cobertos; 34–35 reforçados nesta rodada (cancelada/expirada sem confirmação)        |
| 41–47 Comprovante  | Cobertos; 45 download repetido e 47 proteção “sem PDF se não confirmado” reforçados |
| 48–53 Notificações | Cobertos; 50 reforçado (falha no 1º envio sem e-mail cadastrado)                    |

**Não substituto desta lista:** não há suite E2E Playwright/Cypress da jornada completa no navegador.

Detalhe de arquivos: `tests/convex/*`, `tests/web/*`, `tests/domain/*`, com lacunas fechadas em
`tests/convex/homologationGaps.test.ts` e extensão de `tests/web/journey-routing.test.tsx`.

## 5. Resultados

| Checagem                          | Resultado na auditoria                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| Suíte automatizada                | Aprovada (ver entrega final do commit de homologação)                                  |
| lint / typecheck / format / build | Executados no fechamento                                                               |
| Superfície pública                | 8 funções em `convex/public/`; confirmação e simulação só internas                     |
| Isolamento entre associados       | Mantido (`operation_not_found` uniforme; download com `accessToken`)                   |
| Pagamento pelo navegador          | Não confirma; Pix pendente até evento autorizado; mock bloqueado fora de `development` |
| Comprovante tardio                | Sem PDF definitivo em `under_review` / `paid_late` pré-análise                         |

## 6. Problemas encontrados

### P0 — Crítico

Nenhum defeito confirmado de segurança, confirmação financeira indevida ou duplicidade financeira
no código revisado.

### P1 — Alto (risco residual / operacional — não bug de lógica atual)

| ID   | Descrição                                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------ |
| P1-1 | `APP_ENV=development` + providers mock em ambiente “produtivo” permitiria simulação. Controle: disciplina de deployment. |
| P1-2 | Webhook HTTP assinado ainda não existe; Pix real em produção não pode fechar o ciclo até Stripe + rota assinada.         |
| P1-3 | URL temporária do PDF, após autorização, é capability-style (quem obtiver o link pode baixar até expirar).               |

### P2 — Médio

| ID        | Descrição                                                                                                       |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| P2-doc    | README listava a etapa 6 como implementada **e** não implementada (linha duplicada).                            |
| P2-1      | Token da operação é bearer completo daquela operação (XSS/memória). Mitigado: só em RAM.                        |
| P2-2      | Sem rate limit nas queries/actions com `accessToken` (enumeração impraticável com token 256-bit).               |
| P2-3      | Lookup sem limite por IP (documentado; CAPTCHA/proxy futuros).                                                  |
| P2-E2E    | Sem jornada E2E de navegador automatizada.                                                                      |
| P2-visual | Capturas em `docs/screenshots/` cobrem sobretudo etapas 1–2; etapas 3–6 carecem de set atualizado nesta sessão. |

### P3 — Baixo

Oracle leve de CPF inválido vs. identificação falha; `requestId` opcional na API pública (UI sempre envia);
pepper no hash do token; texto de Pix citando CLI de simulação (não invocável pelo browser).

## 7. Problemas corrigidos nesta rodada

1. **README:** removida linha contraditória da etapa 6; links para este relatório e para
   `presentation-readiness.md`.
2. **Testes de homologação:** cobrança `canceled`/`expired` sem confirmação; download repetido;
   download bloqueado sem confirmação; e-mail falho na 1ª tentativa sem alterar `paid`/`confirmed`.
3. **Roteamento:** guards de `/resumo`, `/pagamento` e `/comprovante` cobertos em
   `journey-routing.test.tsx`.

Nenhuma alteração de contrato público além da documentação/testes (funções públicas inalteradas em
comportamento de negócio).

## 8. Problemas pendentes

- Integrações reais (Stripe, e-mail, WhatsApp, cadastro oficial).
- Webhook HTTP com validação de assinatura.
- Suite E2E de navegador e capturas atualizadas das etapas 3–6 em todas as larguras.
- Decisões de negócio do sindicato (horários, isenções, layout oficial do PDF, etc.).
- Hardening opcional: rate limit em endpoints com token; CAPTCHA no lookup.

## 9. Riscos conhecidos

| Risco                      | Mitigação atual                                                       |
| -------------------------- | --------------------------------------------------------------------- |
| Misconfig de `APP_ENV`     | Registry recusa mock fora de development; checklist de deploy         |
| Perda da jornada no F5     | Intencional (sem storage); `requestId` + sessão para recriação segura |
| Link PDF vazado            | URL temporária; download exige token antes de emitir URL              |
| Confiança no mock em demos | Mensagens explícitas de simulação na UI                               |

## 10. Pendências do sindicato

Ver [presentation-readiness.md](./presentation-readiness.md) seção “Dependente do sindicato”
(regras de funcionamento, cadastro oficial, dados do comprovante, e-mail/WhatsApp, políticas de
atraso/cancelamento).

## 11. Pendências de integração

| Integração       | Estado                                                |
| ---------------- | ----------------------------------------------------- |
| Cadastro oficial | Contrato `MemberProvider`; só mock                    |
| Stripe           | Contrato `PaymentProvider`; só mock; sem HTTP webhook |
| E-mail           | Outbox + mock; sem provedor real configurado          |
| WhatsApp         | Contrato + `not_configured`; sem envio                |

## 12. Recomendação de prontidão

**Pronto para homologação interna e demonstração com dados fictícios e mocks.**

**Não pronto para produção** enquanto dependerem de:

1. Provedores reais (pagamento, e-mail, cadastro).
2. Webhook assinado.
3. Decisões oficiais do sindicato listadas em `presentation-readiness.md`.
4. Validação visual atualizada das etapas 3–6 em dispositivos reais (recomendado antes de go-live).

Não afirmar que pagamentos reais ou notificações reais estão funcionando: **não estão**.
