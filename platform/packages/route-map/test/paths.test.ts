import { expect, test } from "vitest";
import { at } from "../src/at-index";
import { layoutRouteMap } from "../src/layout";
import type { Layout, LayoutNode, XY } from "../src/layout-model";
import { samplePath } from "../src/path-sampling";
import { buildPaths, type Paths } from "../src/paths";
import { buildTree } from "../src/route-tree";
import { SHAPES, type ShapeStage, stage, VIEW } from "./shapes";

const WHITESPACE = /\s+/;

// WP-37b §3. What the map DRAWS is a pure module too: layout → SVG path strings,
// chevrons, panels.
//
// The label boxes, the path grammar, the tangents and the expected counts are all
// computed HERE from the layout's raw boxes. The one thing taken from the module
// under test is `samplePath` (points along a path), and it has its own tests below.
const WAVES = [0, 16];
const K = 0.55;
const EPS = 1e-6;

const KINDS = [
  "spine",
  "spineTravelled",
  "route",
  "routeLocked",
  "travelled",
  "trunk",
  "branch",
  "branchOn",
] as const;
type Kind = (typeof KINDS)[number];

interface Variant {
  currentId: string | null;
  paths: Paths;
  samples: Record<Kind, XY[][]>;
}

interface Run {
  layout: Layout;
  variants: Variant[];
}

interface Command {
  op: string;
  from: XY;
  to: XY;
  in: XY;
  out: XY;
  r?: number;
}

interface LabelBox {
  id: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

// Several currents per shape: none, the first / third / last primary of the first
// readable module, the first reinforcement (an orphan where the shape has one),
// and the first primary of the last readable module when there are several.
function currents(stages: ShapeStage[]): (string | null)[] {
  const readable = stages.filter((s) => s.readable);
  const first = readable[0];
  if (!first) {
    return [null];
  }

  const primaries = first.topics.filter((t) => !t.reinforcement);
  const reinforcement = readable.flatMap((s) => s.topics).find((t) => t.reinforcement);
  const later =
    readable.length > 1
      ? at(readable, readable.length - 1).topics.find((t) => !t.reinforcement)
      : undefined;
  const picked = [
    primaries[0],
    primaries[2],
    primaries[primaries.length - 1],
    reinforcement,
    later,
  ];
  const ids = picked.filter((t) => t !== undefined).map((t) => t.id);
  return [null, ...new Set(ids)];
}

// Ruby's assert_in_delta: |expected − actual| <= delta.
function expectNear(expected: number, actual: number, delta: number, message?: string): void {
  expect(Math.abs(expected - actual), message).toBeLessThanOrEqual(delta);
}

// One computation per (stages, wave, currents): the layout, then for each current
// its paths and the samples of every path kind.
const RUNS = new Map<string, Run>();

function runs(stages: ShapeStage[], wave: number, current = currents(stages)): Run {
  const key = JSON.stringify([stages, wave, current]);
  let run = RUNS.get(key);
  if (!run) {
    run = computeRun(stages, wave, current);
    RUNS.set(key, run);
  }
  return run;
}

function computeRun(stages: ShapeStage[], wave: number, current: (string | null)[]): Run {
  const opts = { ...VIEW, wave };
  const tree = buildTree({ title: "Ruta" }, stages);
  const layout = layoutRouteMap(tree, opts);
  const variants = current.map((currentId) => {
    const paths = buildPaths(layout, tree, currentId, opts);
    const samples = Object.fromEntries(
      KINDS.map((k) => [k, paths[k].map((p) => samplePath(p.d, 3))]),
    ) as Record<Kind, XY[][]>;
    return { currentId, paths, samples };
  });
  return { layout, variants };
}

const indexBy = <T extends { id: string }>(items: T[]): Map<string, T> =>
  new Map(items.map((item) => [item.id, item]));

const nodeOf = (nodes: Map<string, LayoutNode>, id: string): LayoutNode => {
  const node = nodes.get(id);
  if (!node) {
    throw new Error(`no node ${id}`);
  }
  return node;
};

const sameXY = (a: XY, b: XY): boolean => a[0] === b[0] && a[1] === b[1];

// A named shape from shapes.ts; a missing name is a typo in this file.
function shapeNamed(name: string): ShapeStage[] {
  const stages = SHAPES[name];
  if (!stages) {
    throw new Error(`no shape named ${name}`);
  }
  return stages;
}

// Two numbers from a command's operands, as a point.
const pair = (numbers: number[], i: number): XY => [at(numbers, i), at(numbers, i + 1)];

// Brief §3: x ∈ [cx − lw/2, cx + lw/2], y ∈ [cy + d/2 + labelGap − 1, … + lines·lineHeight + 1].
function labelBoxes(run: Run): LabelBox[] {
  const sizes: Partial<Record<LayoutNode["kind"], [number, number]>> = {
    module: [VIEW.moduleLabelWidth, VIEW.moduleDiameter],
    step: [VIEW.labelWidth, VIEW.stepDiameter],
    reinforcement: [VIEW.labelWidth, VIEW.reinforcementDiameter],
  };
  return run.layout.nodes.flatMap((n) => {
    const size = sizes[n.kind];
    if (!size) {
      return [];
    }
    const [lw, d] = size;
    const y0 = n.cy + d / 2.0 + VIEW.labelGap - 1;
    return [
      {
        id: n.id,
        x0: n.cx - lw / 2.0,
        x1: n.cx + lw / 2.0,
        y0,
        y1: y0 + VIEW.labelLines * VIEW.labelLineHeight + 1,
      },
    ];
  });
}

// The head the travelled path must reach: the step itself, or for a
// reinforcement the head its fan hangs from (an orphan's is the anchor).
function expectedHead(run: Run, topicId: string): LayoutNode {
  const nodes = indexBy(run.layout.nodes);
  const fan = run.layout.edges.find((e) => e.kind === "fan" && e.to === `s:${topicId}`);
  return nodeOf(nodes, fan ? fan.from : `s:${topicId}`);
}

// Every C between two heads still ahead (never the swoop out of the module), in
// route order, at the cubic's t = 0.5 with its tangent there.
function expectedChevrons(
  run: Run,
  paths: Paths,
  current: string | null,
): [number, number, number][] {
  const order = run.layout.modules.map((m) => m.id);
  const head = current === null ? null : expectedHead(run, current);
  const curIndex = head ? order.indexOf(head.moduleId as string) : -1;
  return [...paths.route]
    .sort((a, b) => order.indexOf(a.moduleId) - order.indexOf(b.moduleId))
    .flatMap((route) => {
      const index = order.indexOf(route.moduleId);
      if (index < curIndex) {
        return [];
      }

      const cmds = parse(route.d).slice(1); // the M
      let start = 1; // the module → first step segment never carries one
      if (head && index === curIndex) {
        const curPoint: XY = [head.cx, head.cy];
        const at = cmds.findIndex((c) => sameXY(c.to, curPoint));
        if (at < 0) {
          throw new Error(`the route of ${route.moduleId} never reaches its current head`);
        }
        start = at + 1;
      }
      return cmds
        .filter((c, i) => i >= start && c.op === "C")
        .map((c): [number, number, number] => {
          const [ax, ay] = c.from;
          const [bx, by] = c.to;
          return [
            (ax + bx) / 2.0,
            (ay + by) / 2.0,
            (Math.atan2(by - ay, (1 - K) * (bx - ax)) * 180) / Math.PI,
          ];
        });
    });
}

function unit(a: XY, b: XY): XY {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return len === 0 ? [0, 0] : [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
}

function cubicCommand(point: XY, operands: number[]): Command {
  const c1 = pair(operands, 0);
  const c2 = pair(operands, 2);
  const to = pair(operands, 4);
  return {
    op: "C",
    from: point,
    to,
    in: unit(point, sameXY(c1, point) ? c2 : c1),
    out: unit(sameXY(c2, to) ? c1 : c2, to),
  };
}

function arcCommand(point: XY, operands: number[]): Command {
  // r, ry, rotation, large-arc, sweep, x, y
  const r = at(operands, 0);
  const sweep = at(operands, 4);
  const to = pair(operands, 5);
  const [x, y] = to;
  const dx = x - point[0];
  const dy = y - point[1];
  // Quarter circle: S − C = v, E − C = v rotated ±90° by the sweep.
  const v: XY =
    sweep === 1 ? [(dy - dx) / 2.0, -(dx + dy) / 2.0] : [-(dx + dy) / 2.0, (dx - dy) / 2.0];
  const w: XY = [v[0] + dx, v[1] + dy];
  const tangent = (u: XY): XY => (sweep === 1 ? [-u[1] / r, u[0] / r] : [u[1] / r, -u[0] / r]);
  return { op: "A", from: point, to, r, in: tangent(v), out: tangent(w) };
}

// The grammar the module promises (addendum §C): absolute M L C Q A, numbers
// separated by spaces. Each command gets its start, end and the unit tangents
// entering and leaving it.
function parse(d: string): Command[] {
  const tokens = d.split(WHITESPACE).filter((t) => t !== "");
  const cmds: Command[] = [];
  // Before the M there is no point: NaN, as an empty array gave before.
  let point: XY = [Number.NaN, Number.NaN];
  const take = (n: number): number[] =>
    Array.from({ length: n }, () => {
      const token = tokens.shift();
      const value = Number(token);
      if (token === undefined || !Number.isFinite(value)) {
        throw new Error(`bad number ${JSON.stringify(token)} in ${d}`);
      }
      return value;
    });
  while (tokens.length) {
    const op = tokens.shift() as string;
    if (op === "M") {
      const to = pair(take(2), 0);
      cmds.push({ op, from: to, to, in: [0, 0], out: [0, 0] });
    } else if (op === "L") {
      const to = pair(take(2), 0);
      const dir = unit(point, to);
      cmds.push({ op, from: point, to, in: dir, out: dir });
    } else if (op === "C") {
      cmds.push(cubicCommand(point, take(6)));
    } else if (op === "Q") {
      const operands = take(4);
      const c = pair(operands, 0);
      const to = pair(operands, 2);
      cmds.push({ op, from: point, to, in: unit(point, c), out: unit(c, to) });
    } else if (op === "A") {
      cmds.push(arcCommand(point, take(7)));
    } else {
      expect.fail(`unexpected path command ${JSON.stringify(op)} in ${d}`);
    }
    point = at(cmds, cmds.length - 1).to;
  }
  return cmds;
}

const inLabel = (labels: LabelBox[], x: number, y: number): LabelBox | undefined =>
  labels.find((b) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1);

for (const [shape, stages] of Object.entries(SHAPES)) {
  for (const wave of WAVES) {
    const name = `${shape} [wave ${wave}]`;

    // The first variant (no current) is checked whole. Later ones differ only in what
    // is travelled or lit, so only those kinds are re-checked.
    test(`${name}: no drawn line passes through a label`, () => {
      const run = runs(stages, wave);
      run.variants.forEach((variant, v) => {
        const labels = labelBoxes(run);
        const kinds: Kind[] =
          v === 0
            ? ["spine", "route", "routeLocked", "trunk", "branch", "branchOn"]
            : ["spineTravelled", "travelled", "branchOn"];
        for (const kind of kinds) {
          variant.samples[kind].forEach((points, i) => {
            for (const [x, y] of points) {
              const hit = inLabel(labels, x, y);
              expect(
                hit,
                `${kind}[${i}] passes through the label of ${hit?.id} at (${x.toFixed(1)}, ${y.toFixed(1)}) ` +
                  `with current ${JSON.stringify(variant.currentId)}`,
              ).toBeUndefined();
            }
          });
        }
      });
    });

    test(`${name}: each module's route is one continuous path, without a corner`, () => {
      const run = runs(stages, wave);
      const nodes = indexBy(run.layout.nodes);
      const paths = at(run.variants, 0).paths;
      const drawn = [...paths.route, ...paths.routeLocked];
      const withHeads = run.layout.modules.filter((m) => m.rows.length > 0);
      expect(drawn.map((r) => r.moduleId).sort()).toEqual(withHeads.map((m) => m.id).sort());

      for (const route of drawn) {
        const mod = run.layout.modules.find((m) => m.id === route.moduleId);
        if (!mod) {
          throw new Error(`no module ${route.moduleId}`);
        }
        const lastRow = at(mod.rows, mod.rows.length - 1);
        const lastHead = nodeOf(nodes, at(lastRow.heads, lastRow.heads.length - 1));
        const cmds = parse(route.d);
        expect(route.d.split("M").length - 1, "one M per route path").toBe(1);
        const modNode = nodeOf(nodes, mod.id);
        expect(at(cmds, 0).to, "starts at the module's centre").toEqual([modNode.cx, modNode.cy]);
        for (let i = 0; i + 1 < cmds.length; i++) {
          const a = at(cmds, i);
          const b = at(cmds, i + 1);
          if (a.op === "M") {
            continue;
          }

          const corner = `a corner between commands ${i} and ${i + 1} of ${route.moduleId}`;
          expectNear(a.out[0], b.in[0], EPS, corner);
          expectNear(a.out[1], b.in[1], EPS, corner);
        }
        for (const arc of cmds.filter((c) => c.op === "A")) {
          const chord = Math.hypot(arc.to[0] - arc.from[0], arc.to[1] - arc.from[1]);
          expectNear((arc.r as number) * Math.sqrt(2), chord, EPS, "every arc is a quarter circle");
        }
        const end = at(cmds, cmds.length - 1).to;
        expectNear(lastHead.cx, end[0], EPS);
        expectNear(lastHead.cy, end[1], EPS);
      }
    });

    test(`${name}: a U-turn bends with one radius and clears the row end's label`, () => {
      const run = runs(stages, wave);
      const nodes = indexBy(run.layout.nodes);
      const paths = at(run.variants, 0).paths;
      const bend = VIEW.gutter / 2.0 - 4;
      for (const route of [...paths.route, ...paths.routeLocked]) {
        const mod = run.layout.modules.find((m) => m.id === route.moduleId);
        if (!mod) {
          throw new Error(`no module ${route.moduleId}`);
        }
        const arcs = parse(route.d).filter((c) => c.op === "A");
        expect(arcs.length, "two arcs per row-to-row hop").toBe(2 * (mod.rows.length - 1));
        for (let k = 0; 2 * k < arcs.length; k++) {
          const down = at(arcs, 2 * k);
          const up = arcs[2 * k + 1];
          const r = down.r as number;
          expect(down.r, "both arcs of a U-turn share one radius").toBe(up?.r);
          expect(r).toBeLessThanOrEqual(bend + EPS);
          const row = at(mod.rows, k);
          const rowEnd = nodeOf(nodes, at(row.heads, row.heads.length - 1));
          const half = VIEW.labelWidth / 2.0;
          const gx = down.to[0];
          const message = `the bend reaches into ${rowEnd.id}'s label`;
          if (row.direction === "ltr") {
            expect(gx - r, message).toBeGreaterThanOrEqual(rowEnd.cx + half - EPS);
          } else {
            expect(gx + r, message).toBeLessThanOrEqual(rowEnd.cx - half + EPS);
          }
        }
      }
    });

    test(`${name}: the travelled path is a prefix of the route and ends at the current head`, () => {
      const run = runs(stages, wave);
      for (const variant of run.variants) {
        const paths = variant.paths;
        const current = variant.currentId;
        const routes = new Map(paths.route.map((r) => [r.moduleId, r]));
        if (current === null) {
          expect(paths.travelled).toEqual([]);
          expect(paths.spineTravelled).toEqual([]);
          expect(paths.current).toBeNull();
          continue;
        }

        const head = expectedHead(run, current);
        const nodes = indexBy(run.layout.nodes);
        const order = run.layout.modules.map((m) => m.id);
        const curIndex = order.indexOf(head.moduleId as string);
        expect(
          paths.spineTravelled.map((t) => t.moduleId),
          "the spine is travelled up to and including the current module",
        ).toEqual(order.slice(0, curIndex + 1));
        expect(paths.spineTravelled.map((t) => t.d)).toEqual(
          paths.spine.slice(0, curIndex + 1).map((t) => t.d),
        );
        expect(paths.current?.headId).toBe(head.id);
        for (const t of paths.travelled) {
          const route = routes.get(t.moduleId);
          if (!route) {
            throw new Error(`no route for ${t.moduleId}`);
          }
          expect(
            route.d.startsWith(t.d),
            `travelled is not a prefix of ${t.moduleId}'s route`,
          ).toBe(true);
          const index = order.indexOf(t.moduleId);
          expect(index, "nothing after the current module is travelled").toBeLessThanOrEqual(
            curIndex,
          );
          if (index < curIndex) {
            expect(t.d, "an earlier module is travelled whole").toBe(route.d);
          }
        }
        const mine = paths.travelled.find((t) => t.moduleId === head.moduleId);
        expect(mine, "the current module has a travelled path").toBeTruthy();
        const cmds = parse((mine as { d: string }).d);
        const last = at(cmds, cmds.length - 1).to;
        expectNear(nodeOf(nodes, head.id).cx, last[0], EPS);
        expectNear(nodeOf(nodes, head.id).cy, last[1], EPS);
      }
    });

    test(`${name}: a chevron marks each curved segment still ahead, beside every label`, () => {
      const run = runs(stages, wave);
      for (const variant of run.variants) {
        const paths = variant.paths;
        const labels = labelBoxes(run);
        const expected = expectedChevrons(run, paths, variant.currentId);
        expect(
          paths.chevrons.length,
          `chevrons with current ${JSON.stringify(variant.currentId)}`,
        ).toBe(expected.length);
        expected.forEach(([x, y, angle], i) => {
          const chev = at(paths.chevrons, i);
          expectNear(x, chev.x, EPS);
          expectNear(y, chev.y, EPS);
          expectNear(angle, chev.angle, 1e-6);
        });
        for (const c of paths.chevrons) {
          const hit = inLabel(labels, c.x, c.y);
          expect(hit, `a chevron sits in the label of ${hit?.id}`).toBeUndefined();
        }
      }
    });
  }
}

test("a locked module is drawn as a locked track only: no travelled path, no chevrons, no fans", () => {
  const stages = shapeNamed("preview + locked");
  const run = runs(stages, 16);
  const locked = at(run.layout.modules, run.layout.modules.length - 1).id;
  for (const variant of run.variants) {
    const paths = variant.paths;
    expect(paths.routeLocked.map((r) => r.moduleId)).toEqual([locked]);
    expect(paths.route.map((r) => r.moduleId)).not.toContain(locked);
    expect(paths.travelled.map((r) => r.moduleId)).not.toContain(locked);
    expect(paths.chevrons.map((c) => c.moduleId)).not.toContain(locked);
    const lockedHeads = run.layout.nodes.filter((n) => n.moduleId === locked).map((n) => n.id);
    const froms = [...paths.trunk, ...paths.branch, ...paths.branchOn].map((b) => b.from);
    expect(froms.filter((from) => lockedHeads.includes(from))).toEqual([]);
    expect(paths.panels.map((p) => p.locked)).toEqual([false, true]);
  }
});

test("a reinforcement branch is drawn solid when it is completed or current, dotted otherwise", () => {
  const s = stage("m0", { primaries: 7, fans: { 1: 3, 2: 3, 4: 3 } });
  const byId = new Map(s.topics.map((t) => [t.id, t]));
  for (const id of ["m0-p1-r0", "m0-p1-r2"]) {
    const t = byId.get(id);
    if (!t) {
      throw new Error(`no topic ${id}`);
    }
    t.status = "completed";
  }
  const run = runs([s], 16, ["m0-p2-r1"]);
  const paths = at(run.variants, run.variants.length - 1).paths;
  const on = paths.branchOn.map((b) => b.to).sort();
  expect(on).toEqual(["s:m0-p1-r0", "s:m0-p1-r2", "s:m0-p2-r1"]);
  expect(paths.branch.length).toBe(9 - 3);
  expect(paths.current?.headId, "a current reinforcement travels to its parent head").toBe(
    "s:m0-p2",
  );
  expect(paths.trunk.map((t) => t.from)).toEqual(["s:m0-p1", "s:m0-p2", "s:m0-p4"]);
});

test("a current orphan reinforcement travels to its module's anchor", () => {
  const stages = shapeNamed("orphans then fans");
  const run = runs(stages, 16, ["m0-o1"]);
  const paths = at(run.variants, run.variants.length - 1).paths;
  expect(paths.current?.headId).toBe("a:m0");
  expect(paths.branchOn.map((b) => b.to)).toContain("s:m0-o1");
});

test("the origin sits at the top of the spine", () => {
  const run = runs(shapeNamed("7 steps x 2 modules"), 16);
  const paths = at(run.variants, 0).paths;
  const root = run.layout.nodes.find((n) => n.kind === "root") as LayoutNode;
  expect(paths.origin).toEqual({ x: 0, y: root.y + 10 });
  expect(paths.spine.length).toBe(2);
  expect(paths.panels.length).toBe(2);
});

// ── samplePath, the one helper the assertions above lean on ─────────
const round9 = (v: number): number => Math.round(v * 1e9) / 1e9 + 0;

test("samplePath walks a line every `step` px, ends included", () => {
  const points = samplePath("M 0 0 L 9 0", 3);
  expect(points.map(([x, y]) => [round9(x), round9(y)])).toEqual([
    [0, 0],
    [3, 0],
    [6, 0],
    [9, 0],
  ]);
});

test("samplePath walks a quarter arc on its circle", () => {
  // From (0, 0) right-and-down to (10, 10), clockwise: centre (0, 10).
  const points = samplePath("M 0 0 A 10 10 0 0 1 10 10", 1);
  expect(points.length).toBeGreaterThanOrEqual(15);
  for (const [x, y] of points) {
    expectNear(10, Math.hypot(x - 0, y - 10), 1e-9);
  }
  expect(at(points, points.length - 1).map(round9)).toEqual([10, 10]);
  // Counter-clockwise between the same points: centre (10, 0).
  for (const [x, y] of samplePath("M 0 0 A 10 10 0 0 0 10 10", 1)) {
    expectNear(10, Math.hypot(x - 10, y), 1e-9);
  }
});

test("samplePath walks cubics and quadratics end to end", () => {
  const c = samplePath("M 0 0 C 55 0 45 40 100 40", 3);
  expect(c[0]).toEqual([0, 0]);
  expect(at(c, c.length - 1).map(round9)).toEqual([100, 40]);
  const q = samplePath("M 0 0 Q 10 0 10 10", 1);
  expect(at(q, q.length - 1).map(round9)).toEqual([10, 10]);
  for (let i = 0; i + 1 < c.length; i++) {
    const [a, b] = [at(c, i), at(c, i + 1)];
    expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeLessThanOrEqual(3.5);
  }
});

test("samplePath refuses a command it does not know", () => {
  expect(() => samplePath("M 0 0 H 10", 3)).toThrow();
});
