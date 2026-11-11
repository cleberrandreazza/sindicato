import { ProviderError } from './errors'
import type { MemberProvider } from './memberProvider'
import { MockMemberProvider } from './mock/mockMemberProvider'
import { MockNotificationProvider } from './mock/mockNotificationProvider'
import { MockPaymentProvider } from './mock/mockPaymentProvider'
import type { NotificationProvider } from './notificationProvider'
import type { PaymentProvider } from './paymentProvider'

export type ProviderEnv = Readonly<Record<string, string | undefined>>

export interface Providers {
  readonly members: MemberProvider
  readonly payments: PaymentProvider
  readonly notifications: NotificationProvider
}

type Factories<T> = Readonly<Record<string, (() => T) | undefined>>

/**
 * Para trocar uma implementação: criar a classe, registrá-la aqui e selecionar o nome na
 * variável de ambiente correspondente. As regras de negócio dependem só das interfaces.
 */
const MEMBER_FACTORIES: Factories<MemberProvider> = { mock: () => new MockMemberProvider() }
const PAYMENT_FACTORIES: Factories<PaymentProvider> = { mock: () => new MockPaymentProvider() }
const NOTIFICATION_FACTORIES: Factories<NotificationProvider> = {
  mock: () => new MockNotificationProvider(),
}

function resolveProvider<T>(
  label: string,
  envKey: string,
  factories: Factories<T>,
  env: ProviderEnv,
): T {
  const isDevelopment = env.APP_ENV === 'development'
  const selected = env[envKey] ?? (isDevelopment ? 'mock' : undefined)

  if (!selected) {
    throw new ProviderError('configuration', `Defina ${envKey} para o provider de ${label}.`)
  }
  if (selected === 'mock' && !isDevelopment) {
    throw new ProviderError(
      'configuration',
      `${envKey}=mock só é permitido com APP_ENV=development.`,
    )
  }

  const factory = factories[selected]
  if (!factory) {
    throw new ProviderError('configuration', `Provider de ${label} desconhecido: "${selected}".`)
  }
  return factory()
}

/**
 * Resolve os providers a partir do ambiente do deployment Convex.
 * Seguro por padrão: sem `APP_ENV=development`, mocks são recusados e a ausência de
 * configuração gera erro em vez de cair silenciosamente em dados simulados.
 */
export function getProviders(env: ProviderEnv = process.env): Providers {
  return {
    members: resolveProvider('associados', 'MEMBER_PROVIDER', MEMBER_FACTORIES, env),
    payments: resolveProvider('pagamentos', 'PAYMENT_PROVIDER', PAYMENT_FACTORIES, env),
    notifications: resolveProvider(
      'notificações',
      'NOTIFICATION_PROVIDER',
      NOTIFICATION_FACTORIES,
      env,
    ),
  }
}
