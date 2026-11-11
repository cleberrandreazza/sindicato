import type { ProviderMember, ProviderPerson } from '../memberProvider'

/**
 * DADOS EXCLUSIVAMENTE DE DESENVOLVIMENTO.
 * Nomes, e-mails (`example.com`, domínio reservado) e telefones são fictícios.
 * Os CPFs foram gerados algoritmicamente para testes e não pertencem a pessoas reais
 * por intenção. Nunca habilitado em produção (ver `providers/registry.ts`).
 *
 * Identificadores estáveis: cada pessoa tem um `personId` fixo (`mock-person-NNNN`) que não
 * muda entre consultas e é independente do id do vínculo (`mock-link-...`). Clara aparece como
 * dependente de DOIS titulares com o MESMO `personId` e vínculos diferentes, para exercitar a
 * prevenção global de duplicidade.
 */
export interface MockMemberFixture {
  readonly cpf: string
  readonly member: ProviderMember
}

function person(number: number, name: string): ProviderPerson {
  return { personId: `mock-person-${String(number).padStart(4, '0')}`, name }
}

const ana = person(1, 'Ana Teste Almeida')
const bruno = person(2, 'Bruno Teste Almeida')
const clara = person(3, 'Clara Teste Almeida') // dependente de Ana E de Daniela
const carlos = person(4, 'Carlos Exemplo Souza')
const daniela = person(5, 'Daniela Modelo Lima')
const eduardo = person(6, 'Eduardo Modelo Lima')
const fernanda = person(7, 'Fernanda Modelo Lima')
const gabriel = person(8, 'Gabriel Modelo Lima')
const helena = person(9, 'Helena Modelo Lima')
const igor = person(10, 'Igor Inativo Ferreira')
const julia = person(11, 'Julia Inativo Ferreira')

export const MOCK_MEMBERS: readonly MockMemberFixture[] = [
  {
    // Ativo, 2 dependentes.
    cpf: '10000000108',
    member: {
      membershipNumber: '100001',
      holder: ana,
      status: 'active',
      phone: '+5511900000001',
      email: 'ana.teste@example.com',
      dependents: [
        { linkId: 'mock-link-100001-1', person: bruno, role: 'spouse', status: 'active' },
        { linkId: 'mock-link-100001-2', person: clara, role: 'child', status: 'active' },
      ],
    },
  },
  {
    // Ativo, sem dependentes.
    cpf: '10000000280',
    member: {
      membershipNumber: '100002',
      holder: carlos,
      status: 'active',
      phone: '+5511900000002',
      email: 'carlos.exemplo@example.com',
      dependents: [],
    },
  },
  {
    // Ativo, 5 dependentes (um deles inativo; Clara é compartilhada com 100001).
    cpf: '10000000361',
    member: {
      membershipNumber: '100003',
      holder: daniela,
      status: 'active',
      phone: '+5511900000003',
      email: 'daniela.modelo@example.com',
      dependents: [
        { linkId: 'mock-link-100003-1', person: eduardo, role: 'spouse', status: 'active' },
        { linkId: 'mock-link-100003-2', person: fernanda, role: 'child', status: 'active' },
        { linkId: 'mock-link-100003-3', person: gabriel, role: 'child', status: 'active' },
        { linkId: 'mock-link-100003-4', person: helena, role: 'parent', status: 'inactive' },
        { linkId: 'mock-link-100003-5', person: clara, role: 'child', status: 'active' },
      ],
    },
  },
  {
    // Inativo, 1 dependente.
    cpf: '90000000418',
    member: {
      membershipNumber: '900004',
      holder: igor,
      status: 'inactive',
      phone: '+5511900000004',
      email: 'igor.inativo@example.com',
      dependents: [
        { linkId: 'mock-link-900004-1', person: julia, role: 'child', status: 'active' },
      ],
    },
  },
]
