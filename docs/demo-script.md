# Roteiro de demonstração — Taxa médica das piscinas

**Duração sugerida:** 8 a 12 minutos  
**Público:** diretoria / stakeholders do Sindicomerciários  
**Ambiente:** desenvolvimento com providers **mockados**

> Comunicar no início: nenhum pagamento real, nenhum e-mail real e nenhum WhatsApp estão ativos.
> Os dados são fictícios.

## Preparação do ambiente (antes da reunião)

1. Node 22 e pnpm instalados (`nvm use` se aplicável).
2. Na raiz do repositório:
   ```bash
   pnpm install
   cp .env.example .env.local   # se ainda não existir
   pnpm dev:convex             # terminal 1 — grava VITE_CONVEX_URL
   pnpm dev                    # terminal 2 — http://localhost:5173
   ```
3. Confirmar no deployment Convex (desenvolvimento):
   - `APP_ENV=development`
   - `MEMBER_PROVIDER=mock`, `PAYMENT_PROVIDER=mock`, `NOTIFICATION_PROVIDER=mock`
   - `CPF_HASH_SECRET` e `OPERATION_TOKEN_SECRET` definidos (ver README)
4. Abrir o navegador em largura de celular (~390px) ou DevTools responsivo.
5. Ter à mão a apresentação: `docs/presentation/index.html`.

## Dados fictícios (mock)

| Carteirinha | CPF              | Associado           | Uso na demo       |
| ----------- | ---------------- | ------------------- | ----------------- |
| `100001`    | `100.000.001-08` | Ana Teste Almeida   | Fluxo principal   |
| `100003`    | `100.000.003-61` | Daniela Modelo Lima | Família maior     |
| `900004`    | `900.000.004-18` | Igor Inativo        | Opcional: inativo |

Não usar dados reais de associados.

## Sequência sugerida (~10 min)

| Min   | Ação                                          | O que dizer                                                  |
| ----- | --------------------------------------------- | ------------------------------------------------------------ |
| 0:00  | Capa da apresentação                          | Problema: digitalizar a taxa médica das piscinas, sem conta. |
| 0:45  | Escopo                                        | Seis etapas; **não** é o sistema completo de reservas.       |
| 1:30  | Abrir `/`                                     | Identificação pública; carteirinha + CPF.                    |
| 2:15  | Informar `100001` / CPF da Ana                | Associado ativo; sem pré-selecionar pessoas.                 |
| 3:00  | `/pessoas`                                    | Titular e dependentes; convidados não entram.                |
| 3:45  | `/data`                                       | Data a partir de hoje (regra provisória).                    |
| 4:30  | `/resumo`                                     | Valor R$ 30 × pessoas; confirmar cria a operação (15 min).   |
| 5:30  | `/pagamento`                                  | **Checkout simulado.** Pix: QR/código demonstrativos.        |
| 6:30  | Cartão `tok_mock_approved` **ou** simular Pix | Ver abaixo.                                                  |
| 7:30  | `/comprovante`                                | PDF e número; e-mail mock; WhatsApp não configurado.         |
| 9:00  | Cenário tardio (resumo verbal ou 2ª demo)     | `paid_late` + análise; sem comprovante definitivo.           |
| 10:00 | Encerrar                                      | O que falta do sindicato e das integrações.                  |

## Cenário A — pagamento aprovado (recomendado na demo)

1. Concluir até o pagamento com Ana (`100001`), selecionando titular + 1 dependente.
2. Em **cartão (simulado)**, escolher “Simular cartão aprovado”.
3. Mostrar tela “Pagamento confirmado!” e número do comprovante.
4. Clicar em **Baixar comprovante PDF** (URL temporária autorizada).
5. Explicar: e-mail registrado pelo mock; WhatsApp `not_configured`.

**Alternativa Pix:** gerar Pix simulado; em outro terminal (só desenvolvimento):

```bash
npx convex run dev/simulate:simulatePayment '{"operationId":"<id>","outcome":"approved"}'
```

Atualizar o status na tela até o comprovante. Deixar claro que isso **não** existe para o
associado em produção.

## Cenário B — pagamento tardio (2–3 min)

1. Criar operação normalmente.
2. Simular recebimento após o prazo:
   ```bash
   npx convex run dev/simulate:simulatePayment '{"operationId":"<id>","outcome":"approved_after_expiry"}'
   ```
3. Mostrar “Pagamento recebido. Aguardando análise.”
4. Destacar: sem liberação automática, sem comprovante definitivo, sem reembolso automático.

## Pontos a explicar durante a demo

- Valor e prazo oficiais vêm do **backend**.
- Mesma pessoa não paga duas vezes na mesma data (duplicidade).
- Sessão e token da operação **não** ficam em `localStorage`.
- Auditoria: 595 testes; sem falha crítica (P0) de segurança na revisão — **ainda assim** não é
  go-live.
- Mocks ≠ produção.

## Limitações a comunicar

| Tema        | Mensagem                                                                |
| ----------- | ----------------------------------------------------------------------- |
| Pix/cartão  | Simulados; QR/código não são pagáveis                                   |
| E-mail      | Arquitetura pronta; envio atual é mock                                  |
| WhatsApp    | Preparado; nenhum envio                                                 |
| Cadastro    | Base fictícia do mock                                                   |
| Datas       | Qualquer dia a partir de hoje (regras de funcionamento ainda pendentes) |
| Comprovante | Sem CNPJ/endereço oficiais até o sindicato fornecer                     |
| Produção    | Não habilitada                                                          |

## Encerramento da demo

Encaminhar a diretoria para:

- [presentation-readiness.md](./presentation-readiness.md)
- [decisions-for-syndicate.md](./decisions-for-syndicate.md)
- Apresentação: [presentation/index.html](./presentation/index.html)
