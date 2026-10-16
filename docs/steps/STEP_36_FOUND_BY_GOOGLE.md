# STEP 36 — found by Google: the site tells search engines it lives on a dead domain

**Mandate from the owner (13 October):** *"We need to get positioned on Google — learningroutes,
learning routes, and so on."* **Branch:** `seo-foundations`, from `main`. **Package:** small
(one sitting) for §1–§4; §5 is a second PR.

## 0. What is true today (measured 13 October, from outside and from the code)
- Searching Google for `"learningroutes.com"` returns **nothing from this site**. The brand query
  "learning routes" is owned by an unrelated ed-tech company in India (learningroutes.in, with
  Glassdoor and review pages). Generic "learning" or "routes" are not attainable for any new site
  and are not the goal; the attainable goals are the one-word brand `learningroutes`, the
  two-word brand over time, and real intent queries (see §5).
- The landing (`app/views/landing/index.html.erb` lines 5–21) declares
  `<link rel="canonical" href="https://learning-routes.com/">`, `og:url`, `og:image`,
  `twitter:image` and the JSON-LD `url` all on **learning-routes.com — a domain with no DNS**.
  `public/robots.txt` points `Sitemap:` at that domain, and `public/sitemap.xml` lists three URLs,
  all on it. To Google this reads: "the real page is at an address that does not exist", which is
  the single most likely reason the site is absent from results. Every other fix is secondary
  to this one.
- The locale is a cookie (`locale_controller.rb`, `cookies[:locale]`): one URL serves two
  languages, so a crawler sees exactly one version (English) and the Spanish market, which the
  product is for, has no URL to rank. No `hreflang`.
- The footer and the Terms/Privacy copy publish `hello@learning-routes.com`, an address on the
  dead domain; mail to it bounces. `mailer_footer` says "learning-routes.com" too.
- `og:image` is `apple-touch-icon.png` (an app icon), not a 1200×630 share image.
- robots.txt disallows every authenticated path (correct) and the sitemap offers only `/`,
  `/sign_in`, `/sign_up`: three thin pages. Privacy and Terms are public and indexable but not
  in the sitemap.

## 1. One host, everywhere (red first)
- `config.x.public_host = "learningroutes.com"` (production; `localhost:3000` in development),
  read by a helper `public_url(path)` → `https://learningroutes.com/<path>`. Canonical, `og:url`,
  `og:image`, `twitter:image`, JSON-LD `url`, robots `Sitemap:` and every sitemap `<loc>` come
  from it. No literal host in any view.
- **The class-preventing test**: a sweep over `app/views`, `app/helpers`, `config/locales`,
  `public/` and `config/initializers` that fails on any occurrence of `learning-routes.com`
  outside a comment. Seen red first (it is red today, in ~14 places), then green. Add the sweep's
  allow-list for the two places where the old domain legitimately stays: `config/deploy.yml`
  (`proxy.host` keeps the old name so a request to it is still answered) and CORS/CSP origins —
  both get a comment saying why, and both go away when §6 is decided.
- `hello@learning-routes.com` → `hello@learningroutes.com` in the footer, in both locales'
  Terms and Privacy, and `mailer_footer`. (The owner creates the mailbox or a forward — §Owner.)
- robots.txt and sitemap.xml stop being static files in `public/`: a `SitemapsController`
  (or `sitemap.xml.erb` + `robots.txt.erb` routes) renders them from the host and from the list
  of public pages, with `<lastmod>` from the view file's git date or a constant you bump. Add
  `/privacy` and `/terms`. Test: the sitemap's every `<loc>` starts with the public host, and
  robots points at it.

## 2. A URL per language (the only way Spanish ranks)
- Scope the **public** routes under an optional locale: `/`, `/es`, `/en`, `/es/privacy`,
  `/en/terms`, `/es/sign_in` … (`scope "(:locale)", locale: /es|en/`). `/` without a locale
  serves the default and declares `x-default`. The cookie keeps working for signed-in pages
  (nothing changes behind the login); on public pages the URL wins over the cookie, and the
  language toggle links to the sibling URL instead of posting the cookie.
- Each public page emits `<link rel="alternate" hreflang="es" …>`, `hreflang="en"` and
  `x-default`, plus `<html lang>` matching. Canonical = the page's own locale URL (never the
  other language). Test: for each public page × locale, the three alternates and the canonical,
  and that `/es` renders the Spanish `<title>`.
- Sitemap lists every public page in both locales with `xhtml:link` alternates.

## 3. What the page says to a machine
- `<title>` and meta description per locale, ≤ 60 / ≤ 155 characters, containing the brand and
  the real promise. Provisional copy (owner's product decision in §Owner; take this until he says
  otherwise): ES `Learning Routes — rutas de aprendizaje con IA, paso a paso` /
  `Aprende inglés y otras materias con una ruta personalizada por IA: lecciones, ejercicios y
  exámenes a tu ritmo. Empieza gratis.`; EN `Learning Routes — AI learning routes, step by step` /
  `Learn English and other subjects with an AI-built route: lessons, exercises and exams at your
  pace. Start free.`
- JSON-LD: `Organization` (name, url, logo, sameAs: the X and GitHub links already in the
  footer) + `WebSite` (with `inLanguage` es/en) + keep `WebApplication`. Validate with the
  schema.org validator in CI (a JSON parse + required-keys test is enough locally).
- A real `og:image`: 1200×630 PNG under `app/assets/images/og/`, one per locale, with the
  wordmark and the promise, rendered from an HTML template with the system test's Chrome
  (`page.driver.browser.save_screenshot` at 1200×630) and committed; test: the file exists, is
  1200×630, and `og:image` points at it with an absolute URL.
- Headings: exactly one `<h1>`; images with `alt`; the "ES/EN" toggle as a link with `hreflang`.
- Lighthouse SEO category ≥ 95 on `/`, `/es`, `/en`, measured in the system suite
  (`lighthouse` via the installed Chrome, or `bin/lighthouse` script) and quoted in the PR.

## 4. Proof, then PR
- `curl -s https://learningroutes.com/ | grep -c "learning-routes.com"` must print `0` after
  the deploy (quote it); same for robots.txt and sitemap.xml.
- All three suites; the sweep test named with before/after counts; the Lighthouse numbers;
  screenshots of the share card from https://www.opengraph.xyz or the equivalent, ES and EN.
- PR against `main`, merge-base and commit range; stop for the reviewer. After the owner's deploy,
  he submits the sitemap in Search Console (§Owner) — indexing is his click, not yours.

## 5. Second PR — pages that can rank (after §1–§4 are live)
Three public pages with real text, in both locales, linked from the footer and the sitemap:
`/es/como-funciona` (how a route is built: diagnosis, modules, lessons, exams, reinforcement — with
the real screenshots), `/es/ingles` (the English route: levels B1→B2, what a week looks like,
price), `/es/acerca` (who makes it, why, contact). Each: title, description, h1, 400–800 words
of plain writing, no AI filler, FAQ block with `FAQPage` JSON-LD. These target the queries a
person actually types — "aprender inglés con inteligencia artificial", "ruta de aprendizaje
personalizada", "curso de inglés con IA" — not "learning". Copy is drafted by you and approved
by the owner before merge (product decision).

## Owner — what only he can do, in order
1. **Decide the contact address** on learningroutes.com (`hello@`): a mailbox (Google Workspace)
   or a free forward (Cloudflare Email Routing or ImprovMX → his Gmail). Until it exists, the
   footer address bounces.
2. **Google Search Console**: add the property `learningroutes.com` (Domain property, verified
   by the DNS TXT record Google gives him, at the registrar), then **Sitemaps → submit**
   `https://learningroutes.com/sitemap.xml`, then **URL inspection → Request indexing** for `/`,
   `/es`, `/en`. Bing Webmaster Tools: "Import from Google Search Console" (one click).
3. **learning-routes.com**: does he own it? If yes, point it at the server and let the proxy
   301-redirect every request to learningroutes.com (one rule in `config/deploy.yml` / a tiny
   middleware, tested) so any old link or mention transfers. If not, strip the old host from
   `proxy.host`, CORS and CSP (§1's allow-list empties) and the subject is closed.
4. **Positioning**: confirm or change the provisional title/description in §3 — specifically
   whether the site presents itself as "English for Spanish speakers" (what the videos and the
   owner's own route are) or "learn anything". Google ranks a page for what it says it is.

## Constraints, unchanged
STEP 34 §6. Nothing behind the login changes. No external SEO scripts, no tracking pixels, no
paid tools — this package is markup, URLs and words.
