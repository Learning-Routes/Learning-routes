# Design

The tokens in `packages/design-tokens` are the source of truth. The files in `reference/` are the target: they show what the product should look like, and when a screen and a token disagree, a person decides and the token records the answer. Nothing in the app imports from `reference/`.

## The landing

The owner rejected v2's landing. Platform STEP 6 brought back v1's annotated map (STEP 41) on these tokens, and [`moments.md`](moments.md) lists each page's one moment and how to turn it off.

## The direction: v2, the current target

`reference/v2/` is the target, approved by the owner. Platform STEP 4 built the landing, the catalog, the creator's page, the route page, Mis rutas, "Quiero enseñar" and admin from it. The later STEPs build the rest. Sign-in and the tokens still follow the earlier direction, DM Mono included.

- The route line is the hero of every screen.
- Each screen has one primary action.
- Archivo is the only typeface, and there are no monospace labels.
- No all-caps eyebrows, no middle-dot meta strings, no decorative pills, no arrows on buttons.
- Colours keep fixed meanings: gold is "you are here", green is "done", plum is "the action".
- Progress is said in words: "Vas en el tema 3 de 14".

### v2 files

`reference/v2/` holds 21 artboards and `canvas.json`, which places them on the canvas. They are the canvas's source: read them as HTML for structure, copy and styles. They need the canvas runtime (`support.js`, not in this repository), so they don't run on their own. The creator and student names in them are invented.

| Artboards | What they show |
|---|---|
| `Main` | The landing |
| `Entrar`, `Revisa`, `Confirmar`, `Vencido`, `Correo` | Sign-in, and the email with the link |
| `Mapa`, `Leccion`, `Estudio` | A student's route and topic, and editing a route |
| `Superficies`, `FlujoAlumno`, `FlujoCreador` | Where each thing lives, and each person's flow |
| `Catalogo`, `Vitrina`, `Ruta` | The catalogue, a creator's page and a route's page |
| `Sigue`, `Pago`, `MisRutas`, `Ensenar`, `CrearEspacio`, `Operador` | Continuing to the next module, paying, your routes, starting to teach, creating a space, and the operator's screen |

## The earlier direction, kept as history

The route is the image. Modules are tilted cards with some thickness, topics are rings joined by a line that advances with the student, and a gold ring says "you are here". A diamond marks the module's exam, and a dotted branch holds remedial topics. If a screen could belong to any other learning product, it is missing this.

Type does most of the remaining work. Archivo, wide and heavy, carries display text, so a headline can hold a page without decoration. DM Mono carries numbers and labels.

Colour stays narrow: plum (`--color-accent`, `#6A2EA0`) on a cool off-white (`--color-bg`, `#F5F2F6`), with gold only for the student's current position. The dark theme comes from the same tokens.

Words are few, and each one has a job: "Aprende lo que quieras, bien." and "El primer módulo es gratis."

### Earlier files

| File | What it shows |
|---|---|
| `reference/mapa-anotado/index.html` | The landing the shipped one was built from, unchanged: the map as a 3D scale model you travel by scrolling, its text pinned to free spots on the map, and the closing "¿Qué quieres aprender?" form. Its last section, marked "no va en el landing", shows the app's cards in Ciruela in both themes. |
| `reference/screens/1440-light.png` | Light theme at 1440 px, three panels: the route map in green, the same map in plum, and the landing. The plum map is the approved one. |
| `reference/screens/1440-dark.png` | The same three panels in the dark theme. |
| `reference/screens/390-light.png` | The three panels at 390 px, in the light theme. |

## Running the earlier mockup

The page loads `three.min.js` from its own folder. That file stays out of the repository, so fetch it first and check its hash. From `platform/docs/design/reference/mapa-anotado/`:

```sh
curl -fsSo three.min.js https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js
echo "9274bbcec8d96168626c732b5d31c775aa8cfb7eaa0599bec0c175908a2c1ce2  three.min.js" | shasum -a 256 -c
python3 -m http.server 8001
```

Then open `http://localhost:8001`. The page also loads Archivo from Google Fonts, so it needs a connection.

The rest of the storefront can't ship this page's approach: three.js is about 570 KB (143 KB gzip), and only the landing may load it (ADR 0008). Every other storefront page's route is server-rendered SVG.
