# Palette

Every colour on a page comes from a token in `app/assets/tailwind/application.css`. Each token has
a light value and, where it needs one, a dark value under `html[data-theme="dark"]`. A literal hex
in a view has the same colour in both themes, which is why parts of the dark theme looked wrong.
`test/config/no_literal_colors_in_views_test.rb` fails on any hex in a view (#RGB, #RGBA,
#RRGGBB, #RRGGBBAA).

## Rules
- **Views name tokens, never colours.** Write `var(--color-…)` with no hex fallback. Every token
  has a light value, so a fallback never renders. A tint of a token is
  `color-mix(in srgb, var(--token) N%, transparent)`, never a hex with an alpha suffix glued on.
- **Three exceptions, each a single file:**
  - mailers, because mail clients do not read CSS variables;
  - `shared/_theme_color.html.erb`, the browser bar, which the browser reads (one value per colour
    scheme; it follows the system scheme, not the in-app choice);
  - `core/shared/_google_logo.html.erb`, Google's sign-in mark in Google's colours.

  The PWA manifest is JSON the OS reads and is outside the sweep.
- **Separate families, never mixed.**
  - Level accents (`--color-node-nv1/2/3`) say where a student is in a route.
  - Semantic colours (`positive`, `warning`, `negative`, `info`, plus the status, flash and due
    tokens) say how something went.
  - Highlights (`--color-highlight` gold, `--color-highlight-violet`) decorate: stars, streaks and
    rank in gold; the lesson and exam gradients and the interactive-block tags in violet.

  A level colour never means "correct", and a highlight never means a level or a verdict.
- **One accent per route card, by a rule the student can see.** The accent is the level of the
  stage the student is in, and the card shows the same NV tag the journey map uses.
- **SVG.** Chrome resolves `var()` in SVG presentation attributes (`fill`, `stroke`,
  `stop-color`), and the views rely on it. JavaScript that draws SVG reads the token's current
  value with `getComputedStyle`, so a drawing made in one theme uses that theme's colour.

## What STEP 38 §3 moved (owner's answers, 15 October)
- 13 literals that already had a token's light value were switched to that token. Light is
  unchanged and dark is now themed.
- The other 35 follow the approved mapping:
  - reds → `--color-negative`
  - greens → `--color-positive`
  - amber → `--color-warning`
  - blues → `--color-info`
  - the old card hues → the level tokens (lilac `#8B80C4` → NV3, blue `#6E9BC8` → NV2, teal
    `#7EA5A0` → NV1; rose `#B5718E` has no level of its own and takes NV2)
  - gold → `--color-highlight`
  - violets and the pink block tag → `--color-highlight-violet`
  - white text on a filled button → `--color-accent-text`
  - the code editor → `--color-code-bg` / `--color-code-text`, the same dark editor in both themes
  - small ones: rank silver → `--color-muted`, the landing's empty-star outline → `--color-faint`,
    and the end of the landing CTA's gradient → a 92/8 mix of `--color-accent` and `--color-bg`
- The "content failed / unavailable" pages named two tokens that never existed
  (`--color-text-primary/secondary`). They now use `--color-txt` / `--color-sub`.
- The card route line's shadow is `--color-tint-strong`.
- The journey map's tones are left alone: the new map in `wp37b-cp2` (STEP 38 §4) decides them.

Still literal and outside the sweep: `rgba(…)` tints written by hand next to a token (for example
`rgba(99,102,241,0.08)` behind indigo text), and colours set in JavaScript other than the card
drawing.

## Tokens
Light and dark values are read from `application.css`. "Used in" counts the files that reference
the token with `var()`, by area.

### The owner's answers on contrast (PR #87, 19 October)

Checked against the Ciruela surfaces (text 4.5:1, UI parts 3:1), eleven colours he had not named
fell short in light. He took a same-hue proposal for each, light theme only: badge-assessment-text,
badge-exercise-text, due-link, positive, warning, negative, flash-alert-text, section-audio-active,
status-completed-text, status-paused-text and step-completed-icon (the last a UI part, 3:1).
`--color-reinforce` light is `#127C76` (5.04:1 on card, 4.54:1 on bg). All of them, and the dark
values, are held on card and bg by `test/config/token_contrast_test.rb`.

`--color-highlight` stays `#E79A0F` (2.33:1 on card in light): it always sits next to its words
(Estás aquí, the streak count), so colour is never the only cue. That is why the contrast test
leaves it out.

### Ciruela additions (STEP 41 §1.1)

| token | light | dark | use |
|---|---|---|---|
| `--color-accent-hover` | `#57248A` | `#CAA4F5` | primary button hover |
| `--color-accent-soft` | `#F0E5F8` | `#33224A` | level tag, selected row |
| `--color-signal-text` | `#9A6200` | `#F8C66B` | text in the signal colour |
| `--color-reinforce` | `#127C76` | `#46C2B6` | reinforcement (the map's dotted fan) |
| `--color-bg-2` | `#ECE6EF` | `#1C1325` | second surface, hover fills |
| `--color-edge` | `#DED3E3` | `#1C1325` | a card's thickness |
| `--color-shade` | `rgba(29, 18, 38, 0.18)` | `rgba(0, 0, 0, 0.55)` | card and button shadows |
| `--color-hi` | `rgba(255, 255, 255, 0.9)` | `rgba(255, 255, 255, 0.07)` | the lit top edge |

### Surfaces, text, accent

| token | light | dark | used in (files) |
|---|---|---|---|
| `--color-bg` | `#F5F2F6` | `#150E1C` | other (3), landing (2), shell (navbar, footer, layouts) (2), auth (2), community (2), application.css (1), journey (1), onboarding/wizard (1), profile (1) |
| `--color-card` | `#FFFFFF` | `#241931` | lesson (26), other (14), community (10), onboarding/wizard (5), profile (3), exam (3), application.css (1), settings (1), auth (1) |
| `--color-txt` | `#1D1226` | `#F2ECF6` | lesson (25), other (19), community (15), onboarding/wizard (10), auth (6), exam (6), shell (navbar, footer, layouts) (5), profile (5), application.css (1), journey (1), settings (1) |
| `--color-sub` | `#4A3D54` | `#CDBFD8` | lesson (19), other (12), community (10), profile (5), exam (5), auth (5), onboarding/wizard (5), shell (navbar, footer, layouts) (4), application.css (1), settings (1) |
| `--color-muted` | `#73667C` | `#9C8BAA` | other (19), community (16), lesson (16), shell (navbar, footer, layouts) (6), onboarding/wizard (5), exam (5), profile (4), auth (4), application.css (1), journey (1), settings (1) |
| `--color-faint` | `#D1C5D7` | `#44344F` | community (16), other (7), shell (navbar, footer, layouts) (4), exam (4), auth (2), application.css (1), landing (1), profile (1), onboarding/wizard (1) |
| `--color-accent` | `#6A2EA0` | `#B98AF0` | community (14), onboarding/wizard (8), other (4), lesson (4), auth (2), application.css (1), landing (1), profile (1), settings (1), shell (navbar, footer, layouts) (1) |
| `--color-accent-text` | `#FFFFFF` | `#150E1C` | community (14), onboarding/wizard (7), lesson (7), other (6), application.css (1), landing (1), shell (navbar, footer, layouts) (1), profile (1), settings (1), auth (1) |
| `--color-dark` | `#1C1912` | `same` | unused |
| `--color-dark-text` | `#E8E4DC` | `same` | application.css (1) |
| `--color-dark-sub` | `#908880` | `same` | unused |
| `--color-dark-muted` | `#605848` | `same` | application.css (1) |
| `--color-link` | `#57248A` | `#CAA4F5` | auth (3), application.css (1), community (1), other (1), settings (1) |
| `--color-card-glass` | `rgba(255, 255, 255, 0.6)` | `rgba(34, 31, 24, 0.75)` | community (1), other (1), profile (1), settings (1) |
| `--color-border-subtle` | `#E4DCE8` | `#33263F` | lesson (24), other (17), onboarding/wizard (6), exam (6), profile (5), community (2), landing (2), shell (navbar, footer, layouts) (2), application.css (1), settings (1) |
| `--color-tint` | `rgba(28, 24, 18, 0.04)` | `rgba(255, 255, 255, 0.06)` | other (13), lesson (9), community (5), profile (2), application.css (1), exam (1) |
| `--color-tint-strong` | `rgba(28, 24, 18, 0.08)` | `rgba(255, 255, 255, 0.1)` | other (11), lesson (10), exam (7), profile (3), application.css (1), onboarding/wizard (1) |
| `--color-progress-bar` | `#6A2EA0` | `#B98AF0` | profile (3), onboarding/wizard (3), shell (navbar, footer, layouts) (3), community (2), application.css (1), other (1), landing (1) |
| `--color-faint-text` | `#B5AD9F` | `#6A6050` | unused |
| `--color-progress-track` | `#ECE6EF` | `#1C1325` | shell (navbar, footer, layouts) (1), lesson (1) |
| `--color-tint-hover` | `rgba(28, 24, 18, 0.14)` | `rgba(255, 255, 255, 0.16)` | application.css (1), other (1) |

### Level accents (NV1/NV2/NV3)

| token | light | dark | used in (files) |
|---|---|---|---|
| `--color-node-nv1` | `#2E6B4B` | `#7CC4A0` | profile (3) |
| `--color-node-nv2` | `#2C5F8E` | `#8DB6E0` | profile (3), community (1), landing (1), onboarding/wizard (1), shell (navbar, footer, layouts) (1), lesson (1) |
| `--color-node-nv3` | `#5A4C9E` | `#B2A8E6` | profile (3), community (1), landing (1), onboarding/wizard (1), shell (navbar, footer, layouts) (1) |

### Semantic (ok / warn / risk / state)

| token | light | dark | used in (files) |
|---|---|---|---|
| `--color-flash-notice-bg` | `rgba(91, 168, 128, 0.1)` | `rgba(91, 168, 128, 0.12)` | shell (navbar, footer, layouts) (3), auth (1), journey (1), onboarding/wizard (1) |
| `--color-flash-notice-border` | `rgba(91, 168, 128, 0.18)` | `rgba(91, 168, 128, 0.25)` | shell (navbar, footer, layouts) (3), auth (1), journey (1), onboarding/wizard (1) |
| `--color-flash-notice-text` | `#3D7A5A` | `#7BC8A0` | shell (navbar, footer, layouts) (3), auth (1), journey (1), onboarding/wizard (1) |
| `--color-flash-alert-bg` | `rgba(176, 96, 80, 0.08)` | `rgba(176, 96, 80, 0.12)` | lesson (4), onboarding/wizard (4), shell (navbar, footer, layouts) (3), auth (3), journey (1), settings (1), exam (1), community (1) |
| `--color-flash-alert-border` | `rgba(176, 96, 80, 0.15)` | `rgba(176, 96, 80, 0.25)` | lesson (4), onboarding/wizard (4), shell (navbar, footer, layouts) (3), auth (3), journey (1), settings (1), exam (1), community (1) |
| `--color-flash-alert-text` | `#A65A4B` | `#D4887A` | onboarding/wizard (6), lesson (3), shell (navbar, footer, layouts) (3), auth (3), other (2), profile (2), exam (2), journey (1), settings (1), community (1) |
| `--color-status-active-bg` | `rgba(91, 168, 128, 0.1)` | `rgba(91, 168, 128, 0.15)` | other (1), profile (1) |
| `--color-status-active-text` | `#3D7A5A` | `#7BC8A0` | other (1), profile (1) |
| `--color-status-completed-bg` | `rgba(110, 155, 200, 0.1)` | `rgba(110, 155, 200, 0.15)` | other (1), profile (1) |
| `--color-status-completed-text` | `#467395` | `#8AB8D8` | other (1), profile (1) |
| `--color-status-paused-bg` | `rgba(176, 152, 72, 0.1)` | `rgba(176, 152, 72, 0.15)` | profile (2), other (1) |
| `--color-status-paused-text` | `#876A27` | `#D4B85C` | profile (2), other (1) |
| `--color-step-completed-bg` | `rgba(34, 197, 94, 0.1)` | `rgba(34, 197, 94, 0.15)` | unused |
| `--color-step-completed-icon` | `#16A149` | `#4ade80` | unused |
| `--color-step-progress-bg` | `rgba(99, 102, 241, 0.1)` | `rgba(99, 102, 241, 0.15)` | unused |
| `--color-step-progress-icon` | `#4F46E5` | `#818cf8` | unused |
| `--color-step-available-bg` | `rgba(28, 24, 18, 0.06)` | `rgba(255, 255, 255, 0.06)` | unused |
| `--color-step-locked-bg` | `rgba(28, 24, 18, 0.03)` | `rgba(255, 255, 255, 0.03)` | unused |
| `--color-step-locked-icon` | `#B5AD9F` | `#3D3730` | unused |
| `--color-due-bg` | `rgba(217, 119, 6, 0.06)` | `rgba(217, 119, 6, 0.1)` | journey (1) |
| `--color-due-border` | `rgba(217, 119, 6, 0.15)` | `rgba(217, 119, 6, 0.2)` | unused |
| `--color-due-heading` | `#92400E` | `#FCD34D` | journey (1) |
| `--color-due-text` | `#B45309` | `#FBBF24` | unused |
| `--color-due-link` | `#A75C05` | `#F59E0B` | unused |
| `--color-positive` | `#117F3A` | `#4ADE80` | lesson (9), other (2), exam (2), community (1) |
| `--color-positive-bg` | `rgba(22, 163, 74, 0.08)` | `rgba(74, 222, 128, 0.12)` | other (1), exam (1), auth (1) |
| `--color-positive-border` | `rgba(22, 163, 74, 0.18)` | `rgba(74, 222, 128, 0.22)` | exam (1), other (1) |
| `--color-warning` | `#956603` | `#FACC15` | lesson (4), exam (2), other (2), shell (navbar, footer, layouts) (1) |
| `--color-warning-bg` | `rgba(202, 138, 4, 0.08)` | `rgba(250, 204, 21, 0.12)` | other (2), exam (1) |
| `--color-warning-border` | `rgba(202, 138, 4, 0.18)` | `rgba(250, 204, 21, 0.22)` | other (2), exam (1) |
| `--color-negative` | `#D52222` | `#F87171` | lesson (8), other (4), exam (3), community (2), auth (1) |
| `--color-negative-bg` | `rgba(220, 38, 38, 0.08)` | `rgba(248, 113, 113, 0.12)` | other (1), exam (1), auth (1) |
| `--color-negative-border` | `rgba(220, 38, 38, 0.18)` | `rgba(248, 113, 113, 0.22)` | exam (1) |
| `--color-info` | `#2563EB` | `#60A5FA` | community (2), lesson (2), exam (1) |
| `--color-info-bg` | `rgba(37, 99, 235, 0.08)` | `rgba(96, 165, 250, 0.12)` | exam (1) |
| `--color-info-border` | `rgba(37, 99, 235, 0.18)` | `rgba(96, 165, 250, 0.22)` | exam (1) |

### Highlights

| token | light | dark | used in (files) |
|---|---|---|---|
| `--color-highlight` | `#E79A0F` | `#F5B23C` | profile (3), community (2), landing (2), other (1), shell (navbar, footer, layouts) (1) |
| `--color-highlight-violet` | `#8B5CF6` | `#A78BFA` | lesson (13), other (7), exam (4), shell (navbar, footer, layouts) (1) |

### Content-type badges

| token | light | dark | used in (files) |
|---|---|---|---|
| `--color-badge-lesson-bg` | `rgba(59, 130, 246, 0.1)` | `rgba(59, 130, 246, 0.15)` | unused |
| `--color-badge-lesson-text` | `#2563EB` | `#93c5fd` | unused |
| `--color-badge-exercise-bg` | `rgba(16, 185, 129, 0.1)` | `rgba(16, 185, 129, 0.15)` | lesson (1) |
| `--color-badge-exercise-text` | `#047D58` | `#6ee7b7` | lesson (5), other (1) |
| `--color-badge-assessment-bg` | `rgba(249, 115, 22, 0.1)` | `rgba(249, 115, 22, 0.15)` | unused |
| `--color-badge-assessment-text` | `#A75C05` | `#fdba74` | lesson (2), other (1) |
| `--color-badge-review-bg` | `rgba(139, 92, 246, 0.1)` | `rgba(139, 92, 246, 0.15)` | unused |
| `--color-badge-review-text` | `#7C3AED` | `#c4b5fd` | application.css (1) |

### Code editor

| token | light | dark | used in (files) |
|---|---|---|---|
| `--color-code-bg` | `#1E1E1E` | `same` | lesson (1) |
| `--color-code-text` | `#D4D4D4` | `same` | lesson (1) |

### Other

| token | light | dark | used in (files) |
|---|---|---|---|
| `--color-node-mm` | `#B0A898` | `same` | unused |
| `--color-node-exam` | `#B0A898` | `same` | unused |
| `--color-node-goal` | `#B0A898` | `same` | unused |
| `--color-motion-hi` | `#F2D66B` | `#6B5418` | other (1) |
| `--color-motion-hi2` | `#9AD1F0` | `#2A5F7D` | other (1) |
| `--color-section-audio-active` | `#575BF0` | `#818cf8` | lesson (9), other (6), shell (navbar, footer, layouts) (1), exam (1) |
