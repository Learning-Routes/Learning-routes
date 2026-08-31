# Route Commerce and Owner Dashboard Design

**Date:** 2026-08-31
**Status:** Approved
**Currency:** USD

## Purpose

Learning Routes will sell each personalized learning route as a one-time purchase. A user may generate and use the first complete module for free. The remaining modules are visible but locked until the user buys the rest of that route in one Lemon Squeezy checkout payment.

The product owner needs a private dashboard that shows every registered user, their routes, purchase status, revenue, attributed AI cost, Lemon Squeezy fees, and profit. The dashboard is accessible only to one owner account.

## Confirmed Product Decisions

- A module is a first-class section of a route and contains multiple route steps.
- The first module of every route is a permanent free preview.
- All remaining modules are bought together in one payment.
- There are no recurring subscriptions or monthly plans in this scope.
- Payments and reporting use US dollars.
- The sale price covers the estimated AI cost of the entire route, including the free module, plus the estimated Lemon Squeezy platform/payment fee, with a 50% markup.
- The minimum sale price is USD 2.99 for each paid module.
- The customer sees one fixed quote before entering checkout. Later cost variance never changes that charge.
- Lemon Squeezy is the payment provider and Merchant of Record, but the application is the source of truth for quotes, purchases, access, and generation state.
- PayPal is offered as a payment method inside Lemon Squeezy's checkout, not as a second direct integration.
- The application talks to payments through a narrow `Commerce::PaymentProvider` interface so a Costa Rican provider such as Tilopay can be added later without changing purchase or entitlement rules.
- Only one `owner` account exists. There are no secondary administrators.

## Delivery Order

The work is deliberately split so payment never rests on unverified cost or access behavior.

1. **WP-15B — Attempt semantics:** fix the known regression where three incorrect drag-and-drop placements release a block. Make a completed answer, rather than a single interaction, count as an attempt. Do not merge or deploy WP-15 before this passes.
2. **WP-7 — True costs:** review and merge the existing cost-metering and business-dashboard branch. Resolve its known omissions that affect quoting, especially unmetered transcription and cost limits that still use rounded cents.
3. **WP-16 — Owner foundation and user dashboard:** introduce the single-owner invariant and expand the existing dashboard with user and route drill-down.
4. **WP-17 — Modules, quotes, preview, and locks:** make modules first-class, migrate existing routes, generate one free module, calculate an immutable quote, and lock paid modules.
5. **WP-18 — Lemon Squeezy one-time purchase:** create custom-price checkouts, verify idempotent `order_created`/`order_refunded` webhooks, record purchases, and enqueue generation after confirmed payment. PayPal is enabled through Lemon Squeezy checkout rather than a second API.
6. **WP-19 — Vertical journey:** replace the compressed radial journey with the approved vertical module layout and responsive list fallback.
7. **WP-4 and WP-8 gates:** close the full-suite failures, add real-browser and provider smoke coverage, and close payment-critical security debt before activating Lemon Squeezy live mode.

WP-16 through WP-19 each receive a separate implementation plan and Codex execution prompt. A later package must verify that its prerequisite commits are ancestors of its base before editing code.

## Provider Readiness Gate

Before WP-18 is treated as production-ready, the owner must:

- create a Lemon Squeezy store in test mode;
- describe Learning Routes accurately as a platform selling one-time access to personalized digital educational routes;
- submit the store for Lemon Squeezy identity, business, and product approval;
- configure a verified Costa Rican bank account or verified PayPal account for payouts;
- obtain the store, one-time product, and variant identifiers without placing secrets in the repository;
- confirm the fee schedule actually applied to the approved store.

Development may use Lemon Squeezy test mode while approval is pending, but the application must not advertise or enable live purchases until approval succeeds. PayPal availability is controlled by Lemon Squeezy and may vary by customer, device, or location; the application must not promise PayPal when the hosted checkout does not offer it.

## Domain Model

### Route modules

Add `LearningRoutesEngine::RouteModule` as a first-class record:

- belongs to a `LearningRoute`;
- has ordered `RouteStep` records;
- has a stable position and localized title/description;
- records whether it is the free preview;
- records generation/access state without conflating payment success with content readiness.

Suggested state vocabulary:

- access: `preview`, `locked`, `purchased`;
- generation: `outlined`, `generating`, `ready`, `failed`.

Existing routes currently use the fixed `RouteStep#level` values `nv1`, `nv2`, and `nv3` as an implicit grouping. A data migration must create modules from those groups, preserve step order and progress, and leave a reversible mapping. New code must not depend on there being exactly three modules.

### Quotes

`Commerce::RouteQuote` is an immutable pricing snapshot belonging to a user and route. It stores integer monetary values at sufficient precision, never binary floats:

- currency (`usd` only in this release);
- total and paid module counts;
- estimated AI cost for the full route;
- estimated Lemon Squeezy platform/payment fee;
- markup basis points (`5000` for 50%);
- minimum price per paid module (`299` cents);
- calculated cost-based price;
- calculated minimum price;
- final quoted price;
- estimator/version metadata;
- expiration and supersession state.

The estimator must use the planned route shape, explicit image quality, expected text/audio work, and current provider rates from WP-7. It must include the outline and free-preview generation. Estimation assumptions are versioned so an old quote remains explainable after rates change.

The Lemon Squeezy fee depends on the final charge, payment method, customer location, currency conversion, and the fee schedule applied to the approved store. The pricing service must gross up the known percentage/fixed components using an explicit, tested formula rather than recursively estimating them or silently losing the fixed fee. Every fee assumption must be configurable, versioned, and snapshotted on the quote. The dashboard must label a quoted fee as estimated until the order data establishes the actual provider fee.

The final price is the greater of:

1. the grossed-up cost-based price that covers estimated full-route AI cost and Lemon Squeezy fees with the approved 50% markup; and
2. USD 2.99 multiplied by the number of paid modules.

The UI may create a replacement quote before checkout, but it may not mutate a quote already attached to a Lemon Squeezy checkout or purchase.

### Purchases and provider events

`Commerce::RoutePurchase` belongs to one user, route, and quote. It stores:

- state: `pending`, `paid`, `failed`, or `refunded`;
- provider name plus Lemon Squeezy checkout, order, store, product, and variant identifiers;
- amount and currency copied from the quote;
- estimated cost/fee snapshots;
- actual Lemon Squeezy fee when available;
- paid/refunded timestamps.

A unique constraint prevents more than one successful purchase for a route. Retrying a failed or expired checkout creates or reuses a safe pending purchase without weakening that invariant.

`Commerce::ProviderEvent` stores provider, event identity, event name, test/live mode, and processing state. Lemon Squeezy webhook handling must verify the raw-body `X-Signature`, validate store, test mode, event type, currency, amount, quote, user, and route, then process inside an idempotent transaction. Replaying an event must not duplicate a purchase, job, entitlement, or notification. Persist enough normalized evidence to reconcile the order, but do not retain unnecessary personal data or an unrestricted raw payload.

`Commerce::PaymentProvider` exposes only the operations the domain needs: create a custom-price one-time checkout from an immutable quote and normalize/verify an incoming provider event. The first adapter is `Commerce::Providers::LemonSqueezy`; no direct PayPal adapter is built because Lemon Squeezy already offers PayPal in the same checkout and emits the same order lifecycle.

The purchase is the durable entitlement. A redirect from checkout is never proof of payment. Only a verified webhook may transition a purchase to `paid` and authorize paid-module generation.

### Actual cost attribution

Every paid provider call involved in outlining or generating a route must carry the route, module, user, quote/purchase context needed for attribution. The dashboard reports:

- quoted AI cost;
- actual billable AI cost;
- gross revenue;
- actual Lemon Squeezy fee when available, otherwise the quote estimate labeled as such;
- net profit and margin.

Cached calls remain non-billable. Unknown or unattributed costs are shown explicitly rather than silently treated as zero.

## User Flow

1. The user completes the existing route wizard.
2. The application generates a complete module/step outline and a fixed quote.
3. Only the first module's full content is generated.
4. The journey shows every module. The first is labeled as a free preview; the rest show their titles and descriptions in a locked state.
5. The user can permanently use the preview module without payment.
6. The purchase panel states the number of modules unlocked, fixed total price in USD, and that this is a one-time payment. It does not expose internal AI cost or markup.
7. The server creates a single-use Lemon Squeezy checkout through the API, using `custom_price` in cents from the immutable local quote, server-derived custom identifiers, and a one-time product variant.
8. On return, the page displays a confirmation/pending state while waiting for the webhook. A crafted success URL cannot unlock content.
9. A verified Lemon Squeezy `order_created` event marks the purchase paid and enqueues idempotent generation for paid modules. The same event path applies whether the customer used a card, PayPal, or another method Lemon Squeezy offered.
10. Purchased modules may show `generating` independently. Each becomes available when ready; a failure can retry without another charge.

## Owner Identity and Access

Replace the current general `admin` authority with one `owner` authority:

- exactly one owner is allowed at the database/application boundary;
- there is no UI for granting owner access;
- an existing account is promoted by a one-time credentials-first task using `OWNER_EMAIL` or an equivalent encrypted credential;
- no owner email or password is committed;
- no default login-capable owner is seeded;
- anonymous users and every non-owner receive a hard 403 for `/admin` resources;
- sensitive owner actions and access are audited;
- admin responses are private/no-store and never publicly cached or indexed.

Concurrency must be handled: two simultaneous promotion attempts cannot create two owners. The implementation plan must select a PostgreSQL-enforced mechanism or a transaction/advisory-lock design with a database-level invariant; a model validation alone is insufficient.

## Owner Dashboard

Extend the WP-7 dashboard rather than build a competing panel.

### Summary

- registered users;
- buyers and non-buyers;
- routes created, quoted, and purchased;
- gross revenue;
- actual AI cost;
- Lemon Squeezy fees;
- net profit and margin;
- failed payments and refunds;
- free-preview-to-purchase conversion.

### User index

A paginated, searchable, filterable table shows:

- name and email;
- registration and last activity;
- route count;
- purchased and unpurchased route counts;
- lifetime amount paid;
- actual attributed cost;
- profit;
- latest payment state.

Filters cover buyer/non-buyer and payment state. Aggregation must happen in bounded SQL queries; query count must not grow with row count.

### User detail

Show basic account state and every route with:

- its modules and preview module;
- locked, generating, ready, and failed states;
- quote and purchase status;
- quoted/paid amount;
- estimated and actual cost;
- Lemon Squeezy fee;
- profit;
- payment identifiers and relevant event history;
- educational progress.

Financial records are read-only in the first release. Refunds are initiated in Lemon Squeezy and reflected through verified `order_refunded` webhooks.

## Vertical Journey Design

The current journey compresses all topics into a horizontal fan. Replace it with a vertical route:

- modules flow from top to bottom and connect through one vertical spine;
- each module has a primary node with number, title, state, and progress;
- its step nodes distribute around that module without overlap or positional ambiguity;
- locked modules remain legible and show a lock/price call to action without exposing generated lesson content;
- purchased-generating modules show progress without blocking navigation to ready content;
- desktop acceptance sizes are 1440px and 1920px;
- mobile uses a compact vertical list rather than a miniature graph;
- the existing list view remains an accessible alternative;
- titles must remain understandable without aggressive truncation.

Before/after screenshots and DOM measurements are required. Visual acceptance is a browser result, not a Rails rendering test.

### Real primary route on the landing page

For an authenticated user, the landing-page journey is not a demo or a separately maintained illustration. It renders the user's real primary learning route through the same vertical journey component used by the route experience:

- select the most recently active, non-completed route as primary using a deterministic database ordering;
- derive its title, modules, steps, progress, availability, and purchase/lock states from persisted user-owned records;
- link every actionable node to the corresponding real route or step;
- when no active route exists, show the create-route call to action instead of fabricated personal progress;
- anonymous visitors may see a clearly labeled demo, but it must never be presented as their route;
- any fragment or data cache must include the user and route identity so one user's route cannot appear to another user;
- reuse the WP-19 vertical component and view model rather than creating a second landing-only route implementation.

Acceptance coverage must include a user with multiple routes, a user whose previous route is completed, a user with no routes, an anonymous visitor, node-link correctness, and explicit cross-user isolation.

## Failure Behavior

- Quote failure leaves the user with a recoverable wizard state and creates no provider checkout.
- Preview generation failure can retry and never creates a paid entitlement.
- Checkout creation failure preserves the quote and allows retry.
- A rejected card changes no access.
- A delayed/out-of-order webhook is safe and idempotent.
- An amount, currency, account, mode, user, route, or quote mismatch stops processing and raises an operational alert.
- Paid-generation failure keeps the purchase paid, marks only the affected module failed, and offers/retries generation without charging again.
- A full or partial refund is recorded from Lemon Squeezy's `order_refunded` event. Automated post-refund access revocation is outside the first implementation unless a separate policy is approved; the dashboard must still show the refund accurately.

## Security Requirements

- Lemon Squeezy API keys and webhook signing secrets live in encrypted credentials or runtime secrets and never in source, logs, prompts, fixtures, screenshots, or webhook records.
- Webhook signature verification occurs on the raw request body before parsing business fields.
- Checkout line items and amounts are derived exclusively on the server from the local quote.
- Ownership is checked on every quote, checkout, purchase, module, and route endpoint.
- Payment endpoints receive rate limits and CSRF protection where applicable; Lemon Squeezy webhooks use raw-body `X-Signature` verification instead of browser CSRF.
- Financial state transitions use database constraints and transactions.
- Logs contain internal record IDs and Lemon Squeezy object IDs where safe, but not card/PayPal data, secrets, full webhook payloads, or unnecessary personal data.
- Live mode remains disabled until WP-4 and payment-critical WP-8 findings are closed and a human approves activation.

## Required Verification

### Automated

- one-owner invariant, including concurrent creation attempts;
- anonymous/student/teacher access denied without leaking dashboard content;
- cross-user quote, route, purchase, and module isolation;
- one free module and all later modules locked before purchase;
- USD 2.99 minimum per paid module;
- cost-based price selected when it exceeds the minimum;
- fixed quote after checkout attachment;
- valid and invalid Lemon Squeezy `X-Signature` values;
- mismatched amount/currency/mode/account rejected;
- duplicate and out-of-order webhook events;
- success redirect without webhook does not unlock;
- paid webhook authorizes one route and enqueues generation once;
- generation retry never charges again;
- estimated and actual costs remain distinct;
- existing-route module migration preserves order and progress;
- landing selects and renders the authenticated user's real primary route with correct links;
- landing handles multiple, completed, and absent routes without fabricated progress;
- landing route data and caches remain isolated across users;
- dashboard query count remains bounded as users/routes grow.

### Real integration and browser

- Lemon Squeezy test-mode checkout plus signed `order_created` and `order_refunded` webhook flows, including events resent from its dashboard;
- successful payment, declined card, duplicate event, delayed event, and premature success redirect;
- JavaScript system test for locked-to-paid/generating/ready states;
- owner dashboard at realistic data volume;
- authenticated landing page showing the same real primary route and state as the route experience;
- vertical journey at 1440px, 1920px, and a mobile viewport;
- dark/light themes and English/Spanish copy;
- full main and engine suites, with every pre-existing failure named rather than hidden in a total.

## Codex Prompt Contract

Each WP prompt must include:

- exact base branch/commit expectations and prerequisite ancestry checks;
- premises that Codex must verify against code before editing;
- explicit in-scope and out-of-scope work;
- concrete data invariants and security properties;
- TDD sequence with negative controls;
- exact focused and full-suite commands using `env -u RAILS_MASTER_KEY`;
- browser/provider verification where Rails tests cannot prove behavior;
- a prohibition on deployment and Lemon Squeezy live mode;
- required handoff sections: changes, migrations, decisions, evidence, test counts, remaining risks, and manual checks.

No prompt may treat “the code exists,” “the unit test is green,” or “Lemon Squeezy redirected to success” as proof that the customer flow works.

## Explicitly Deferred

- recurring subscriptions;
- buying individual modules separately;
- coupons, gifting, bundles, taxes, or multiple currencies;
- owner-initiated refunds inside Learning Routes;
- automatic access revocation after refunds;
- multiple owners or delegated admin roles;
- exposing cost or profit calculations to customers;
- Lemon Squeezy live-mode activation and production deployment.
