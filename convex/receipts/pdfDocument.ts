/**
 * Geração mínima de PDF (texto) sem bibliotecas externas.
 *
 * Compatível com o runtime padrão do Convex (V8): sem `"use node"`, sem `pdf-lib`/Puppeteer.
 * O arquivo é pequeno o bastante para `ctx.storage.store` em mutation/action.
 *
 * Não inventa CNPJ, endereço ou dados oficiais ausentes do projeto.
 */

export interface ReceiptPdfContent {
  readonly receiptNumber: string
  readonly operationRef: string
  readonly paidAtLabel: string
  readonly usageDateLabel: string
  readonly quantity: number
  readonly peopleLines: readonly string[]
  readonly unitAmountLabel: string
  readonly totalAmountLabel: string
  readonly paymentMethodLabel: string
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function line(y: number, text: string, size = 11): string {
  return `BT /F1 ${size} Tf 50 ${y} Td (${escapePdfText(text)}) Tj ET`
}

/**
 * Monta um PDF A4 simples com o conteúdo do comprovante.
 * Retorna bytes prontos para `Blob`/`storage.store`.
 */
export function buildReceiptPdf(content: ReceiptPdfContent): Uint8Array {
  const lines: string[] = []
  let y = 780
  const push = (text: string, size = 11, gap = 18) => {
    lines.push(line(y, text, size))
    y -= gap
  }

  push('Sindicomerciarios', 16, 22)
  push('Sede Campestre', 14, 20)
  push('Comprovante de pagamento', 13, 28)
  push(`Numero: ${content.receiptNumber}`, 12, 18)
  push(`Referencia da operacao: ${content.operationRef}`, 10, 16)
  push(`Confirmacao: ${content.paidAtLabel}`, 11, 16)
  push(`Data de utilizacao: ${content.usageDateLabel}`, 11, 16)
  push(`Quantidade de pessoas: ${content.quantity}`, 11, 16)
  push('Pessoas abrangidas:', 11, 16)
  for (const person of content.peopleLines) {
    push(`- ${person}`, 10, 14)
  }
  y -= 6
  push(`Valor unitario: ${content.unitAmountLabel}`, 11, 16)
  push(`Valor total pago: ${content.totalAmountLabel}`, 12, 18)
  push(`Metodo: ${content.paymentMethodLabel}`, 11, 16)
  push('Situacao: pagamento confirmado', 11, 20)
  push('Documento gerado automaticamente pelo sistema.', 9, 14)
  push('Este comprovante nao substitui documentos oficiais do sindicato.', 9, 14)

  const contentStream = lines.join('\n')
  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ]

  const encoder = new TextEncoder()
  const header = encoder.encode('%PDF-1.4\n')
  const objectBytes = objects.map((object) => encoder.encode(object))
  const offsetList: number[] = [0]
  let cursor = header.length
  for (const bytes of objectBytes) {
    offsetList.push(cursor)
    cursor += bytes.length
  }
  const xrefStart = cursor
  let xref = `xref\n0 ${objects.length + 1}\n`
  xref += '0000000000 65535 f \n'
  for (let i = 1; i < offsetList.length; i++) {
    xref += `${String(offsetList[i]).padStart(10, '0')} 00000 n \n`
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  const xrefBytes = encoder.encode(xref)

  const total =
    header.length + objectBytes.reduce((sum, part) => sum + part.length, 0) + xrefBytes.length
  const out = new Uint8Array(total)
  let at = 0
  out.set(header, at)
  at += header.length
  for (const part of objectBytes) {
    out.set(part, at)
    at += part.length
  }
  out.set(xrefBytes, at)
  return out
}
