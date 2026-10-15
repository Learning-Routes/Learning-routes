# Palette

Every colour on a page comes from a token in `app/assets/tailwind/application.css`. Each token has
a light value and, where it needs one, a dark value under `html[data-theme="dark"]`. A literal hex
in a view has the same colour in both themes, which is why parts of the dark theme looked wrong.
`test/config/no_literal_colors_in_views_test.rb` fails on a new one.

## Rules
- **Views name tokens, never colours.** Use `var(--color-…)` with no hex fallback: every token has
  a light value, so the fallback never rendered (380 were removed in STEP 38 §3 with no visible
  change). Mailers are the exception, because mail clients do not read CSS variables. The other
  exceptions are the PWA manifest and `<meta name="theme-color">`, which the OS and the browser
  read.
- **Two families, never mixed.** Level accents (`--color-node-nv1/2/3`) say where a student is in a
  route. Semantic colours (positive, warning, risk, and the status, flash and due tokens) say how
  something went. A level colour never means "correct", and a semantic colour never marks a level.
- **One accent per route card, by a rule the student can see.** The accent is the level of the
  stage the student is in (the first step not completed, or the last step once all are). The card
  shows the same NV tag the journey map uses. It used to be picked from the route's id, so two
  identical routes got two colours.
- **SVG drawn from JavaScript reads the token's current value** (`getComputedStyle`), because
  presentation attributes do not resolve `var()`.

## Tokens
Light and dark values are read from `application.css`. "Used in" counts the files that reference
the token, by area; `application.css (1)` includes the definition itself.

### Surfaces, text, accent

| token | light | dark | used in (files) |
|---|---|---|---|
| `--color-bg` | `#F5F1EB` | `#1A1710` | other (3), shell (navbar, footer, layouts) (2), community (2), application.css (1), landing (1), auth (1), journey (1), onboarding/wizard (1), profile (1) |
| `--color-card` | `#FEFDFB` | `#221F18` | lesson (26), other (16), community (11), onboarding/wizard (5), profile (4), exam (3), application.css (1), settings (1) |
| `--color-txt` | `#1C1812` | `#E8E4DC` | lesson (23), other (19), community (15), onboarding/wizard (10), exam (6), shell (navbar, footer, layouts) (5), auth (5), profile (5), application.css (1), journey (1), settings (1) |
| `--color-sub` | `#6D665B` | `#A09889` | lesson (17), other (12), community (10), profile (5), exam (5), onboarding/wizard (5), shell (navbar, footer, layouts) (4), auth (4), application.css (1), settings (1) |
| `--color-muted` | `#887F72` | `#8A8070` | other (19), community (15), lesson (15), shell (navbar, footer, layouts) (6), onboarding/wizard (5), exam (5), profile (4), auth (4), application.css (1), journey (1), settings (1) |
| `--color-faint` | `#B5AD9F` | `#3D3730` | community (16), other (7), shell (navbar, footer, layouts) (4), exam (4), auth (2), application.css (1), profile (1), onboarding/wizard (1) |
| `--color-accent` | `#2C261E` | `#E8E4DC` | community (14), onboarding/wizard (8), other (4), lesson (4), application.css (1), profile (1), settings (1), auth (1) |
| `--color-accent-text` | `#F5F1EB` | `#1A1710` | community (14), onboarding/wizard (6), other (3), application.css (1), profile (1), settings (1) |
| `--color-dark` | `#1C1912` | `same` | application.css (1) |
| `--color-dark-text` | `#E8E4DC` | `same` | application.css (1) |
| `--color-dark-sub` | `#908880` | `same` | unused |
| `--color-dark-muted` | `#605848` | `same` | application.css (1) |
| `--color-link` | `#8B6D28` | `#D4A84B` | auth (3), application.css (1), other (1), settings (1) |
| `--color-card-glass` | `rgba(255, 255, 255, 0.6)` | `rgba(34, 31, 24, 0.75)` | community (1), other (1), profile (1), settings (1) |
| `--color-border-subtle` | `rgba(28, 24, 18, 0.06)` | `rgba(255, 255, 255, 0.06)` | lesson (24), other (17), onboarding/wizard (6), exam (6), profile (5), community (2), landing (2), shell (navbar, footer, layouts) (2), application.css (1), settings (1) |
| `--color-tint` | `rgba(28, 24, 18, 0.04)` | `rgba(255, 255, 255, 0.06)` | other (14), lesson (14), exam (7), community (5), profile (2), application.css (1), onboarding/wizard (1) |
| `--color-tint-strong` | `rgba(28, 24, 18, 0.08)` | `rgba(255, 255, 255, 0.1)` | other (11), lesson (10), exam (7), profile (2), application.css (1), onboarding/wizard (1) |
| `--color-progress-bar` | `#5BA880` | `#5BA880` | application.css (1), other (1), profile (1), shell (navbar, footer, layouts) (1), onboarding/wizard (1) |
| `--color-faint-text` | `#B5AD9F` | `#6A6050` | unused |
| `--color-progress-track` | `rgba(28, 24, 18, 0.06)` | `rgba(255, 255, 255, 0.06)` | shell (navbar, footer, layouts) (1), lesson (1) |
| `--color-tint-hover` | `rgba(28, 24, 18, 0.14)` | `rgba(255, 255, 255, 0.16)` | application.css (1), other (1) |

### Level accents (NV1/NV2/NV3)

| token | light | dark | used in (files) |
|---|---|---|---|
| `--color-node-nv1` | `#2E6B4B` | `#7CC4A0` | profile (2) |
| `--color-node-nv2` | `#2C5F8E` | `#8DB6E0` | unused |
| `--color-node-nv3` | `#5A4C9E` | `#B2A8E6` | unused |

### Semantic (ok / warn / risk / state)

| token | light | dark | used in (files) |
|---|---|---|---|
| `--color-flash-notice-bg` | `rgba(91, 168, 128, 0.1)` | `rgba(91, 168, 128, 0.12)` | shell (navbar, footer, layouts) (3), auth (1), journey (1), onboarding/wizard (1) |
| `--color-flash-notice-border` | `rgba(91, 168, 128, 0.18)` | `rgba(91, 168, 128, 0.25)` | shell (navbar, footer, layouts) (3), auth (1), journey (1), onboarding/wizard (1) |
| `--color-flash-notice-text` | `#3D7A5A` | `#7BC8A0` | shell (navbar, footer, layouts) (3), auth (1), journey (1), onboarding/wizard (1) |
| `--color-flash-alert-bg` | `rgba(176, 96, 80, 0.08)` | `rgba(176, 96, 80, 0.12)` | lesson (4), onboarding/wizard (4), shell (navbar, footer, layouts) (3), auth (3), journey (1), settings (1), exam (1), community (1) |
| `--color-flash-alert-border` | `rgba(176, 96, 80, 0.15)` | `rgba(176, 96, 80, 0.25)` | lesson (4), onboarding/wizard (4), shell (navbar, footer, layouts) (3), auth (3), journey (1), settings (1), exam (1), community (1) |
| `--color-flash-alert-text` | `#B06050` | `#D4887A` | onboarding/wizard (4), lesson (3), shell (navbar, footer, layouts) (3), auth (3), other (2), exam (2), journey (1), settings (1), community (1) |
| `--color-status-active-bg` | `rgba(91, 168, 128, 0.1)` | `rgba(91, 168, 128, 0.15)` | other (1), profile (1) |
| `--color-status-active-text` | `#3D7A5A` | `#7BC8A0` | other (1), profile (1) |
| `--color-status-completed-bg` | `rgba(110, 155, 200, 0.1)` | `rgba(110, 155, 200, 0.15)` | other (1), profile (1) |
| `--color-status-completed-text` | `#4A7A9E` | `#8AB8D8` | other (1), profile (1) |
| `--color-status-paused-bg` | `rgba(176, 152, 72, 0.1)` | `rgba(176, 152, 72, 0.15)` | profile (2), other (1) |
| `--color-status-paused-text` | `#8B6D28` | `#D4B85C` | profile (2), other (1) |
| `--color-step-completed-bg` | `rgba(34, 197, 94, 0.1)` | `rgba(34, 197, 94, 0.15)` | unused |
| `--color-step-completed-icon` | `#16a34a` | `#4ade80` | unused |
| `--color-step-progress-bg` | `rgba(99, 102, 241, 0.1)` | `rgba(99, 102, 241, 0.15)` | unused |
| `--color-step-progress-icon` | `#4F46E5` | `#818cf8` | unused |
| `--color-step-available-bg` | `rgba(28, 24, 18, 0.06)` | `rgba(255, 255, 255, 0.06)` | unused |
| `--color-step-locked-bg` | `rgba(28, 24, 18, 0.03)` | `rgba(255, 255, 255, 0.03)` | unused |
| `--color-step-locked-icon` | `#B5AD9F` | `#3D3730` | unused |
| `--color-due-bg` | `rgba(217, 119, 6, 0.06)` | `rgba(217, 119, 6, 0.1)` | journey (1) |
| `--color-due-border` | `rgba(217, 119, 6, 0.15)` | `rgba(217, 119, 6, 0.2)` | unused |
| `--color-due-heading` | `#92400E` | `#FCD34D` | journey (1) |
| `--color-due-text` | `#B45309` | `#FBBF24` | unused |
| `--color-due-link` | `#D97706` | `#F59E0B` | unused |
| `--color-positive` | `#16A34A` | `#4ADE80` | other (2), exam (2) |
| `--color-positive-bg` | `rgba(22, 163, 74, 0.08)` | `rgba(74, 222, 128, 0.12)` | other (1), exam (1) |
| `--color-positive-border` | `rgba(22, 163, 74, 0.18)` | `rgba(74, 222, 128, 0.22)` | exam (1), other (1) |
| `--color-warning` | `#CA8A04` | `#FACC15` | exam (2), other (2) |
| `--color-warning-bg` | `rgba(202, 138, 4, 0.08)` | `rgba(250, 204, 21, 0.12)` | other (2), exam (1) |
| `--color-warning-border` | `rgba(202, 138, 4, 0.18)` | `rgba(250, 204, 21, 0.22)` | other (2), exam (1) |
| `--color-negative` | `#DC2626` | `#F87171` | other (1), exam (1) |
| `--color-negative-bg` | `rgba(220, 38, 38, 0.08)` | `rgba(248, 113, 113, 0.12)` | other (1), exam (1) |
| `--color-negative-border` | `rgba(220, 38, 38, 0.18)` | `rgba(248, 113, 113, 0.22)` | exam (1) |

### Content-type badges

| token | light | dark | used in (files) |
|---|---|---|---|
| `--color-badge-lesson-bg` | `rgba(59, 130, 246, 0.1)` | `rgba(59, 130, 246, 0.15)` | unused |
| `--color-badge-lesson-text` | `#2563EB` | `#93c5fd` | unused |
| `--color-badge-exercise-bg` | `rgba(16, 185, 129, 0.1)` | `rgba(16, 185, 129, 0.15)` | lesson (1) |
| `--color-badge-exercise-text` | `#059669` | `#6ee7b7` | lesson (1) |
| `--color-badge-assessment-bg` | `rgba(249, 115, 22, 0.1)` | `rgba(249, 115, 22, 0.15)` | unused |
| `--color-badge-assessment-text` | `#D97706` | `#fdba74` | unused |
| `--color-badge-review-bg` | `rgba(139, 92, 246, 0.1)` | `rgba(139, 92, 246, 0.15)` | unused |
| `--color-badge-review-text` | `#7C3AED` | `#c4b5fd` | application.css (1) |

### Other

| token | light | dark | used in (files) |
|---|---|---|---|
| `--color-node-mm` | `#B0A898` | `same` | unused |
| `--color-node-exam` | `#B0A898` | `same` | unused |
| `--color-node-goal` | `#B0A898` | `same` | unused |
| `--color-info` | `#2563EB` | `#60A5FA` | exam (1) |
| `--color-info-bg` | `rgba(37, 99, 235, 0.08)` | `rgba(96, 165, 250, 0.12)` | exam (1) |
| `--color-info-border` | `rgba(37, 99, 235, 0.18)` | `rgba(96, 165, 250, 0.22)` | exam (1) |
| `--color-motion-hi` | `#F2D66B` | `#6B5418` | other (1) |
| `--color-motion-hi2` | `#9AD1F0` | `#2A5F7D` | other (1) |
| `--color-section-audio-active` | `#6366f1` | `#818cf8` | other (1) |

## Waiting for the owner: literal colours still in views
The sweep lets the remaining literals stay until the owner rules on them. The per-file counts are
in `test/config/literal_colors_pending.yml`, and they may only fall. In the table, "same light
value as" means swapping the literal for that token changes nothing in light and themes it in dark.
"none" means a new token or the nearest existing one, which is a visible change either way.

| hex | uses | files | same light value as | token has a dark value |
|---|---|---|---|---|
| `#6366F1` | 33 | 16 | `--color-section-audio-active` | yes |
| `#5BA880` | 26 | 10 | `--color-progress-bar` | yes |
| `#B09848` | 26 | 9 | none | — |
| `#EF4444` | 21 | 11 | none | — |
| `#8B5CF6` | 19 | 11 | none | — |
| `#FFFFFF` | 16 | 13 | none | — |
| `#A855F7` | 15 | 8 | none | — |
| `#10B981` | 14 | 9 | none | — |
| `#F5F1EB` | 13 | 9 | `--color-bg`, `--color-accent-text` | yes |
| `#F87171` | 12 | 4 | none | — |
| `#8B80C4` | 11 | 7 | none | — |
| `#818CF8` | 10 | 6 | none | — |
| `#6E9BC8` | 10 | 7 | none | — |
| `#2C261E` | 8 | 3 | `--color-accent` | yes |
| `#F59E0B` | 8 | 5 | none | — |
| `#059669` | 6 | 5 | `--color-badge-exercise-text` | yes |
| `#B06050` | 6 | 4 | `--color-flash-alert-text` | yes |
| `#6B6B6B` | 5 | 2 | none | — |
| `#D97706` | 3 | 3 | `--color-badge-assessment-text`, `--color-due-link` | yes |
| `#B5718E` | 3 | 2 | none | — |
| `#C084FC` | 2 | 2 | none | — |
| `#2C2C2C` | 2 | 2 | none | — |
| `#16A34A` | 2 | 2 | `--color-step-completed-icon`, `--color-positive` | yes |
| `#60A5FA` | 2 | 2 | none | — |
| `#1C1812` | 2 | 1 | `--color-txt` | yes |
| `#6D665B` | 2 | 1 | `--color-sub` | yes |
| `#887F72` | 2 | 1 | `--color-muted` | yes |
| `#34A853` | 2 | 2 | none | — |
| `#1E1E1E` | 2 | 1 | none | — |
| `#EA4335` | 2 | 2 | none | — |
| `#4285F4` | 2 | 2 | none | — |
| `#FBBC05` | 2 | 2 | none | — |
| `#DC2626` | 1 | 1 | `--color-negative` | yes |
| `#E11D48` | 1 | 1 | none | — |
| `#0891B2` | 1 | 1 | none | — |
| `#3B82F6` | 1 | 1 | none | — |
| `#D4D4D4` | 1 | 1 | none | — |
| `#EC4899` | 1 | 1 | none | — |
| `#A09889` | 1 | 1 | none | — |
| `#8B6D28` | 1 | 1 | `--color-link`, `--color-status-paused-text` | yes |
| `#342E24` | 1 | 1 | none | — |
| `#CCC5B8` | 1 | 1 | none | — |
| `#FDE8E8` | 1 | 1 | none | — |
| `#8B2500` | 1 | 1 | none | — |
| `#E8F5E8` | 1 | 1 | none | — |
| `#EDE8E0` | 1 | 1 | none | — |
| `#F2EEE7` | 1 | 1 | none | — |
| `#7EA5A0` | 1 | 1 | none | — |

distinct: 48, total: 305, with a matching token: 13 (105 uses)
