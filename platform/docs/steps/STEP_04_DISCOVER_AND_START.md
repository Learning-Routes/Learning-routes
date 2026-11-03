# Platform STEP 4: Discover and start

Written by the reviewer, 2 November 2026. Start only after Platform STEP 3 is merged. It is: main is at 8f38209c.

## 0. Context

**The owner approved design v2** (`platform/docs/design/reference/v2/`) as the direction, and the product model:
- **Students find routes in two places:** the catalog on learningroutes.com, and each creator's own page on `[slug].learningroutes.com` (custom domains later).
- **Creators join by invitation.** "Quiero enseñar" leaves an application; the owner approves it.
- **Students pay per route,** with module 1 free. Payment arrives in Platform STEP 6. A platform subscription comes later; leave room for it, build nothing.
- **One account, many roles.** The app has two modes, Aprender and Enseñar, and an admin area for the owner only.

**This STEP covers everything up to "the student is enrolled":** the landing, the catalog, the creator's page, the route page, "Empezar gratis", and "Quiero enseñar".

**The next STEPs:**
- Platform STEP 5, learning: the map, topics, questions, extra practice, exams, reviews, and the "Sigue con el módulo 2" screen;
- Platform STEP 6: payments;
- Platform STEP 7: teaching, with the studio, the assistant and invitations.

**Where each page lives (`FOUNDATIONS.md` §3, ADR 0004):**
- **Platform host (learningroutes.com):** the landing, the catalog. Server HTML, no JavaScript, no session.
- **Creator hosts (`[slug].learningroutes.com`):** the creator's page and each route page. Server HTML, no JavaScript, no session, cookies stripped.
- **App host (app.learningroutes.com):** sign-in, "Empezar", "Quiero enseñar", Mis rutas, admin. React, with a session.

**Each route has one canonical page: the one on its creator's host.** The catalog links there. Never render the same route at two indexable URLs.

## Batch rules

- **Same as always:**
  - no tool or AI attribution anywhere: no Co-Authored-By trailers, no generated-with lines, no mentions in docs;
  - the repository is public: no secrets, no personal data, fixtures with invented names;
  - exact pins at the newest release at least 14 days old;
  - red-first tests, small commits, one PR per section, stacked;
  - merge §1 yourself once green; leave the rest for the reviewer;
  - screenshots at 390 and 1440 px, light and dark, in every PR that changes a screen;
  - the visual and axe checks cover every new page.
- **Skills to load:**
  - lr-data-and-tenancy for every table, role, view and action;
  - lr-performance-budget for every page;
  - workers-best-practices and wrangler for Worker code;
  - frontend-design, plus the vectorlab skills for forms, errors, empty states, labels and verbs;
  - cloudflare:turnstile-spin for §6;
  - a security skill for §1 and §6.

  Name the skills you used in each PR.
- **Follow the v2 rules on every screen:**
  - the route line is the hero;
  - one primary action per screen;
  - Archivo only;
  - no all-caps labels, no middle-dot strings, no decorative pills, no arrows on buttons;
  - gold is "you are here", green is "done", plum is "the action";
  - progress and facts are said in words.

  Vocabulary comes from the glossary in `FOUNDATIONS.md` §4b.

## §1. Public reads: a role, views and a cached connection

Storefront pages are public and must be fast, so they read through their own path.

1. **A read-only role `lr_public`** with `SELECT` on views only, never on tables. It has no `BYPASSRLS` and inherits nothing, as `lr_app`. Add it to the grants file.
2. **Views, `security_barrier`, that expose only what a stranger may see:**
   - `public_spaces`: not archived; slug, name, tagline, bio, brand colour, locales. Never member data.
   - `public_routes`: the latest published version of routes that are not archived, in spaces that are not archived. It carries the snapshot fields a visitor needs: titles, module titles, lesson titles and counts, price, free module, topic and locale.
   - `public_catalog`: routes in `public_routes` whose catalog listing is approved (§3).

   The views are owned by the migrator. A test as `lr_public` proves it cannot read any table, draft, member, enrollment or progress row.
3. **A second Hyperdrive binding, `DB_PUBLIC`,** with caching on (the default: `max_age` 60 s, `stale_while_revalidate` 15 s), connecting as `lr_public`. Hyperdrive caches only queries that call no `STABLE` or `VOLATILE` function, so these reads pass values as parameters and never call `now()` or `current_setting()`. Test that the storefront queries contain neither.
   - `DB` (no cache, `lr_app`) stays for everything with a session.
   - dependency-cruiser: storefront loaders import only the public repository; app code never imports it.
4. **Edge cache:**
   - storefront responses send `Cache-Control: public, s-maxage=300, stale-while-revalidate=60`;
   - they carry a `Cache-Tag` of `space:<id>` and `route:<id>`;
   - publishing a route and deciding a catalog listing purge those tags through the Cloudflare API, from a queued job after the commit, never inside the transaction.

   Purge by tag is available on every plan; verify the rate limit for this plan. The token is a secret named in `.dev.vars.example`. Purging is a no-op locally, with a test that it is called.
5. **Never vary on a cookie.** The storefront response is the same for every visitor, with a test.

## §2. The schema this STEP needs

Run every migration through squawk, and follow the naming rules.

1. **`spaces` gains** `tagline` (localized), `bio` (localized) and `brand_color`.
   - `core` validates that white text on `brand_color` passes WCAG AA (4.5:1), with a test.
   - A colour that fails is refused with a message saying why, and a suggestion of the nearest colour that passes.
2. **`routes` gains:**
   - `topic`: one of idiomas, matemáticas, programación, ciencias, música, negocios, arte, otros. It is a `core` enum, translated in all five locales.
   - `level`: inicial, intermedio, avanzado.
   - `price_minor` and `currency`: the route's one-time price. Null means not for sale yet. The free module is always module 1.

   The publish snapshot carries all three.
3. **`catalog_listings`:**
   - `route_id`, `space_id`;
   - `status`: requested, approved, declined, withdrawn;
   - `note`, `requested_at`, `decided_at`, `decided_by`.

   One active row per route. A new version of an approved route stays approved; the owner sees a "changed since approval" marker in admin.
4. **`creator_applications`:**
   - `name`, `email`, `teaches`, `link`;
   - `locale`, `status` (new, invited, declined), `created_at`, `decided_at`.

   No account is needed to apply. This table holds personal data, so `lr_public` never reads it, and `user.erase` deletes rows with the same email.
5. **The platform operator role becomes real:** `platform_roles.operator` grants only the admin actions in §3 and §6, via `ui` only, in the permission table.

## §3. The catalog

1. **Actions:**
   - `catalog.request` (owner of the space, `ui` only): requests a listing for a published route. It is refused if the route has no price set and no free module.
   - `catalog.withdraw` (owner).
   - `catalog.decide` (operator only, `ui` only): approve or decline, with an optional note to the creator. This STEP stores the note; STEP 7 emails it.
2. **The catalog page** at learningroutes.com/explorar, as in v2's `Catalogo`:
   - "¿Qué quieres aprender?", a search field and topic filters;
   - one card per route, showing the route's own line, drawn from its module and lesson counts so that no two cards look the same, its title, "Con [creador]" and its module and topic counts in words;
   - it works with no JavaScript: search and filters are plain GET links and a form, and the results are server-rendered;
   - search uses `pg_trgm` on the title in the page's locale, through a view column;
   - pagination of 24, with `rel="next"` and `rel="prev"`.
3. **Each card links to the route's canonical page** on its creator's host.
4. **The empty states:**
   - no results: "No encontramos rutas para «…»", with a link that clears the filters;
   - an empty catalog: the landing's "Quiero enseñar" call to action.

## §4. The landing, rebuilt from v2

1. **Rebuild `routes/storefront/home.tsx` from v2's `Main`:**
   - the header: Explorar rutas, Enseñar, Entrar;
   - "Aprende con quien mejor lo enseña.";
   - the large route drawing as server SVG, with done in green, you-are-here in gold, extra practice and the exam;
   - "Así se recorre una ruta" in three steps;
   - "Rutas para empezar": up to three approved catalog routes, chosen by the owner in admin (§6) or, if none are chosen, the newest three. The whole section is hidden when there are none;
   - the dark "¿Enseñas algo que sabes bien?" block, linking to "Quiero enseñar" on the app host.
2. **Budgets:**
   - no JavaScript;
   - CSS within the 20 KB storefront budget;
   - LCP under 1.8 s, CLS under 0.05;
   - the hero SVG inline and under 6 KB.
3. **The first paint never waits for the web font:** use a fallback with metric overrides, so there is no layout shift.

## §5. The creator's page and the route page

1. **The creator's page** at `[slug].learningroutes.com`, from v2's `Vitrina`:
   - name, tagline, bio;
   - an initial avatar until photos arrive in STEP 7;
   - the creator's routes;
   - the brand colour on the primary actions;
   - "Hecho con Learning Routes" in the footer.

   An unknown slug returns 404, and an archived space returns 410.
2. **The route page** at `[slug].learningroutes.com/[route-slug]`, from v2's `Ruta`:
   - the title and the description;
   - the facts in words: "3 módulos y 14 temas. Para empezar desde cero. En español.";
   - "El recorrido": the modules as stations on a vertical line, module 1 marked "Gratis", then the final exam;
   - the side card: "Empieza gratis, hoy.", the price in words ("pagas una vez por la ruta: [price]"), and "Empezar gratis".
3. **"Empezar gratis" links to `app.learningroutes.com/empezar?ruta=<route id>`.** It carries no other parameter; the app resolves everything on the server.
4. **SEO, on every storefront page:**
   - the canonical URL;
   - hreflang only for the locales the space has text in;
   - Open Graph and `schema.org/Course` on route pages;
   - a `sitemap.xml` per creator host and one for the platform host.

## §6. Starting a route, and "Quiero enseñar"

1. **`/empezar?ruta=<id>`, on the app host:**
   - **No session:** the sign-in flow from STEP 3. The page states which route the person is joining, and `ruta` survives the magic link round-trip through a server-side, signed, short-lived value. The id never travels in the email link.
   - **With a session:** `enrollment.create`. On success, go to Mis rutas; on "already enrolled", go there too.
   - A route that is not published, not open or not found shows a plain message with a link back to the catalog.
2. **Mis rutas, minimal, from v2's `MisRutas`:**
   - the Aprender / Enseñar switch, where Enseñar shows only for members with a teaching role;
   - one card per enrollment, with the route's line, its title, "Con [creador]" and "Seguir". In this STEP, "Seguir" opens a placeholder page; STEP 5 builds the map;
   - the empty state: "Todavía no estudias ninguna ruta.", with a link to the catalog.
3. **"Quiero enseñar", on the app host,** from v2's `Ensenar`:
   - name, email, what they teach, and an optional link;
   - Cloudflare Turnstile, verified on the server with Siteverify;
   - a rate limit per IP and per email;
   - after sending: "Recibimos tu solicitud. Te escribimos a [email] en unos días."

   No email is sent in this STEP. The page works without signing in.
4. **Admin, minimal, at `/admin`, operators only, from v2's `Operador`:**
   - the creator applications, with "Marcar como invitada" or "Rechazar". The real invitation comes in STEP 7;
   - the catalog requests, with approve or decline and a note;
   - choosing the landing's "Rutas para empezar".

   Every admin action writes `action_log`. A non-operator gets 404, never 403.

## §7. Tests that prove it

1. **The public role:**
   - it reads only the views;
   - a draft, an unpublished change, an archived route and an unapproved listing never appear on any storefront page;
   - a member's email never appears in any storefront HTML.
2. **Caching:**
   - storefront queries are cacheable, with no `now()` or `current_setting()`;
   - publish and catalog decisions purge the right tags;
   - no storefront response varies by cookie.
3. **The whole path,** in the browser, against the real local API and database:
   1. landing;
   2. catalog;
   3. search;
   4. route page;
   5. "Empezar gratis";
   6. sign in, with the magic link taken from the dev sender;
   7. enrolled, with the route in Mis rutas.

   The same path with the session already open skips sign-in.
4. **Admin:**
   - an operator approves a listing, and it appears in the catalog within the cache window;
   - a non-operator gets 404 on every admin route and action.
5. **Accessibility and visuals:**
   - axe shows zero serious or critical violations on every new page, at both widths and in both themes;
   - the visual baselines are recorded on CI;
   - the catalog, the creator's page and the route page also pass with JavaScript disabled.

## Report, in one message

- **PRs:** each one, with its screenshots and green run.
- **Numbers:** JavaScript, CSS and HTML size per storefront page, the Lighthouse numbers for the landing, the catalog and a route page, and the cache hit rate on a repeated catalog load.
- **Verifications:** what each "verify" found.
- **Copy:** every new string, in the five locales.
- **Departures and questions:** every departure from this STEP and its reason, and the questions for the owner.
