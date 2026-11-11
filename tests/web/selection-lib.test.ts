import { ConvexError } from 'convex/values'
import { describe, expect, it } from 'vitest'
import type { Id } from '../../convex/_generated/dataModel'
import { POOL_MEDICAL_FEE_CENTS } from '../../convex/domain/pricing'
import type { HouseholdPerson } from '../../src/features/identification/lib/lookup-outcome'
import {
  ineligibleReason,
  relationshipLabel,
  toggleSelection,
} from '../../src/features/selection/lib/people'
import {
  interpretValidationError,
  interpretValidationResult,
} from '../../src/features/selection/lib/selection-outcome'
import {
  formatBRL,
  peopleLabel,
  summarizeSelection,
} from '../../src/features/selection/lib/summary'

const id = (value: string) => value as Id<'householdLinks'>

const people: HouseholdPerson[] = [
  { linkId: id('a'), name: 'Ana', kind: 'holder', selectable: true },
  { linkId: id('b'), name: 'Bruno', kind: 'dependent', selectable: true },
  { linkId: id('c'), name: 'Helena', kind: 'dependent', selectable: false },
  { linkId: id('d'), name: 'Clara', kind: 'dependent', selectable: true },
]

describe('valores informativos', () => {
  it('formata em reais no padrão brasileiro', () => {
    expect(formatBRL(3000)).toBe('R$ 30,00')
    expect(formatBRL(6000)).toBe('R$ 60,00')
    expect(formatBRL(0)).toBe('R$ 0,00')
    expect(formatBRL(150_000)).toBe('R$ 1.500,00')
    expect(formatBRL(3050)).toBe('R$ 30,50')
  })

  it('usa o valor unitário do backend (função de preço compartilhada)', () => {
    expect(summarizeSelection(1)).toEqual({
      quantity: 1,
      unitAmountCents: POOL_MEDICAL_FEE_CENTS,
      totalAmountCents: POOL_MEDICAL_FEE_CENTS,
    })
    expect(summarizeSelection(3).totalAmountCents).toBe(3 * POOL_MEDICAL_FEE_CENTS)
  })

  it('sem pessoas: total zero e sem erro', () => {
    expect(summarizeSelection(0)).toEqual({
      quantity: 0,
      unitAmountCents: POOL_MEDICAL_FEE_CENTS,
      totalAmountCents: 0,
    })
  })

  it('singular e plural', () => {
    expect(peopleLabel(1)).toBe('1 pessoa')
    expect(peopleLabel(2)).toBe('2 pessoas')
  })
})

describe('pessoas', () => {
  it('rótulos do vínculo e justificativa só para quem não é selecionável', () => {
    expect(relationshipLabel(people[0]!)).toBe('Titular')
    expect(relationshipLabel(people[1]!)).toBe('Dependente')
    expect(ineligibleReason(people[0]!)).toBeNull()
    expect(ineligibleReason(people[2]!)).toMatch(/inativo/i)
  })

  it('marca e desmarca, mantendo a ordem da lista e sem duplicar', () => {
    let selection: Id<'householdLinks'>[] = toggleSelection(people, [], id('d'))
    expect(selection).toEqual(['d'])
    selection = toggleSelection(people, selection, id('a'))
    expect(selection).toEqual(['a', 'd'])
    selection = toggleSelection(people, selection, id('d'))
    expect(selection).toEqual(['a'])
    selection = toggleSelection(people, selection, id('a'))
    expect(selection).toEqual([])
  })

  it('ignora quem o backend não liberou e ids desconhecidos', () => {
    expect(toggleSelection(people, [id('a')], id('c'))).toEqual(['a'])
    expect(toggleSelection(people, [id('a')], id('zzz'))).toEqual(['a'])
  })

  it('não altera o array recebido', () => {
    const current = [id('a')]
    toggleSelection(people, current, id('b'))
    expect(current).toEqual(['a'])
  })
})

describe('interpretação da validação', () => {
  it('resultado ok vira válido, com a quantidade confirmada pelo backend', () => {
    expect(interpretValidationResult({ ok: true, quantity: 2, people: [] })).toEqual({
      kind: 'valid',
      quantity: 2,
    })
  })

  it('recusa do backend mostra o texto do backend', () => {
    expect(
      interpretValidationResult({ ok: false, code: 'link_inactive', message: 'Pessoa inativa.' }),
    ).toEqual({ kind: 'rejected', message: 'Pessoa inativa.' })
  })

  it('titular não encontrado pede nova identificação', () => {
    expect(
      interpretValidationResult({ ok: false, code: 'member_not_found', message: 'x' }),
    ).toEqual({ kind: 'session_expired' })
  })

  it('session_invalid pede nova identificação', () => {
    expect(
      interpretValidationError(new ConvexError({ code: 'session_invalid', message: 'x' })),
    ).toEqual({ kind: 'session_expired' })
  })

  it.each([
    ['erro comum', new Error('Server Error: detalhes internos')],
    ['rede', new TypeError('Failed to fetch')],
    ['código desconhecido', new ConvexError({ code: 'algo_novo', message: 'x' })],
    ['dado sem código', new ConvexError('texto')],
    ['null', null],
  ])('%s vira indisponível, sem repassar detalhes', (_name, error) => {
    expect(interpretValidationError(error)).toEqual({ kind: 'unavailable' })
  })
})
