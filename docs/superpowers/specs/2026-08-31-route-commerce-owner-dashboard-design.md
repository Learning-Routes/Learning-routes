# Route Commerce and Owner Dashboard Design

**Date:** 2026-08-31
**Status:** Approved
**Currency:** USD

## Purpose

Learning Routes will sell each personalized learning route as a one-time purchase. A user may generate and use the first complete module for free. The remaining modules are visible but locked until the user buys the rest of that route in one Stripe Checkout payment.

The product owner needs a private dashboard that shows every registered user, their routes, purchase status, revenue, attributed AI cost, Stripe fees, and profit. The dashboard is accessible only to one owner account.

## Confirmed Product Decisions

- A module is a first-class section of a route and contains multiple route steps.
- The first module of every route is a permanent free preview.
- All remaining modules are bought together in one payment.
- There are no recurring subscriptions or monthly plans in this scope.
- Payments and reporting use US dollars.
- The sale price covers the estimated AI cost of the entire route, including the free module, plus the estimated Stripe fee, with a 50% markup.
- The minimum sale price is USD 2.99 for each paid module.
- The customer sees one fixed quote before entering Checkout. Later cost variance never changes that charge.
- Stripe processes the payment, but the application is the source of truth for quotes, purchases, access, and generation state.
- Only one `owner` account exists. There are no secondary administrators.

## Delivery Order

The work is deliberately split so payment never rests on unverified cost or access behavior.

1. **WP-15B — Attempt semantics:** fix the known regression where three incorrect drag-and-drop placements release a block. Make a completed answer, rather than a single interaction, count as an attempt. Do not merge or deploy WP-15 before this passes.
2. **WP-7 — True costs:** review and merge the existing cost-metering and business-dashboard branch. Resolve its known omissions that affect quoting, especially unmetered transcription and cost limits that still use rounded cents.
3. **WP-16 — Owner foundation and user dashboard:** introduce the single-owner invariant and expand the existing dashboard with user and route drill-down.
4. **WP-17 — Modules, quotes, preview, and locks:** make modules first-class, migrate existing routes, generate one free module, calculate an immutable quote, and lock paid modules.
5. **WP-18 — Stripe one-time purchase:** create Checkout Sessions, verify idempotent webhooks, record purchases, and enqueue generation after confirmed payment.
6. **WP-19 — Vertical journey:** replace the compressed radial journey with the approved vertical module layout and responsive list fallback.
7. **WP-4 and WP-8 gates:** close the full-suite failures, add real-browser and provider smoke coverage, and close payment-critical security debt before enabling Stripe live mode.

WP-16 through WP-19 each receive a separate implementation plan and Codex execution prompt. A later package must verify that its prerequisite commits are ancestors of its base before editing code.

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
- estimated Stripe fee;
- markup basis points (`5000` for 50%);
- minimum price per paid module (`299` cents);
- calculated cost-based price;
- calculated minimum price;
- final quoted price;
- estimator/version metadata;
- expiration and supersession state.

The estimator must use the planned route shape, explicit image quality, expected text/audio work, and current provider rates from WP-7. It must include the outline and free-preview generation. Estimation assumptions are versioned so an old quote remains explainable after rates change.

The Stripe fee depends on the final charge. The pricing service must gross up the fee using an explicit, tested formula rather than recursively estimating it or silently losing the fixed fee. Stripe fee constants must be configurable and snapshotted on the quote.

The final price is the greater of:

1. the grossed-up cost-based price that covers estimated full-route AI cost and Stripe fees with the approved 50% markup; and
2. USD 2.99 multiplied by the number of paid modules.

The UI may create a replacement quote before Checkout, but it may not mutate a quote already attached to a Checkout Session or purchase.

### Purchases and Stripe events

`Commerce::RoutePurchase` belongs to one user, route, and quote. It stores:

- state: `pending`, `paid`, `failed`, or `refunded`;
- Stripe Checkout Session and PaymentIntent identifiers;
- amount and currency copied from the quote;
- estimated cost/fee snapshots;
- actual Stripe fee when available;
- paid/refunded timestamps.

A unique constraint prevents more than one successful purchase for a route. Retrying a failed or expired Checkout creates or reuses a safe pending purchase without weakening that invariant.

`Commerce::StripeEvent` stores the Stripe event identifier and processing state. Webhook handling must verify the signature, validate livemode, account, event type, currency, amount, quote, user, and route, then process inside an idempotent transaction. Replaying an event must not duplicate a purchase, job, entitlement, or notification.

The purchase is the durable entitlement. A redirect from Checkout is never proof of payment. Only a verified webhook may transition a purchase to `paid` and authorize paid-module generation.

### Actual cost attribution

Every paid provider call involved in outlining or generating a route must carry the route, module, user, quote/purchase context needed for attribution. The dashboard reports:

- quoted AI cost;
- actual billable AI cost;
- gross revenue;
- actual Stripe fee when available, otherwise the quote estimate labeled as such;
- net profit and margin.

Cached calls remain non-billable. Unknown or unattributed costs are shown explicitly rather than silently treated as zero.

## User Flow

1. The user completes the existing route wizard.
2. The application generates a complete module/step outline and a fixed quote.
3. Only the first module's full content is generated.
4. The journey shows every module. The first is labeled as a free preview; the rest show their titles and descriptions in a locked state.
5. The user can permanently use the preview module without payment.
6. The purchase panel states the number of modules unlocked, fixed total price in USD, and that this is a one-time payment. It does not expose internal AI cost or markup.
7. The server creates a Stripe Checkout Session from the immutable local quote and uses only server-derived identifiers and amounts.
8. On return, the page displays a confirmation/pending state while waiting for the webhook. A crafted success URL cannot unlock content.
9. A verified `checkout.session.completed`/payment event marks the purchase paid and enqueues idempotent generation for paid modules.
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
- Stripe fees;
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
- Stripe fee;
- profit;
- payment identifiers and relevant event history;
- educational progress.

Financial records are read-only in the first release. Refunds are initiated in Stripe and reflected through verified webhooks.

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

## Failure Behavior

- Quote failure leaves the user with a recoverable wizard state and creates no Checkout Session.
- Preview generation failure can retry and never creates a paid entitlement.
- Checkout creation failure preserves the quote and allows retry.
- A rejected card changes no access.
- A delayed/out-of-order webhook is safe and idempotent.
- An amount, currency, account, mode, user, route, or quote mismatch stops processing and raises an operational alert.
- Paid-generation failure keeps the purchase paid, marks only the affected module failed, and offers/retries generation without charging again.
- A refund is recorded from Stripe. Automated post-refund access revocation is outside the first implementation unless a separate policy is approved; the dashboard must still show the refund accurately.

## Security Requirements

- Stripe secrets live in encrypted credentials or runtime secrets and never in source, logs, prompts, fixtures, screenshots, or webhook records.
- Webhook signature verification occurs on the raw request body before parsing business fields.
- Checkout line items and amounts are derived exclusively on the server from the local quote.
- Ownership is checked on every quote, Checkout, purchase, module, and route endpoint.
- Payment endpoints receive rate limits and CSRF protection where applicable; Stripe webhooks use signature verification instead of browser CSRF.
- Financial state transitions use database constraints and transactions.
- Logs contain internal record IDs and Stripe object IDs where safe, but not card data, secrets, full webhook payloads, or unnecessary personal data.
- Live mode remains disabled until WP-4 and payment-critical WP-8 findings are closed and a human approves activation.

## Required Verification

### Automated

- one-owner invariant, including concurrent creation attempts;
- anonymous/student/teacher access denied without leaking dashboard content;
- cross-user quote, route, purchase, and module isolation;
- one free module and all later modules locked before purchase;
- USD 2.99 minimum per paid module;
- cost-based price selected when it exceeds the minimum;
- fixed quote after Checkout attachment;
- valid and invalid Stripe signatures;
- mismatched amount/currency/mode/account rejected;
- duplicate and out-of-order webhook events;
- success redirect without webhook does not unlock;
- paid webhook authorizes one route and enqueues generation once;
- generation retry never charges again;
- estimated and actual costs remain distinct;
- existing-route module migration preserves order and progress;
- dashboard query count remains bounded as users/routes grow.

### Real integration and browser

- Stripe test mode and Stripe CLI signed webhook flow;
- successful payment, declined card, duplicate event, delayed event, and premature success redirect;
- JavaScript system test for locked-to-paid/generating/ready states;
- owner dashboard at realistic data volume;
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
- a prohibition on deployment and live Stripe mode;
- required handoff sections: changes, migrations, decisions, evidence, test counts, remaining risks, and manual checks.

No prompt may treat “the code exists,” “the unit test is green,” or “Stripe redirected to success” as proof that the customer flow works.

## Explicitly Deferred

- recurring subscriptions;
- buying individual modules separately;
- coupons, gifting, bundles, taxes, or multiple currencies;
- owner-initiated refunds inside Learning Routes;
- automatic access revocation after refunds;
- multiple owners or delegated admin roles;
- exposing cost or profit calculations to customers;
- Stripe live-mode activation and production deployment.
