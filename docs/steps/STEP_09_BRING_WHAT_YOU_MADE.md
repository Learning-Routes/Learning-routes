# Platform STEP 9: Bring what you made: interactive creations

Written by the reviewer, 5 November 2026. Start after STEP 8 is merged and deployed. **STEP numbers shift again:** learning becomes 10, payments 11 and the studio 12. Update FOUNDATIONS and the STEP files that name them.

## 0. Why

The owner's product rules, stated more than once:
- **Models build the routes.** The only ones who create routes are the AI models that help the creator: the creator's own assistant through the MCP today, and our assistant in the studio later. Nobody hand-builds a route in a form editor, so the MCP's route tools are the main way routes get made, and they must be excellent.
- **What the creator made arrives intact.** The creator and their model must be able to bring everything the creator already made, in ChatGPT, Claude or anywhere else, without losing anything.

Creators make more than text. The owner's own test today was a piano that plays sound, built as a Claude artifact: one HTML file with its script. Our MCP answered that it can't take it. That is the gap this STEP closes. Interactive creations become a first-class part of a lesson: a piano, a quiz game, a simulation, a chart someone can play with.

The danger is real: we would be running a stranger's code. Every rule below exists so that a creation can do anything inside its own box and nothing outside it.

## Batch rules

- **Same as always:**
  - no attribution;
  - public repo hygiene;
  - explicit `git add` paths;
  - deploy only from main;
  - no history rewrites;
  - red-first tests;
  - one PR per section;
  - `pnpm check`.
- **Skills:**
  - a security skill;
  - llm-secure-patterns, secure-external-ingestion and output-validation;
  - workers-best-practices and wrangler;
  - cloudflare (R2);
  - lr-data-and-tenancy;
  - lr-performance-budget;
  - mcp-builder;
  - frontend-design, for the block and the creator's screens.
- **Run an independent security review of §1 and §2 before you merge them,** with an agent that hasn't seen the code being written, and put its findings and your fixes in the PR. Keep the findings general: no exploit recipe in a public PR.

## §1. Where creations run: an isolated content origin

1. **Creations are served from a host that shares nothing with the app.**
   - **Recommended:** a separate registrable domain only for user content, the way large platforms keep user files off their main domain. Find the cheapest suitable domain, give the owner the yearly price and wait for his yes before buying anything.
   - **Until then:** serve from `contenido.learningroutes.com`.
2. **Defences that hold even on our own domain:**
   - the session cookie is already `__Host-`, so it is never sent to another host;
   - every creation is embedded in an `iframe` with `sandbox="allow-scripts"` and never `allow-same-origin`, so it runs with an opaque origin;
   - the content host sets no cookies and reads none.
3. **Every creation's response carries a strict CSP:**
   - `default-src 'none'`;
   - scripts and styles inline, plus `https://cdnjs.cloudflare.com`, `https://cdn.jsdelivr.net` and `https://unpkg.com`, because creators' artifacts load libraries from there;
   - fonts from Google Fonts;
   - images and media from `data:`, `blob:` and the content host;
   - `connect-src 'none'`: a creation never calls the network;
   - `form-action 'none'`;
   - `frame-ancestors` set to our app and creator hosts only;
   - `X-Content-Type-Options: nosniff`.

   Verify against current CSP and iframe sandbox docs. Test in Chrome, Safari and Firefox that the box holds:
   - a creation can't read the parent page;
   - it can't navigate the top window;
   - it can't fetch anything;
   - it can't set cookies;
   - it can't open popups.
4. **Sound and full screen work after a click inside the creation:** `allow="autoplay; fullscreen"` on the frame, nothing more. Verify that the piano plays.
5. **Files live in R2,** keyed by space, route and a content hash.
   - They are served by a small Worker on the content host, never from the app's Workers.
   - They are immutable; a new upload makes a new hash.
   - Unpublished creations are served only through a short-lived signed URL, used by the draft preview.

## §2. The MCP: `upload_creation` and `upload_asset`

1. **`upload_creation`** takes:
   - the creation's source, a single HTML file of up to 2 MB, and for larger ones an upload URL flow;
   - a title;
   - a short description for the student;
   - where it goes: an existing lesson, or a new lesson in a named module.

   It stores the file and adds an `interactive` block. It returns:
   - the block id;
   - the draft preview link;
   - a report of what the creation will not be able to do here (for example "pide datos a internet: aquí no puede"), found by a static scan.

   **The source is stored exactly as given:** never rewritten by us or by the model.
2. **`upload_asset`** takes images, audio and short video, up to a per-file and per-space limit set in config. It returns a content-host URL that `upload_document`, `import_route` and creations can use.
   - Check the type by its bytes, not its name.
   - No SVG with scripts: sanitize SVG, or serve it as an image only.
3. **Limits.** Per-space storage quota, with Code to propose the number from R2 pricing. Rate limits per connection, as the other writes. Every upload writes `action_log`.
4. **The MCP instructions and the route-format guide say plainly:**
   - a creator can bring interactive creations;
   - they are kept as they are;
   - what they can't do here.

   A model asked to "sube este piano" should call `upload_creation`, never offer to rebuild it.
5. **`upload_document`.** When it finds an embedded artifact or a link to one in the document, it reports it and says to send it with `upload_creation`.

## §3. Students: the interactive block

1. **The block on the lesson page:**
   - the creator's title and description;
   - the sandboxed frame, sized from the creation's own aspect, with a full-screen button;
   - a quiet line: "Hecho por [creador]. Funciona dentro de esta página."

   Build it to VISION's desk register. It loads lazily, after the lesson text.
2. **Progress, prepared for STEP 10.** A creation may send `{ type: "lr:done" }` to the parent page through `postMessage`. The page accepts it only from its own frame, ignores anything else, and in this STEP just shows "Lo terminaste". Saving it waits for STEP 10. Document the message for creators in the format guide.
3. **No JavaScript, or a blocked frame:** a clear message that the activity needs a modern browser, with the rest of the lesson unaffected.
4. **Accessibility.**
   - The frame has a title.
   - Keyboard focus can enter and leave the frame.
   - A creator can add a text alternative, shown under the frame.

## §4. The creator's side

1. **In `/creador`, on each route,** creations show as cards with a live thumbnail, generated once on upload, and "Reemplazar" or "Quitar". Replacing uploads a new file and keeps the block.
2. **The draft preview runs creations,** through signed URLs.
3. **"Trae una ruta que ya hiciste"** gains a fourth line: "¿Hiciste algo interactivo, como un juego o un simulador? Pídele a tu asistente que lo suba tal cual."

## §5. Prove it as a real user

1. **In Claude on the web, with the owner's account:**
   1. Make a small piano artifact.
   2. Say "súbelo a mi ruta de prueba en Learning Routes, tal cual".
   3. Check that it lands as an `interactive` block.
   4. Preview the draft.
   5. Publish the route.
   6. Open the lesson as a student and play notes.
2. **Escape attempts, in a fixture creation:**
   - read `parent.document`;
   - `fetch` our API;
   - set `top.location`;
   - read cookies;
   - `window.open`.

   Each must fail, in all three browsers. A test asserts each one.
3. **Measure:**
   - the time from "súbelo" to the block existing;
   - the lesson's LCP with a creation on it, which must stay under 1.8 s because the frame loads after the text;
   - the Worker sizes.

## §6. The visual and motion pass, on every page in production

**The owner's verdict on production: "literal nada tiene animaciones, nada tiene nada".**

The reviewer checked in the browser. Animations exist in the code, but nobody feels them:
- the page-open rise is too short and too small to notice;
- the creator hub's route lines are nearly empty (a ring and two dots);
- "Enseñar" has no depth;
- the lesson page is flat, and still shows raw Markdown because STEP 8 isn't deployed;
- most buttons, cards and links have no hover, press or focus feedback beyond the browser default;
- moving between app pages is an instant cut.

The bar is `docs/design/reference/vision/pages.html`. Open it next to production and close every gap.

1. **Audit first.** For every page in production:
   - record it, at 1440 and 390, signed in and out;
   - put the recording next to the same page in the prototype;
   - list each difference in a table in the PR, with the fix.

   The pages are: landing, catalog, creator page, route page, sign-in (each state), Mis rutas, lesson, the creator hub and its subpages, consent, ser-creador, admin, 404 and errors.
2. **Motion every page must have, consistent everywhere:**
   - **On opening:**
     - the headline's words rise visibly, about 800 ms, staggered;
     - the supporting pieces settle after it;
     - every route line traces itself while its stations pop in as the line reaches them.
   - **Moving between pages:** cross-document View Transitions between all app pages and between storefront pages, not only on the catalog filter.
   - **Pointer and keyboard:**
     - every interactive element answers hover, press and focus;
     - buttons press down;
     - cards lift their border and glow;
     - links underline in;
     - the catalog card's gold runner works on touch too, as a first tap.
   - **Progress:**
     - a correct answer draws the check;
     - the dot moves one station, and finishing a topic gets the band's entrance;
     - a wrong answer gives a short shake and shows the hint.
   - **Waiting:** skeletons in the page's own shapes, a route line that pulses gently while loading, and buttons that show they're working while a request runs.
   - **Feedback:** saving, copying, publishing and disconnecting confirm with a small toast in the page's voice.
3. **Finish, with the 3D titles and the real route shape everywhere:**
   - every h1 and section h2 has the professional depth from VISION, including the hub, admin, consent and the lesson;
   - every route line everywhere, the hub included, is the route's real shape with even station spacing.
4. **Reduced motion** keeps every page complete and still, as VISION says.
5. **Proof:** production recordings of every page before and after, attached to the PR, plus a short recording of the full student path and the full creator path.

## Report, in one message

- **PRs:** each one, with its screenshots and a recording of the piano playing in a published lesson.
- **The security review:** its findings, as a summary only, and the fixes.
- **The isolation tests:** results in each browser.
- **Price and decisions:** the domain price, which waits for the owner's yes, and the storage quota proposal.
- **The measurements:** everything from §5.3.
