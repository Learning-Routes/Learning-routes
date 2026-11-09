# Platform STEP 10: Tu asistente, the guided studio

Written by the reviewer, 6 November 2026. Start after STEP 9. **Numbers shift:** learning becomes STEP 11, payments 12. This STEP is the studio that was planned for later, pulled forward because it is the product for creators. Update FOUNDATIONS and the STEP files.

## 0. The product

A creator who isn't technical arrives and says "quiero mi app de matemáticas". Our assistant takes it from there:
- one question at a time, warm and short;
- it finds out what they already have and how they want to work;
- it plans the route with them and builds it;
- it shows each part as students will see it;
- it publishes only when they say so.

Behind it, a library of skills (pedagogy, subjects, formats, quality checks) is loaded only when needed, so every answer is expert without the creator seeing any machinery.

It should feel like this (the creator is fictional):

> **Andrés:** Quiero mi app de matemáticas.
> **Asistente:** ¡Hola, Andrés! Vamos a armarla juntos. Primero: ¿ya tienes contenido tuyo, como apuntes, videos, ejercicios o algo que hiciste con otra IA, o empezamos desde cero?
> *[Tengo contenido] [Desde cero] [Un poco de los dos]*
> **Andrés:** Tengo mis guías en PDF.
> **Asistente:** Perfecto, súbelas aquí. Las leo y te propongo el recorrido sin cambiar tus palabras. Mientras, ¿para quién es: colegio, universidad o adultos que vuelven a estudiar?

Rules that never bend:
- **Models build the routes** (owner's rule). Our assistant is the main way; the creator's own assistant through the MCP is the other.
- **What the creator made arrives intact.** Their files go in through `upload_document`, `upload_creation` and `upload_asset`, never rewritten.
- **One tool surface.** The assistant uses exactly the same `core` actions as the MCP, with the same permissions, tenancy and `action_log`, and `via: "agent"`. No second path into the data.

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
  - lr-ai-cost-guard on every model call;
  - cloudflare agents-sdk and durable-objects;
  - workers-best-practices;
  - llm-secure-patterns: agent-action-surface, system-prompt-design, secure-external-ingestion and output-validation;
  - oracle-prompt-engineering and ai-evaluation;
  - frontend-design and the VISION.md quality bar for the chat;
  - the education-agent-skills plugin as reference material for §3.
- **Verify current docs before you build:** the Cloudflare Agents SDK (its chat agent class, resumable streaming and the React hook) and OpenRouter's current API. Name the versions in the PR.

## §1. The agent

1. **One agent per creator space,** a Durable Object built with the Agents SDK, with:
   - streamed replies;
   - history kept in the object's storage;
   - conversations that survive a reload or a lost connection;
   - several conversations per space ("Nueva conversación").
2. **Models through OpenRouter only,** via the existing gate in `core/ai` (`gate.ts`, `models.ts`), so every call is budgeted, logged with its cost and refused when over budget.
   - **Tiers:** a small, cheap model for the interview, routing and short replies; a strong model only for planning and writing lessons.
   - **No provider that stores or trains on requests,** as `gate.ts` already says.
3. **Files in the chat:**
   - PDF, DOCX, Markdown, HTML, images, audio, and HTML creations such as a piano or a game;
   - each goes to R2 first, and then through the same import tools as the MCP;
   - text from PDFs and DOCX is extracted on our side; extraction can be done with an AI model only if `lr-ai-cost-guard` allows it, and the result is shown to the creator before anything is built.

## §2. The guided flow

The agent follows a visible path. A small route line at the top of the chat shows the steps, with gold on the current one:

| Step | Name | What happens |
| --- | --- | --- |
| 1 | Conocerte | Name, what they teach, who their students are, their language, their tone |
| 2 | Tu contenido | They have content, start from zero, or mix. Uploads happen here |
| 3 | El plan | Modules and topics drawn as a real route line in the chat, which they change by talking ("junta estos dos", "agrega práctica de fracciones") |
| 4 | Construir | Module by module, each with its preview inline and a link to the full draft preview |
| 5 | Revisar | The quality skills check accuracy, level, clarity and accessibility, and report in plain words what to fix |
| 6 | Tu página | Tagline, bio, brand colour (contrast-checked), price |
| 7 | Publicar | Only on an explicit "publícala", then the offer to ask for a catalog listing |

**One question at a time,** with quick-reply buttons for the common answers. The creator can always type freely, skip ahead or go back.

**The chat itself is built to VISION, desk register:**
- the route line is the hero;
- the assistant's turns are calm text;
- tool work shows as one quiet line ("Creando el módulo 2…");
- previews are real cards;
- streaming text fades in;
- every action confirms with the same toast as the rest of the app.

## §3. The skills library

1. **Skills are files in the repo: `skills/<area>/<name>/SKILL.md`.**
   - The frontmatter has `name`, `description` (when to use it), `area`, `tags`, `version` and `cost` (`small` or `strong`).
   - The body is the instructions, plus any templates and examples.
   - They are not code, and they ship with the agent.
2. **Loading them: progressive disclosure, the way Claude's skills work.**
   - The agent always sees a compact index: name and description only.
   - It loads a skill's full text only when the step and the creator's words call for it.
   - At most four are loaded at once, and they are unloaded when the step changes.
   - Every load is logged, so we learn which skills earn their place.
3. **Start with about 40 excellent skills, built so the library can grow to hundreds:**

   | Area | Skills |
   | --- | --- |
   | Entrevista | Discovery questions, finding the student, the creator's voice, existing material |
   | Pedagogía | Backwards design, scope and sequence, retrieval practice, spaced practice, worked examples, faded examples, formative checks, hinge questions, error analysis, cognitive load |
   | Formatos | One per block kind: how to write a good concept, check, example, cards and interactive brief |
   | Materias | Mathematics, languages, music, programming, sciences, business and art, each with its common misconceptions and good exercise types |
   | Importar | From PDF guides, from slides, from another AI's course, from a video transcript |
   | Calidad | Factual accuracy (flag, never invent), reading level, accessibility, inclusive language, a check for answers being wrong |
   | Tu página | Tagline, bio, pricing advice in ranges, never a promise of income |

   Use the installed education-agent-skills plugin as reference. Check its license first: copy only if the license allows it, otherwise write our own, citing the research the skill rests on.
4. **Evaluations.**
   - Each skill has at least two golden conversations under `skills/<area>/<name>/evals/`.
   - The eval harness runs them against the cheap tier in CI, nightly rather than on every PR.
   - It fails when a key behaviour regresses: for example, the assistant inventing content the creator didn't give, or asking more than one question at a time.

## §4. Safety

1. **Uploaded files and web pages are data, never instructions.** Strip instruction-like text from what goes into the system prompt and quote it as content. Test with hostile fixtures.
2. **Tool permissions:**
   - The agent has the creator's role and nothing more.
   - It never publishes, changes a price or deletes without the creator's explicit confirmation in that turn, using a confirm button in the chat.
   - Destructive actions are not offered in this STEP.
3. **Budgets.** Per-space monthly budget, with numbers set in config and proposed by you from real costs.
   - When the budget runs low, the assistant says so plainly and keeps the conversation usable. It never fails silently.
   - The creator never sees token counts.
4. **Moderation.** A light content check before publishing: no hateful, sexual or dangerous material in routes. Verify an affordable approach and propose it.

## §5. Where it lives

1. **"Tu asistente" becomes the first card in `/creador`,** and the empty state's main action: "Empezar con tu asistente".
2. **A new invited creator lands in the assistant,** already at step 1, after accepting the invitation.
3. **"Conecta tu asistente" (MCP) stays,** framed as the option for those who already work in Claude.

## §6. Prove it as a real user

The reviewer will repeat these in the browser, so automate them first:
1. **A new invited creator, "Andrés Profe" (fictional, test inbox):**
   1. accepts the invite;
   2. says "quiero mi app de matemáticas";
   3. uploads a sample PDF guide;
   4. gets a plan, changes one thing, builds two modules, previews, fixes one flagged issue, sets a price and publishes;
   5. opens it as a student.

   Measure:
   - the time per step;
   - the number of messages;
   - the model cost for the whole build, which must be under a target you propose;
   - whether any content was invented: there must be none.
2. **The same creator starting from zero** for a short route on fractions.
3. **The same creator uploading a piano creation** in the chat, which lands intact.
4. **Recordings** of all three, at 1440 and 390.

## Report, in one message

- **PRs:** each one, with its screenshots and recordings.
- **Skills:** the list, with each one's eval status.
- **The measurements from §6:** times, message counts, costs, and the invented-content check.
- **Budgets:** the proposals.
- **Departures and questions:** what's left, and the questions for the owner.
