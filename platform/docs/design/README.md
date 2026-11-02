# Design

The tokens in `packages/design-tokens` are the source of truth. The files in `reference/` are the target: they show what the product should look like, and when a screen and a token disagree, a person decides and the token records the answer. Nothing in the app imports from `reference/`.

## The direction

The route is the image. Modules are tilted cards with some thickness, topics are rings joined by a line that advances with the student, and a gold ring says "you are here". A diamond marks the module's exam, and a dotted branch holds remedial topics. If a screen could belong to any other learning product, it is missing this.

Type does most of the remaining work. Archivo, wide and heavy, carries display text, so a headline can hold a page without decoration. DM Mono carries numbers and labels.

Colour stays narrow: plum (`--color-accent`, `#6A2EA0`) on a cool off-white (`--color-bg`, `#F5F2F6`), with gold only for the student's current position. The dark theme comes from the same tokens.

Words are few, and each one has a job: "Aprende lo que quieras, bien." and "El primer módulo es gratis."

## Reference files

| File | What it shows |
|---|---|
| `reference/mapa-anotado/index.html` | The approved landing, unchanged: the map as a 3D scale model you travel by scrolling, its text pinned to free spots on the map, and the closing "¿Qué quieres aprender?" form. Its last section, marked "no va en el landing", shows the app's cards in Ciruela in both themes. |
| `reference/screens/1440-light.png` | Light theme at 1440 px, three panels: the route map in green, the same map in plum, and the landing. The plum map is the approved one. |
| `reference/screens/1440-dark.png` | The same three panels in the dark theme. |
| `reference/screens/390-light.png` | The three panels at 390 px, in the light theme. |

## Running the mockup

The page loads `three.min.js` from its own folder. That file stays out of the repository, so fetch it first and check its hash. From `platform/docs/design/reference/mapa-anotado/`:

```sh
curl -fsSo three.min.js https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js
echo "9274bbcec8d96168626c732b5d31c775aa8cfb7eaa0599bec0c175908a2c1ce2  three.min.js" | shasum -a 256 -c
python3 -m http.server 8001
```

Then open `http://localhost:8001`. The page also loads Archivo from Google Fonts, so it needs a connection.

The storefront can't ship this page's approach: three.js is about 600 KB, and the storefront's budget is 1 KB of JavaScript. Its map is server-rendered SVG with the same composition (Platform STEP 3 §4).
