# Platform STEP 8: What a real creator needs

Written by the reviewer, 5 November 2026, after testing production as a real user in the browser, not from the terminal. STEP numbers shift by one: learning becomes 9, payments 10 and the studio 11.

## 0. What the live test found

The purpose of the MCP, in the owner's words, is that **a creator brings what they already made** in ChatGPT, Claude or anywhere else, and it arrives intact. **Models build the routes** (the owner's correction): the creator's own assistant through the MCP today, and our assistant in the studio later. Nobody hand-builds a route in a form, so the MCP's route tools are the main way routes get made, and they must be excellent. Today the import path depends on the creator's model restructuring content into our schema, and then the platform loses part of it.

**What was measured (production, 5 November 2026):**

| Step | Time | Result |
| --- | --- | --- |
| Landing, first visit | LCP 4.76 s, TTFB 397 ms | Over the 1.8 s budget. The hero text is the LCP element, so the entrance animation or the font is holding it back |
| Landing, second visit | LCP 0.56 s | Fine |
| Connect Claude on the web (custom connector, CIMD, consent) | about 1.5 min | Works |
| Import a two-module course pasted from ChatGPT | about 3 min, with **3 manual approvals** in Claude (resource reads) | Stored word for word in the draft |
| Publish | about 40 s | Works, but adds an "Examen final" the creator never wrote |
| Empezar gratis, then Mis rutas, then the topic | about 5 s | Works |
| Answer a question, wrong and then right | instant | Works. A wrong answer gets "Todavía no" but not the creator's explanation |

**What broke, most serious first:**

1. **The student loses the creator's content.**
   - Markdown shows raw (`**bold**`, `*italic*`), lists collapse into one line, and tables show as pipes.
   - `visual`, `video`, `cards` and `example` blocks don't render at all, silently. The image, the YouTube video and the flashcard exercise all vanished on the lesson page.
2. **Creators can't see a draft.** There is no preview anywhere: not in the app, not in the MCP. Claude had to publish to let the creator look.
3. **The platform adds content the creator didn't write:** a final exam on every route page.
4. **Price can't be set anywhere.** The MCP refuses and no app screen exists. The first import's "15 USD" was silently dropped, so both test routes are free.
5. **New creators can't start.** Enseñar is the unstyled placeholder and `/creador` returns 404. There are no invitations, and no way to ask for a catalog listing.
6. **ChatGPT sees no tools.** This may be the owner's lapsed plan, but it's unconfirmed.
7. **Copy that isn't true:** "Tu avance queda guardado en el teléfono y en la computadora" appears while progress isn't saved.
8. **Friction:**
   - every import needs three approvals, because the format guide is a resource;
   - there is no writing-exercise block;
   - there is no sign-out;
   - admin and consent have no header.

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
- **Every section that changes a screen** carries screenshots at 1440 and 390, light and dark, plus motion recordings, and passes the VISION quality bar.
- **Skills:**
  - frontend-design, icons8 ui-polish and ux-check, vectorlab anti-slop, forms and empty-states;
  - design:ux-copy and humanizer;
  - lr-data-and-tenancy;
  - lr-performance-budget;
  - mcp-builder;
  - llm-secure-patterns secure-external-ingestion, for §2.
- **The proof of this STEP is the reviewer repeating the same live test in the browser and every row above turning green.** Write the tests that make that true before you build.

## §1. Render everything a creator can import

1. **Every block kind in the schema renders on the lesson page,** built to VISION's desk register:
   - **concept:** safe Markdown subset: paragraphs, bold, italic, lists, links, inline code, tables, quotes and headings level 3 and below;
   - **example:** set apart as an example;
   - **visual:** an image with its alt text, lazy and sized, with a broken-image fallback that says the image couldn't load;
   - **video:** YouTube and Vimeo as privacy-enhanced, click-to-load embeds. Other URLs become a link;
   - **cards:** flip cards, keyboard-accessible;
   - **check:** as today.
2. **Markdown is rendered on the server with an allowlist.** No raw HTML, `https` links only, and `rel="noopener nofollow ugc"` on links. Test it with hostile fixtures.
3. **A block kind the page can't render fails the build,** never the page. A test iterates every kind in the schema.
4. **The CSP is updated for the video embed hosts only,** and only on lesson pages.

## §2. Bring what you already made: `upload_document`

1. **A new MCP tool, `upload_document`:** routes:write, idempotent per content hash.
   - It takes the creator's document as Markdown, or as HTML for pages pasted from a browser, plus an optional title and space.
   - **The server does the structuring,** deterministically, with `core`'s parser. The model never rewrites the content. The mapping:
     - `#` becomes the title, `##` a module and `###` a lesson;
     - prose becomes a concept block, a quote an example, an image a visual block and a video URL a video block;
     - a numbered or bulleted option list with ✅ or "Respuesta:" becomes a check block with its explanation;
     - "Ejercicio" followed by "Respuesta" becomes a card;
     - a table becomes part of a concept block.
2. **It returns a report, every item with its place in the source:**
   - what was imported;
   - what was kept as plain text because it didn't map;
   - what was skipped and why;
   - the draft preview link (§3).

   **It never invents content:** no exam, no description, no questions the creator didn't write.
3. **`import_route` stays** for clients that prefer structured JSON.
4. **`get_route_format` becomes a read-only tool,** so Claude can auto-approve it. Keep the resources too.
5. **ChatGPT.** Confirm from the logs whether its requests arrive. If they do, fix what it needs. If they don't, document the plan requirement in "Conecta tu asistente".

## §3. Drafts you can see

1. **A draft preview at `/creador/rutas/<id>/vista-previa`,** visible to members of the space. It shows the route page and every lesson exactly as a student would see them, under a band that says "Vista previa del borrador".
2. **`upload_document`, `import_route` and `get_route` return that preview link,** and the MCP's instructions tell the model to give it to the person.

## §4. The creator's home: `/creador`

Build it to VISION, desk register.

1. **The space card:** its name and public link, with copy and "Editar tu página" (name, tagline, bio, brand colour, contrast-checked).
2. **"Tus rutas":** each route with its real line, draft or published, and these actions:
   - "Vista previa";
   - "Publicar";
   - "Precio";
   - "Pedir entrar al catálogo".
3. **Setting the price:**
   - there is a `route.set_price` action in the UI;
   - the MCP may only read the price;
   - a route sells only once payments exist (STEP 12; it was STEP 10 before the assistant moved ahead), so until then the page says "Precio guardado; el cobro se activa pronto".
4. **The cards:** "Conecta tu asistente", with each client's steps and plan requirement, and "Conexiones".
5. **Empty state:** "Trae una ruta que ya hiciste", with the three steps.

## §5. New creators can start: invitations

1. **"Ya envié la invitación" sends the invitation:**
   - an email from mail.learningroutes.com with a single-use, 7-day link;
   - on first sign-in it creates the account and the owner space, after the slug is confirmed against the reserved list;
   - it lands on `/creador`.
2. **Expired or reused links** get a clear page with a way forward.
3. **The test:** the reviewer repeats it with a test inbox the owner controls.

## §6. Honest pages and small fixes

1. **No exam is added unless the creator wrote one.** Remove "Examen final" from routes that have no exam block.
2. **Copy that isn't true yet is removed:** the saved-progress line, until STEP 9.
3. **A wrong answer** shows the creator's explanation as a hint.
4. **The header:** a sign-out link in the app header, and the header on admin and consent.
5. **Landing LCP under 1.8 s on a cold first visit.** The hero text must paint without waiting for the entrance animation or the font. Measure it with the Lighthouse cold run in CI.
6. **Small fixes:**
   - the creator page for visitors says "Rutas", not "Mis rutas";
   - with no routes, hide "Ver mis rutas" and the "Empiezas gratis" line;
   - fix the landing's clipped chapter title and the overlapping label.

## Report, in one message

- **The live-test table:** the same table as §0, re-measured in production by you, in a real browser.
- **PRs:** each one, with its screenshots and recordings.
- **Departures and questions:** what's left, and the questions for the owner.
