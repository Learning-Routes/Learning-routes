# Learning Routes: the design vision

Read this before you design or build any screen. FOUNDATIONS says how we build, and the STEPs say what to build. This file says what it should feel like, and why. When a STEP leaves a design choice open, decide it here.

## The one idea

**Learning is a journey you can see.**

Most learning products are a list of videos and a percentage. Learning Routes is a road: someone who knows the way drew it, and you are on it. The person on the route always knows three things at a glance:
- where they are;
- what they have done;
- what comes next.

Everything we design serves that picture. The route line is not decoration and not a logo. It is the product, drawn from real data, on every page that has a route.

## Who it is for

**The student** is a grown-up, or close to one, who chose to learn something and wants to feel it moving. They are not a child to be rewarded with confetti, and they are not a customer to be sold to. Treat them like the best teacher treats a good student: clear, warm, a little playful, always respectful of their time.

**The creator** is someone people already follow because they teach well. Their page must make them look like the best version of themselves, with their name, their colour and their routes. Learning Routes frames them; it never shouts over them.

## The feeling: a trail map at dusk

Picture a mountain trail map seen at dusk, or a metro map lit up at night:
- a deep plum-black ground;
- one luminous line that you follow;
- markers that glow where something matters: gold where you stand, green where you have been;
- everything else falls back into the dark.

The feeling is calm confidence: you are not lost, and the way is lit. That is the brand. It is not "dark mode with purple". When a screen feels like a generic dark SaaS dashboard, it has lost the trail.

## Two registers: the stage and the desk

| | **The stage** | **The desk** |
| --- | --- | --- |
| Where | Public pages: landing, catalog, creator's page, route page | Inside the app: Mis rutas, the map, a lesson, the studio, admin |
| Job | Make someone want to start | Help someone get work done |
| Ground | Night: deep plum-black, the line glowing | Daylight: light, warm-neutral surfaces, the line in ink |
| Type | Large, wide, confident display; few words | Readable, steady, generous line height; long text comfortable |
| Motion | Storytelling: scroll moves the camera, lines draw, places light up | Only when something advances: a topic done, a dot moving, a module unlocked |
| Boldness | One big moment per page | Almost none; the moment is progress itself |

A student goes from the stage (the route page) to the desk (their first topic) in one click. Make that crossing feel like stepping onto the trail: the same line, now in daylight, with them on it.

## Principles

1. **The line is the hero.** Every route has a real shape, from its modules, topics and extra practice. Draw that real shape:
   - in the catalog card;
   - on the route page;
   - in Mis rutas;
   - in the creator's portrait.

   Never draw a fake decorative squiggle. If there's no data, there's no line.
2. **"Estás aquí" is sacred.** Gold means only "you are here". Green means only "done". Plum means only "the action". Nothing else may use those three colours, so that a student learns them once and trusts them everywhere.
3. **Motion means progress or travel.** Things move for two reasons only:
   - you are travelling, by scrolling a story or moving between pages;
   - something advanced, like a topic done or a module opened.

   Never animate just to look alive. No fade-up on every section, and no hover bounce on every card. One orchestrated moment per page beats ten small effects.
4. **Big type, few words.** Archivo is our only family. Its width axis is our voice:
   - wide and heavy for display on the stage;
   - normal width for reading;
   - narrower for dense data on the desk.

   A headline is a design element, so set it with care: tight leading, tracked tight, no single highlighted word.
5. **Depth with restraint.** The landing gets real 3D, because the route is a place you travel through. Elsewhere, depth comes from light, layering and the glow of markers, not from shadows on cards. No glassmorphism and no gradient washes.
6. **The creator's colour, inside our frame.** A creator's brand colour replaces plum on their page's primary actions and their portrait. Gold and green never change: a student moving between creators must still know where they are.
7. **Plain words.** Say what it is and what happens: "Empezar gratis", "Seguir", "Ya envié la invitación". Progress is written in words ("Vas en el tema 3 de 14"), not only as a bar. The glossary in FOUNDATIONS §4b is law.
8. **Fast is part of beautiful.**
   - Text paints first and the motion arrives after.
   - A slow, beautiful page has failed.
   - Every page works with JavaScript off and with reduced motion on.

   Reduced motion gets still frames that tell the same story. It never shows a broken or empty page.

## Each page's moment

**The stage:**

| Page | Its one memorable thing | Why |
| --- | --- | --- |
| Landing | The 3D route you fly along as you scroll, with the story pinned to the map | It shows the whole idea before you read a word |
| Catálogo | Each card's line travels on hover or focus: it draws itself and a gold dot runs it | Every route has its own shape; browsing feels like choosing a road |
| Página del creador | A portrait woven from their routes' lines, in their colour, drawn once | The creator is the sum of the roads they have drawn |
| Página de la ruta | The route draws itself as you scroll, and the station at the middle of the screen lights up | You walk the route before you start it |

**The desk:**

| Page | Its one memorable thing | Why |
| --- | --- | --- |
| Entrar | After sending the link, a dot carries it down the line to an envelope | A tiny delight at a moment of waiting |
| Mis rutas | Real progress in green; the gold dot animates in on the first visit after enrolling | "I'm on it" |
| Lesson (STEP 8) | Finishing a topic moves the gold dot forward one station, the one celebration | Progress is the reward |
| Quiero enseñar | The confirmation draws their request as the first station of a new line | Their road starts here |
| Consent (MCP) | Two ends joined by a line, your assistant and your Learning Routes, with what is allowed written along it | Permission made visible |
| Admin | Nothing. Dense, clear, fast | It's a tool |

## What it must never look like

- **The SaaS kit:** identical rounded cards with the same soft shadow, gradient blobs, glass panels, "trusted by" logo strips.
- **The generic AI page:**
  - a tracked all-caps eyebrow over every heading;
  - "A · B · C" meta strings;
  - arrows glued to button text;
  - a single highlighted word in a headline;
  - monospace for small labels;
  - a purple-to-blue gradient.
- **The childish learning app:** confetti, streak flames, cartoon mascots, badges for nothing.
- **Stock anything:** stock photos, stock illustrations, emoji as icons. Icons come from one consistent set, drawn at the same stroke as the route line.
- **Decoration without data:** a line, number, label or border that doesn't tell the student something.

## Study these for feel, not to copy

- **Massimo Vignelli's 1972 New York subway diagram:** clarity from a strict system of lines and stations.
- **Trail and transit maps at night:** how glow and dark make one path readable.
- **Apple's product pages:** scroll as storytelling, one idea per screen, the text never waiting on the visuals.
- **Linear's app:** what a calm, fast, precise desk feels like.
- **Stripe Press books:** typography treated as craft.
- **Duolingo's path:** what to beat. Theirs is a game for everyone; ours is a road for grown-ups, quieter and more confident.

## The quality bar

Before you open a PR, look at the screen and answer honestly:
1. In two seconds, can a student tell where they are and what to do next?
2. Is there one thing on this page someone would screenshot to show a friend?
3. Does every line, colour and motion carry meaning?
4. Is this unmistakably Learning Routes, or could it be any product with our logo swapped in?
5. Did you take one accessory off? Find the last decoration you added and remove it.
6. Does it hold at 390 px, in light and dark, with reduced motion, with the keyboard, and with JavaScript off?

If the answer to 2 or 4 is no, the page is not done, however correct it is.

## When you're unsure

Choose what makes the route clearer. If two options are equally clear, choose the quieter one, unless it's the page's one moment; there, choose the bolder one. Write the choice and the reason in the PR, so the reviewer and the owner can see your judgement, not only your result.
