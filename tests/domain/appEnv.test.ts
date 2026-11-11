import { describe, expect, it } from 'vitest'
import { allowsMockProviders, MOCK_ALLOWED_APP_ENVS } from '../../convex/providers/appEnv'

describe('allowsMockProviders', () => {
  it('permite development e demonstration', () => {
    expect(MOCK_ALLOWED_APP_ENVS).toEqual(['development', 'demonstration'])
    expect(allowsMockProviders({ APP_ENV: 'development' })).toBe(true)
    expect(allowsMockProviders({ APP_ENV: 'demonstration' })).toBe(true)
  })

  it('recusa produção, vazio e valores desconhecidos', () => {
    expect(allowsMockProviders({ APP_ENV: 'production' })).toBe(false)
    expect(allowsMockProviders({ APP_ENV: '' })).toBe(false)
    expect(allowsMockProviders({})).toBe(false)
    expect(allowsMockProviders({ APP_ENV: 'staging' })).toBe(false)
  })
})
