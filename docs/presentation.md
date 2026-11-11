# Apresentação institucional — 1ª entrega

**Abrir os slides:** [presentation/index.html](./presentation/index.html) (navegador; setas ← →).

Material complementar:

- [Roteiro de demonstração](./demo-script.md) (8–12 min)
- [Decisões pendentes do sindicato](./decisions-for-syndicate.md)
- [Prontidão para apresentação](./presentation-readiness.md)
- [Relatório de homologação](./homologation-report.md)

## Estrutura dos 12 slides

| #   | Título                        | Conteúdo                                                                  |
| --- | ----------------------------- | ------------------------------------------------------------------------- |
| 1   | Capa                          | Sistema de Pagamentos da Taxa Médica · Sede Campestre · Sindicomerciários |
| 2   | Objetivo                      | Digitalizar o pagamento da taxa (R$ 30/pessoa), sem conta                 |
| 3   | Escopo da 1ª entrega          | Seis etapas; **não** é o sistema completo de reservas                     |
| 4   | Jornada do associado          | Identificação → Pessoas → Data → Resumo → Pagamento → Comprovante         |
| 5   | Experiência                   | Público, mobile, simples; captura real da identificação                   |
| 6   | Pagamento e segurança         | Backend, 15 min, idempotência, tardio; **checkout mockado**               |
| 7   | Comprovante e notificações    | PDF real no fluxo; e-mail mock; WhatsApp preparado                        |
| 8   | Auditoria e qualidade         | 595 testes; lint/typecheck/build; sem P0; ≠ produção                      |
| 9   | O que já está entregue        | Implementado × demonstrável × mockado × preparado                         |
| 10  | O que precisamos do sindicato | Funcionamento, cadastro, comprovante, regras                              |
| 11  | Integrações e próximos passos | Stripe, e-mail, WhatsApp, cadastro, homologação                           |
| 12  | Encerramento                  | Decisões para avançar; pronto para demo, não para cobrança real           |

## Mensagem central

A primeira entrega cobre a **jornada completa do associado até o comprovante**, com controles
financeiros e de segurança. Cobrança e notificações reais dependem de decisões do sindicato e de
integrações externas ainda não ativas.
