# Each page's moment

Each page spends its boldness in one place (Platform STEP 6 §3). All of it hangs on one CSS class, `moment`, on the element below. Take the class off and the moment is gone, so a rejected one costs a one-word change.

| Page | Its moment | `moment` is on | Without it |
|---|---|---|---|
| Landing | The 3D map, travelled by scrolling | the root `div` in `routes/storefront/home.tsx` | The panels stack as text, and three.js never loads |
| Catálogo | A card's line draws and a gold dot runs it; filtering moves the cards | `main` in `storefront/catalog-page.tsx` | Cards stay still, and filtering cross-fades |
| Página del creador | Their routes woven into one figure | the first `main` in `storefront/creator-pages.tsx` | No figure |
| Página de la ruta | The rail draws as you scroll, and the middle station lights up | `.route-page` in `storefront/creator-pages.tsx` | The stations stay as they are |
| Revisa tu correo | The line carries a dot to an envelope | `SentFigure`'s `svg` in `sign-in/flow.tsx` | No figure, and the steps come back |
| Mis rutas | The gold dot arrives once, after enrolling | `main` in `routes/mis-rutas.tsx` | The dot is there from the start |
| Quiero enseñar | The request, as the first station of a new line | `main` in `routes/quiero-ensenar.tsx` | The confirmation message alone |

`e2e/moments.spec.ts` tests the switch, on the catalog and the creator's page.

Admin has no moment: it is a tool.

Three things stay without the class, because they aren't the moment: the page transitions, the sticky "Empezar gratis" card, and Mis rutas' green and gold line.

Every moment is off under `prefers-reduced-motion`, and the landing's stage needs WebGL. The CSS guards each newer feature with `@supports`, and what each browser gets is in the pull request for §3.
