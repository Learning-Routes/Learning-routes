// Titles have depth (docs/design/VISION.md, principle 4): the face catches a faint light, and the
// extrusion steps away from the pointer, always downward. The pointer only moves --light-x and
// --light-y, so this CSS is all there is to it and it reads the same with no script.
// test/depth.test.ts keeps depth.css equal to what this makes.

const STEPS = { h1: 7, h2: 3, "desk-h1": 5, "desk-h2": 2 } as const;
/** How far each step reaches, as a share of the title's own size. */
const REACH = { h1: 0.0105, h2: 0.022 } as const;

function shadow(steps: number, reach: number): string {
  const at = (axis: "x" | "y", times: number) =>
    `calc(var(--light-${axis}) * ${(reach * times).toFixed(4)}em)`;
  const face = `${at("x", -0.6)} ${at("y", -0.6)} 0 var(--depth-face)`;
  const extrusion = Array.from({ length: steps }, (_, index) => {
    const step = index + 1;
    const far = steps === 1 ? 0 : Math.round((index / (steps - 1)) * 100);
    const colour = `color-mix(in oklab, var(--depth-near), var(--depth-far) ${far}%)`;
    return `${at("x", step)} ${at("y", step)} 0 ${colour}`;
  });
  const glow = `${at("x", steps * 1.6)} ${at("y", steps * 1.9)} ${(reach * steps * 2.2).toFixed(3)}em var(--depth-glow)`;
  return [face, ...extrusion, glow].join(",\n    ");
}

/** The stylesheet. */
export function depthCss(): string {
  return `/* Made by depth.ts: change it there. */
:root {
  --light-x: 0.59;
  --light-y: 0.81;
}
.depth-1 {
  text-shadow:
    ${shadow(STEPS.h1, REACH.h1)};
}
.depth-2 {
  text-shadow:
    ${shadow(STEPS.h2, REACH.h2)};
}
.desk .depth-1 {
  text-shadow:
    ${shadow(STEPS["desk-h1"], REACH.h1)};
}
.desk .depth-2 {
  text-shadow:
    ${shadow(STEPS["desk-h2"], REACH.h2)};
}
`;
}
