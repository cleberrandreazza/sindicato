/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as domain_confirmation from "../domain/confirmation.js";
import type * as domain_cpf from "../domain/cpf.js";
import type * as domain_messages from "../domain/messages.js";
import type * as domain_pricing from "../domain/pricing.js";
import type * as domain_privacy from "../domain/privacy.js";
import type * as domain_selection from "../domain/selection.js";
import type * as domain_statuses from "../domain/statuses.js";
import type * as domain_time from "../domain/time.js";
import type * as domain_usagePolicy from "../domain/usagePolicy.js";
import type * as members_sync from "../members/sync.js";
import type * as payments_claims from "../payments/claims.js";
import type * as payments_confirmations from "../payments/confirmations.js";
import type * as payments_events from "../payments/events.js";
import type * as payments_operations from "../payments/operations.js";
import type * as payments_providerEvents from "../payments/providerEvents.js";
import type * as payments_receipts from "../payments/receipts.js";
import type * as payments_reviews from "../payments/reviews.js";
import type * as providers_errors from "../providers/errors.js";
import type * as providers_memberProvider from "../providers/memberProvider.js";
import type * as providers_mock_mockMemberProvider from "../providers/mock/mockMemberProvider.js";
import type * as providers_mock_mockMembers from "../providers/mock/mockMembers.js";
import type * as providers_mock_mockNotificationProvider from "../providers/mock/mockNotificationProvider.js";
import type * as providers_mock_mockPaymentProvider from "../providers/mock/mockPaymentProvider.js";
import type * as providers_notificationProvider from "../providers/notificationProvider.js";
import type * as providers_paymentProvider from "../providers/paymentProvider.js";
import type * as providers_registry from "../providers/registry.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "domain/confirmation": typeof domain_confirmation;
  "domain/cpf": typeof domain_cpf;
  "domain/messages": typeof domain_messages;
  "domain/pricing": typeof domain_pricing;
  "domain/privacy": typeof domain_privacy;
  "domain/selection": typeof domain_selection;
  "domain/statuses": typeof domain_statuses;
  "domain/time": typeof domain_time;
  "domain/usagePolicy": typeof domain_usagePolicy;
  "members/sync": typeof members_sync;
  "payments/claims": typeof payments_claims;
  "payments/confirmations": typeof payments_confirmations;
  "payments/events": typeof payments_events;
  "payments/operations": typeof payments_operations;
  "payments/providerEvents": typeof payments_providerEvents;
  "payments/receipts": typeof payments_receipts;
  "payments/reviews": typeof payments_reviews;
  "providers/errors": typeof providers_errors;
  "providers/memberProvider": typeof providers_memberProvider;
  "providers/mock/mockMemberProvider": typeof providers_mock_mockMemberProvider;
  "providers/mock/mockMembers": typeof providers_mock_mockMembers;
  "providers/mock/mockNotificationProvider": typeof providers_mock_mockNotificationProvider;
  "providers/mock/mockPaymentProvider": typeof providers_mock_mockPaymentProvider;
  "providers/notificationProvider": typeof providers_notificationProvider;
  "providers/paymentProvider": typeof providers_paymentProvider;
  "providers/registry": typeof providers_registry;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
