import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import {
  buildTree,
  type Layout,
  type LayoutCell,
  type LayoutNode,
  type LayoutOptions,
  layoutRouteMap,
  type XY,
} from "../src/layout";
import { SHAPES, type ShapeStage, stage, VIEW } from "./shapes";

// WP-37 §2. The map's geometry is a pure module, asserted without a browser.
//
// Every assertion is computed HERE from the raw boxes and polylines, never by a
// helper exported from the module under test.
const EPS = 0.5;

const OPTION_SETS: Record<string, Partial<LayoutOptions>> = {
  defaults: {},
  "wave 16": { wave: 16 },
  view: VIEW,
};

// WP-37b §2: with every default the output is WP-37's, BYTE FOR BYTE. SHA-256 of
// JSON.stringify(layoutRouteMap(buildTree({ title: "Ruta" }, stages), {})) as produced
// by b907fea9's module (in the Rails repository). To regenerate (only if WP-37's
// picture itself is meant to change): `git show b907fea9:app/javascript/lib/journey_map_layout.js
// > /tmp/old.mjs` and hash its output over SHAPES the same way `digest` below does.
const WP37_DIGESTS: Record<string, string> = {
  "1 steps x 1 modules": "2b97e43a24b230a9988c289189fa253bf1d147223a4220906ce12dbe61d0661b",
  "1 steps x 2 modules": "89afb3e3ef547f6d289a63e156b32970b1c6a95f904dd89c807bbb52edb54dfd",
  "1 steps x 5 modules": "6496896decc426f2014776f9fac34d10c8306be1ec0b8a419408ce4b5d3f5a3d",
  "7 steps x 1 modules": "9ebc502d89729b7100c57c15e8191f074525e48cbc19cdd52713c34687fb8253",
  "7 steps x 2 modules": "90afb4fe8334df0d93e30883ec23f4c1df4957d09181bc0e5e8e87c14eb55fc6",
  "7 steps x 5 modules": "cc5bec5644dffb19f11645250649ca39916d9777070f8d9e29cbb1c91ed577c5",
  "8 steps x 1 modules": "bee1c16290c395e5ca43f37532c59ae3dc3ccd4bfbb09c589d6fb92003a3802d",
  "8 steps x 2 modules": "48293ba984db87dec7e20434697a9cc068586f3d824a4dd9dd0966431a7fa864",
  "8 steps x 5 modules": "67e135a6f909b606491c0bdf2733e102695be4e758039648d8205bfb3b59538b",
  "20 steps x 1 modules": "0f14a4160a70f79ccc450bf8e2bb724a72022402cca2e8bcd41b2ba94a0c2ba7",
  "20 steps x 2 modules": "cc75c57ad8c73dc2fa5073b0ba80f9a0089ecaa1fa512bb620b6187c37e78038",
  "20 steps x 5 modules": "55b68baed91680d69c6cba2b3abb8aa76b461822bf64c8d6cdaba40810ed585b",
  "43 steps x 1 modules": "469f237c3cf81f425554f7d50b72c23127783b3d3bb8e3a79617dee57b516c8f",
  "43 steps x 2 modules": "b66677f5da2b8a49dfedda1890034f6b1803b83f4ac6e94870f3ccf7657367a5",
  "43 steps x 5 modules": "09ff37861987636df5d4ceba10f19d0eb000884d736d35f4d7c0bb7397d0b916",
  "43 peers": "469f237c3cf81f425554f7d50b72c23127783b3d3bb8e3a79617dee57b516c8f",
  "7 + 36 behind one step": "9625e87b08adf8b0e1f43da325b613dad608efabe724a92bdb60df28cd32e2de",
  "production 7 + 13": "00ef8e0599818ca8ea88d0d158bef68e94d087566888d329491aac97b3161368",
  "orphans then fans": "95949679a6449f3531598be862471ae349b5181d0163df54ba4a8c97f9d3290d",
  "two fans in one row": "b36e88bc21bdbb317078c8fa439b9b1066bdbc7db998b3dd2b7f2e0a6d13359b",
  "fan under an ltr row end": "b26c390e7c321d73e3af5aaa54b1b8548fc3b1c8407e6a9f04c4963c44440028",
  "fan under an rtl row end": "73e8bd594fad9e55da4761c2b8d26f41068603ecebd8103ef3ce2cb8e4e91628",
  "preview + locked": "2737fd5b1652a806da4a66456ff42ed4899e55c023526e167deec0d9df2623f9",
};

// Each (stages, options) pair is laid out once per run: the invariants run
// under three option sets.
const LAYOUTS = new Map<string, Layout>();

function layout(stages: ShapeStage[], overrides: Partial<LayoutOptions> = {}): Layout {
  const key = JSON.stringify([stages, overrides]);
  let result = LAYOUTS.get(key);
  if (!result) {
    result = layoutRouteMap(buildTree({ title: "Ruta" }, stages), overrides);
    LAYOUTS.set(key, result);
  }
  return result;
}

function digest(stages: ShapeStage[]): string {
  const tree = buildTree({ title: "Ruta" }, stages);
  return createHash("sha256")
    .update(JSON.stringify(layoutRouteMap(tree, {})))
    .digest("hex");
}

// Ruby's assert_in_delta: |expected − actual| <= delta.
function expectNear(expected: number, actual: number, delta: number, message?: string): void {
  expect(Math.abs(expected - actual), message).toBeLessThanOrEqual(delta);
}

const indexBy = <T extends { id: string }>(items: T[]): Map<string, T> =>
  new Map(items.map((item) => [item.id, item]));

const solidNodes = (result: Layout): LayoutNode[] => result.nodes.filter((n) => n.w > 0 && n.h > 0);

type Rectish = { x: number; y: number; w: number; h: number };

function intersect(a: Rectish, b: Rectish): boolean {
  return (
    a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS
  );
}

function firstPair<T>(items: T[], match: (a: T, b: T) => boolean): [T, T] | null {
  for (let i = 0; i < items.length; i++) {
    for (const b of items.slice(i + 1)) if (match(items[i], b)) return [items[i], b];
  }
  return null;
}

// Liang–Barsky against the box shrunk by EPS: touching an edge is not a crossing.
function segmentHits(p: XY, q: XY, box: Rectish): boolean {
  const [x0, y0] = p;
  const dx = q[0] - x0;
  const dy = q[1] - y0;
  let t0 = 0.0;
  let t1 = 1.0;
  for (const [pp, qq] of [
    [-dx, x0 - (box.x + EPS)],
    [dx, box.x + box.w - EPS - x0],
    [-dy, y0 - (box.y + EPS)],
    [dy, box.y + box.h - EPS - y0],
  ]) {
    if (pp === 0) {
      if (qq < 0) return false;
    } else {
      const r = qq / pp;
      if (pp < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return false;
    }
  }
  return true;
}

// spine: one per module (root→first, then module→next); per module:
// module→first cell, route edges between consecutive cells, one fan edge per
// reinforcement. Cells = primaries + 1 anchor when orphans exist.
function expectedEdgeCount(stages: ShapeStage[]): number {
  return stages.reduce((sum, s) => {
    const topics = s.topics;
    const reinforcement = topics.filter((t) => t.reinforcement).length;
    const primaries = topics.filter((t) => !t.reinforcement).length;
    const orphans = topics.filter((t) => t.reinforcement && t.parent_id == null).length;
    const cells = primaries + (orphans > 0 ? 1 : 0);
    return sum + 1 + (cells > 0 ? 1 : 0) + Math.max(cells - 1, 0) + reinforcement;
  }, 0);
}

const isStepOrReinforcement = (n: LayoutNode): boolean =>
  n.kind === "step" || n.kind === "reinforcement";

for (const [name, stages] of Object.entries(SHAPES)) {
  test(`${name}: with every default the output is WP-37's, byte for byte`, () => {
    expect(digest(stages)).toBe(WP37_DIGESTS[name]);
  });
}

// ── Per-shape invariants, under every option set ────────────────────
for (const [set, opts] of Object.entries(OPTION_SETS)) {
  for (const [shape, stages] of Object.entries(SHAPES)) {
    const name = `${shape} [${set}]`;

    test(`${name}: no two node boxes intersect`, () => {
      const pair = firstPair(solidNodes(layout(stages, opts)), intersect);
      expect(pair, `nodes ${JSON.stringify(pair?.map((n) => n.id))} overlap`).toBeNull();
    });

    test(`${name}: no two subtree boxes intersect`, () => {
      const pair = firstPair<LayoutCell>(layout(stages, opts).cells, intersect);
      expect(pair, `subtrees ${JSON.stringify(pair?.map((c) => c.id))} overlap`).toBeNull();
    });

    test(`${name}: no edge crosses a node box except its own two endpoints`, () => {
      const result = layout(stages, opts);
      const boxes = solidNodes(result);
      for (const edge of result.edges) {
        for (let i = 0; i + 1 < edge.points.length; i++) {
          const p = edge.points[i];
          const q = edge.points[i + 1];
          const hit = boxes.find(
            (b) => b.id !== edge.from && b.id !== edge.to && segmentHits(p, q, b),
          );
          expect(
            hit,
            `${edge.kind} edge ${edge.from}->${edge.to} crosses ${hit?.id}`,
          ).toBeUndefined();
        }
      }
    });

    test(`${name}: nodes come back in route order`, () => {
      const ids = layout(stages, opts)
        .nodes.filter(isStepOrReinforcement)
        .map((n) => n.id);
      const expected = stages.flatMap((s) => s.topics.map((t) => `s:${t.id}`));
      expect(ids).toEqual(expected);
    });

    // The direction cue: a row read right-to-left still says which way is forward.
    test(`${name}: each primary step carries its 1-based place among its module's primary steps`, () => {
      const ordinals = Object.fromEntries(
        layout(stages, opts)
          .nodes.filter((n) => "ordinal" in n)
          .map((n) => [n.id, n.ordinal]),
      );
      const expected = Object.fromEntries(
        stages.flatMap((s) =>
          s.topics.filter((t) => !t.reinforcement).map((t, i) => [`s:${t.id}`, i + 1]),
        ),
      );
      expect(ordinals).toEqual(expected);
    });

    test(`${name}: one edge per connection, and every endpoint exists`, () => {
      const result = layout(stages, opts);
      const ids = new Set(result.nodes.map((n) => n.id));
      for (const e of result.edges) {
        expect(ids.has(e.from)).toBe(true);
        expect(ids.has(e.to)).toBe(true);
      }
      expect(result.edges.length).toBe(expectedEdgeCount(stages));
    });

    test(`${name}: the spine column and the row gutters hold no step`, () => {
      const result = layout(stages, opts);
      const steps = result.nodes.filter(isStepOrReinforcement);
      for (const mod of result.modules) {
        const half = mod.spineHalf;
        const lanes = [[-half, half], mod.gutters.left, mod.gutters.right];
        // The spine column is every module's; a module's gutters are its own (a
        // wider module below may legitimately put cells at that x).
        for (const node of steps.filter((n) => n.moduleId === mod.id)) {
          for (const [x0, x1] of lanes) {
            const overlapping = node.x < x1 - EPS && x0 < node.x + node.w - EPS;
            expect(overlapping, `${node.id} sits in a reserved lane [${x0}, ${x1}]`).toBe(false);
          }
        }
      }
    });

    // Computed from node boxes only: a hop between rows runs its vertical segment
    // outside the x-range of every step and reinforcement box of its module.
    test(`${name}: a row-to-row hop runs in a gutter, beside every box`, () => {
      const result = layout(stages, opts);
      const nodes = indexBy(result.nodes);
      for (const edge of result.edges.filter((e) => e.kind === "route" && e.points.length > 2)) {
        const x = edge.points[1][0];
        const boxes = result.nodes.filter(
          (n) => n.moduleId === nodes.get(edge.from)?.moduleId && isStepOrReinforcement(n),
        );
        const inside = boxes.find((b) => x > b.x - EPS && x < b.x + b.w + EPS);
        expect(
          inside,
          `hop ${edge.from}->${edge.to} at x=${x} runs through the column of ${inside?.id}`,
        ).toBeUndefined();
      }
    });

    test(`${name}: rows stack below the tallest subtree; modules below the lowest box`, () => {
      const result = layout(stages, opts);
      const cells = indexBy(result.cells);
      const cellBottom = (id: string): number => {
        const cell = cells.get(id) as LayoutCell;
        return cell.y + cell.h;
      };
      for (const mod of result.modules) {
        for (let i = 0; i + 1 < mod.rows.length; i++) {
          const lowest = Math.max(...mod.rows[i].heads.map(cellBottom));
          expect(mod.rows[i + 1].top).toBeGreaterThanOrEqual(lowest - EPS);
        }
      }
      for (let i = 0; i + 1 < result.modules.length; i++) {
        const a = result.modules[i];
        const b = result.modules[i + 1];
        expect(b.box.y).toBeGreaterThanOrEqual(a.box.y + a.box.h - EPS);
      }
    });
  }
}

// ── Rules that need a specific shape ────────────────────────────────
test("four steps lie in one row beside the module; five wrap below it", () => {
  const four = layout([stage("m0", { primaries: 4 })]);
  const mod = four.nodes.find((n) => n.kind === "module") as LayoutNode;
  expect(four.modules[0].rows.length).toBe(1);
  for (const n of four.nodes.filter((n) => n.kind === "step")) expectNear(mod.cy, n.cy, 0.01);

  const five = layout([stage("m0", { primaries: 5 })]);
  const mod5 = five.nodes.find((n) => n.kind === "module") as LayoutNode;
  const rows = five.modules[0].rows;
  expect(rows.length).toBe(2);
  expect(rows[0].top).toBeGreaterThanOrEqual(mod5.y + mod5.h);
});

test("rows alternate direction, so route order reads as one path", () => {
  const result = layout([stage("m0", { primaries: 20 })]);
  const nodes = indexBy(result.nodes);
  result.modules[0].rows.forEach((row, i) => {
    const xs = row.heads.map((id) => (nodes.get(id) as LayoutNode).cx);
    const even = i % 2 === 0;
    expect(row.direction).toBe(even ? "ltr" : "rtl");
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(even ? sorted : sorted.reverse());
  });
});

test("a reinforcement is drawn as a child, not a peer", () => {
  const result = layout([stage("m0", { primaries: 1, fans: { 0: 3 } })]);
  const steps = result.nodes.filter((n) => n.kind === "step");
  const kids = result.nodes.filter((n) => n.kind === "reinforcement");
  expect(steps.length).toBe(1);
  expect(kids.length).toBe(3);
  const fanEdges = result.edges.filter((e) => e.kind === "fan");
  expect(fanEdges.map((e) => e.from)).toEqual([steps[0].id, steps[0].id, steps[0].id]);
  for (const k of kids) expect(k.y).toBeGreaterThan(steps[0].y + steps[0].h);
});

test("a parent is centred over its fan, and identical subtrees are identical", () => {
  const result = layout([stage("m0", { primaries: 4, fans: { 0: 3, 3: 3 } })]);
  const nodes = result.nodes;
  for (const pid of ["m0-p0", "m0-p3"]) {
    const parent = nodes.find((n) => n.id === `s:${pid}`) as LayoutNode;
    const kids = nodes.filter((n) => n.id.startsWith(`s:${pid}-r`));
    const span = [Math.min(...kids.map((k) => k.x)), Math.max(...kids.map((k) => k.x + k.w))];
    expectNear((span[0] + span[1]) / 2.0, parent.cx, 0.01);
  }
  const [a, b] = result.cells.filter((c) => c.children === 3);
  expect([a.w, a.h]).toEqual([b.w, b.h]);
});

test("thirty-six reinforcement steps wrap into a fan, not a line", () => {
  const result = layout(SHAPES["7 + 36 behind one step"]);
  const kids = result.nodes.filter((n) => n.kind === "reinforcement");
  expect(new Set(kids.map((k) => k.x)).size).toBe(3);
  expect(new Set(kids.map((k) => k.y)).size).toBe(12);
});

// Owner's ruling (CP2): a bad option must THROW. A browser hang (rowSize 0
// loops forever in chunk) or a NaN map is worse than an exception.
for (const bad of [
  { rowSize: 0 },
  { fanRowSize: 0 },
  { rowSize: 2.5 },
  { labelWidth: null },
  { gutter: "wide" },
]) {
  test(`a bad option is refused: ${JSON.stringify(bad)}`, () => {
    const tree = buildTree({ title: "R" }, [stage("m0", { primaries: 2 })]);
    expect(
      () => layoutRouteMap(tree, bad as unknown as Partial<LayoutOptions>),
      `${JSON.stringify(bad)} was accepted`,
    ).toThrow();
  });
}

test("a label width is an option, and the box the layout spaces by includes it", () => {
  const wide = layout([stage("m0", { primaries: 2 })], { labelWidth: 240, moduleLabelWidth: 200 });
  expect(wide.nodes.filter((n) => n.kind === "step").every((n) => n.w === 240)).toBe(true);
  expect(wide.nodes.filter((n) => n.kind === "module").map((n) => n.w)).toEqual([200]);
});

// WP-37b §2.2: a module label wider than a step label is RESERVED in the spine
// column, not painted over the gutter.
test("a module label width is reserved in the spine column", () => {
  const stages = [stage("m0", { primaries: 9, fans: { 2: 3 } }), stage("m1", { primaries: 3 })];
  const result = layout(stages, { moduleLabelWidth: 160, labelWidth: 124 });
  for (const mod of result.modules) expect(mod.spineHalf).toBe(80);
  for (const mod of result.nodes.filter((n) => n.kind === "module")) {
    expect(mod.w).toBe(160);
    expect(mod.x).toBe(-80);
  }
  for (const n of result.nodes.filter(isStepOrReinforcement)) {
    expect(n.x, `${n.id} reaches into the spine column`).toBeGreaterThanOrEqual(80 - EPS);
  }
});

// WP-37b §2.1: the route undulates — and every box keeps its reserved space.
for (const [name, stages] of Object.entries(SHAPES)) {
  test(`${name}: wave — consecutive heads in a row differ by 2·wave, and each row grew by 2·wave`, () => {
    const flat = layout(stages, {});
    const wavy = layout(stages, { wave: 16 });
    const flatNodes = indexBy(flat.nodes);
    const wavyNodes = indexBy(wavy.nodes);
    const cy = (nodes: Map<string, LayoutNode>, id: string): number =>
      (nodes.get(id) as LayoutNode).cy;
    flat.modules.forEach((fm, m) => {
      const wm = wavy.modules[m];
      fm.rows.forEach((frow, r) => {
        const wrow = wm.rows[r];
        expectNear(frow.bottom - frow.top + 32, wrow.bottom - wrow.top, 1e-9);
        for (let i = 0; i + 1 < wrow.heads.length; i++) {
          const a = wrow.heads[i];
          const b = wrow.heads[i + 1];
          expectNear(32, Math.abs(cy(wavyNodes, a) - cy(wavyNodes, b)), 1e-9, `${a} -> ${b}`);
        }
        // Even cells sit on the row's top, exactly where wave 0 puts them.
        wrow.heads.forEach((id, i) => {
          if (i % 2 !== 0) return;
          expectNear(cy(flatNodes, id) - frow.top, cy(wavyNodes, id) - wrow.top, 1e-9);
        });
      });
    });
  });
}

// WP-37b §2.3: the title sits beside the spine's origin, not centred on it.
test("rootX places the root's left edge; the spine still starts at x = 0", () => {
  const result = layout([stage("m0", { primaries: 3 })], { rootX: 18, rootWidth: 420 });
  const root = result.nodes.find((n) => n.kind === "root") as LayoutNode;
  expect(root.x).toBe(18);
  expect(root.cx).toBe(18 + 210);
  const spine = result.edges.find((e) => e.kind === "spine");
  expect(spine?.points.map((p) => p[0])).toEqual([0, 0]);
});

// One layout module, not two: the old satellite layout was not carried over, and
// the package is these six modules and nothing else.
const OLD_LAYOUT = "../src/journey_layout";

test("the old satellite layout is gone", async () => {
  await expect(
    import(/* @vite-ignore */ OLD_LAYOUT),
    "v1's old satellite layout came back beside layout.ts",
  ).rejects.toThrow();
  const files = Object.keys(
    import.meta.glob("../src/*.ts", { query: "?raw", import: "default", eager: true }),
  ).sort();
  expect(files).toEqual([
    "../src/camera.ts",
    "../src/card-tilt.ts",
    "../src/landing-placement.ts",
    "../src/layout.ts",
    "../src/paths.ts",
    "../src/terrain.ts",
  ]);
});
