import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import type {
  OperationView,
  ReceiptDownloadResult,
  RequestReceiptEmailResult,
} from '../../../../convex/public/payments'
import { BackendNotConfiguredError, convexClient } from '@/lib/convex-client'
import { withTimeout } from '@/lib/with-timeout'

export type { OperationView, ReceiptDownloadResult, RequestReceiptEmailResult }

export type GetOperationFn = (input: {
  operationId: Id<'paymentOperations'>
  accessToken: string
}) => Promise<OperationView>

export type DownloadReceiptFn = (input: {
  operationId: Id<'paymentOperations'>
  accessToken: string
}) => Promise<ReceiptDownloadResult>

export type RequestEmailFn = (input: {
  operationId: Id<'paymentOperations'>
  accessToken: string
}) => Promise<RequestReceiptEmailResult>

const TIMEOUT_MS = 20_000

export const getOperation: GetOperationFn = (input) => {
  if (!convexClient) return Promise.reject(new BackendNotConfiguredError())
  return withTimeout(convexClient.query(api.public.payments.getOperation, input), TIMEOUT_MS)
}

export const getReceiptDownloadUrl: DownloadReceiptFn = (input) => {
  if (!convexClient) return Promise.reject(new BackendNotConfiguredError())
  return withTimeout(
    convexClient.action(api.public.payments.getReceiptDownloadUrl, input),
    TIMEOUT_MS,
  )
}

export const requestReceiptEmail: RequestEmailFn = (input) => {
  if (!convexClient) return Promise.reject(new BackendNotConfiguredError())
  return withTimeout(
    convexClient.action(api.public.payments.requestReceiptEmail, input),
    TIMEOUT_MS,
  )
}
