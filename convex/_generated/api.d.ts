/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as dev_mockSimulation from "../dev/mockSimulation.js";
import type * as dev_simulate from "../dev/simulate.js";
import type * as domain_chargeMessages from "../domain/chargeMessages.js";
import type * as domain_charges from "../domain/charges.js";
import type * as domain_confirmation from "../domain/confirmation.js";
import type * as domain_cpf from "../domain/cpf.js";
import type * as domain_idempotency from "../domain/idempotency.js";
import type * as domain_identification from "../domain/identification.js";
import type * as domain_limits from "../domain/limits.js";
import type * as domain_messages from "../domain/messages.js";
import type * as domain_pricing from "../domain/pricing.js";
import type * as domain_privacy from "../domain/privacy.js";
import type * as domain_publicErrors from "../domain/publicErrors.js";
import type * as domain_selection from "../domain/selection.js";
import type * as domain_statuses from "../domain/statuses.js";
import type * as domain_time from "../domain/time.js";
import type * as domain_usagePolicy from "../domain/usagePolicy.js";
import type * as members_family from "../members/family.js";
import type * as members_lookupGate from "../members/lookupGate.js";
import type * as members_sessions from "../members/sessions.js";
import type * as members_sync from "../members/sync.js";
import type * as notifications_outbox from "../notifications/outbox.js";
import type * as notifications_receiptAccess from "../notifications/receiptAccess.js";
import type * as payments_chargeView from "../payments/chargeView.js";
import type * as payments_charges from "../payments/charges.js";
import type * as payments_claims from "../payments/claims.js";
import type * as payments_confirmations from "../payments/confirmations.js";
import type * as payments_events from "../payments/events.js";
import type * as payments_operations from "../payments/operations.js";
import type * as payments_providerEvents from "../payments/providerEvents.js";
import type * as payments_receipts from "../payments/receipts.js";
import type * as payments_reviews from "../payments/reviews.js";
import type * as payments_webhookProcessor from "../payments/webhookProcessor.js";
import type * as providers_appEnv from "../providers/appEnv.js";
import type * as providers_errors from "../providers/errors.js";
import type * as providers_memberProvider from "../providers/memberProvider.js";
import type * as providers_mock_mockMemberProvider from "../providers/mock/mockMemberProvider.js";
import type * as providers_mock_mockMembers from "../providers/mock/mockMembers.js";
import type * as providers_mock_mockNotificationProvider from "../providers/mock/mockNotificationProvider.js";
import type * as providers_mock_mockPaymentProvider from "../providers/mock/mockPaymentProvider.js";
import type * as providers_notificationProvider from "../providers/notificationProvider.js";
import type * as providers_paymentProvider from "../providers/paymentProvider.js";
import type * as providers_registry from "../providers/registry.js";
import type * as public_members from "../public/members.js";
import type * as public_payments from "../public/payments.js";
import type * as receipts_format from "../receipts/format.js";
import type * as receipts_pdfDocument from "../receipts/pdfDocument.js";
import type * as security_rateLimit from "../security/rateLimit.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "dev/mockSimulation": typeof dev_mockSimulation;
  "dev/simulate": typeof dev_simulate;
  "domain/chargeMessages": typeof domain_chargeMessages;
  "domain/charges": typeof domain_charges;
  "domain/confirmation": typeof domain_confirmation;
  "domain/cpf": typeof domain_cpf;
  "domain/idempotency": typeof domain_idempotency;
  "domain/identification": typeof domain_identification;
  "domain/limits": typeof domain_limits;
  "domain/messages": typeof domain_messages;
  "domain/pricing": typeof domain_pricing;
  "domain/privacy": typeof domain_privacy;
  "domain/publicErrors": typeof domain_publicErrors;
  "domain/selection": typeof domain_selection;
  "domain/statuses": typeof domain_statuses;
  "domain/time": typeof domain_time;
  "domain/usagePolicy": typeof domain_usagePolicy;
  "members/family": typeof members_family;
  "members/lookupGate": typeof members_lookupGate;
  "members/sessions": typeof members_sessions;
  "members/sync": typeof members_sync;
  "notifications/outbox": typeof notifications_outbox;
  "notifications/receiptAccess": typeof notifications_receiptAccess;
  "payments/chargeView": typeof payments_chargeView;
  "payments/charges": typeof payments_charges;
  "payments/claims": typeof payments_claims;
  "payments/confirmations": typeof payments_confirmations;
  "payments/events": typeof payments_events;
  "payments/operations": typeof payments_operations;
  "payments/providerEvents": typeof payments_providerEvents;
  "payments/receipts": typeof payments_receipts;
  "payments/reviews": typeof payments_reviews;
  "payments/webhookProcessor": typeof payments_webhookProcessor;
  "providers/appEnv": typeof providers_appEnv;
  "providers/errors": typeof providers_errors;
  "providers/memberProvider": typeof providers_memberProvider;
  "providers/mock/mockMemberProvider": typeof providers_mock_mockMemberProvider;
  "providers/mock/mockMembers": typeof providers_mock_mockMembers;
  "providers/mock/mockNotificationProvider": typeof providers_mock_mockNotificationProvider;
  "providers/mock/mockPaymentProvider": typeof providers_mock_mockPaymentProvider;
  "providers/notificationProvider": typeof providers_notificationProvider;
  "providers/paymentProvider": typeof providers_paymentProvider;
  "providers/registry": typeof providers_registry;
  "public/members": typeof public_members;
  "public/payments": typeof public_payments;
  "receipts/format": typeof receipts_format;
  "receipts/pdfDocument": typeof receipts_pdfDocument;
  "security/rateLimit": typeof security_rateLimit;
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
