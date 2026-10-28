// WP-37 — a route as a map. Pure geometry: NO DOM, no Stimulus, no CSS, ported
// from v1's app/javascript/lib/journey_map_layout.js; every rule below is asserted in
// test/layout.test.ts.
//
// THE TREE. Route → modules (along a spine) → primary steps → reinforcement
// (route-tree.ts). It is never deeper than that, and every node of a kind has the
// same size.
//
// THE ALGORITHM, NAMED HONESTLY. This implements Reingold–Tilford's RULES — no
// two boxes overlap, a parent is centred over its children, children keep their
// order, identical subtrees are drawn identically — at the tree's real depth. At
// depth 3 with fixed boxes the contour threads of Buchheim's general algorithm
// reduce to subtree widths, so it does not carry them. It is not a general
// tidy-tree; a deeper tree needs that algorithm, not an extra level here.
//
// THE PICTURE. Modules own a reserved SPINE COLUMN (x ≈ 0). Up to `rowSize`
// steps lie in one row BESIDE their module; more wrap into rows BELOW it,
// alternating direction (a snake), so route order reads as one path. Every row
// has a reserved GUTTER at each end, and the hop from one row to the next runs
// down the gutter, never through the fan hanging under the row-end step.
// Reinforcement hangs under its step in a fan of `fanRowSize` columns; its edges
// run along "streets" in the gaps between fan rows and a trunk in the fan's own
// left gutter, so no edge passes through a box it does not end at
// (cell-placement.ts).
import { at } from "./at-index";
import { edge, type MeasuredCell, measureCell, nodeSize, placeCell } from "./cell-placement";
import {
  type Box,
  DEFAULTS,
  type Layout,
  type LayoutNode,
  type LayoutOptions,
  type LayoutParts,
  type XY,
} from "./layout-model";
import type { Tree, TreeModule } from "./route-tree";

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

// Owner's ruling (CP2): a bad option THROWS. Every option is a finite number,
// and the two row sizes are whole numbers >= 1 — rowSize 0 would loop forever in
// `chunk`, which hangs a browser tab; an exception is the better failure.
function validated(overrides: Partial<LayoutOptions>): LayoutOptions {
  const o = { ...DEFAULTS, ...overrides };
  for (const [key, value] of Object.entries(o)) {
    if (!Number.isFinite(value)) {
      throw new Error(`route map layout option ${key} must be a finite number, got ${value}`);
    }
  }
  for (const key of ["rowSize", "fanRowSize"] as const) {
    if (!Number.isInteger(o[key]) || o[key] < 1) {
      throw new Error(`route map layout option ${key} must be an integer >= 1, got ${o[key]}`);
    }
  }
  return o;
}

type PlacedRow = { top: number; bottom: number; direction: "ltr" | "rtl"; heads: LayoutNode[] };

// The module's route: from the module node to its first step, then step to step,
// turning in the gutter on the side the row ends at.
function connectRoute(
  out: LayoutParts,
  moduleNode: LayoutNode,
  placedRows: PlacedRow[],
  single: boolean,
  locked: boolean,
  [leftGutterX, rightGutterX]: [number, number],
): void {
  const sequence = placedRows.flatMap((row) => row.heads.map((head) => ({ head, row })));
  const [firstStep] = sequence;
  if (firstStep) {
    const first = firstStep.head;
    const points: XY[] = single
      ? [
          [0, moduleNode.cy],
          [first.cx, first.cy],
        ]
      : [
          [0, moduleNode.cy],
          [0, first.cy],
          [first.cx, first.cy],
        ];
    out.edges.push(edge(moduleNode, first, "module", points, locked));
  }
  for (let i = 0; i + 1 < sequence.length; i++) {
    const a = at(sequence, i);
    const b = at(sequence, i + 1);
    let points: XY[];
    if (a.row === b.row) {
      points = [
        [a.head.cx, a.head.cy],
        [b.head.cx, b.head.cy],
      ];
    } else {
      const gx = a.row.direction === "ltr" ? rightGutterX : leftGutterX;
      points = [
        [a.head.cx, a.head.cy],
        [gx, a.head.cy],
        [gx, b.head.cy],
        [b.head.cx, b.head.cy],
      ];
    }
    out.edges.push(edge(a.head, b.head, "route", points, locked));
  }
}

// The module node on the spine, joined to the node above it.
function placeModuleNode(
  mod: TreeModule,
  top: number,
  previous: LayoutNode,
  o: LayoutOptions,
  out: LayoutParts,
): LayoutNode {
  const moduleSize = nodeSize("module", o);
  const moduleNode: LayoutNode = {
    id: mod.id,
    kind: "module",
    x: -moduleSize.w / 2,
    y: top,
    w: moduleSize.w,
    h: moduleSize.h,
    cx: 0,
    cy: top + moduleSize.d / 2,
    moduleId: mod.id,
    stage: mod.stage,
    readable: mod.readable,
    level: mod.stage.level,
  };
  out.nodes.push(moduleNode);
  out.edges.push(
    edge(
      previous,
      moduleNode,
      "spine",
      [
        [0, previous.cy],
        [0, moduleNode.cy],
      ],
      false,
    ),
  );
  return moduleNode;
}

interface RowFrame {
  rowLeft: number;
  blockRight: number;
  rowTop: number;
  blockBottom: number;
}

// The module's rows, snaking left to right then right to left; returns the rows
// placed and the bottom of the module's block.
function placeRows(
  rows: MeasuredCell[][],
  frame: RowFrame,
  mod: TreeModule,
  o: LayoutOptions,
  out: LayoutParts,
): { placedRows: PlacedRow[]; blockBottom: number } {
  let { rowTop, blockBottom } = frame;
  const placedRows: PlacedRow[] = [];
  rows.forEach((row, r) => {
    const ltr = r % 2 === 0;
    let cursor = ltr ? frame.rowLeft : frame.blockRight;
    // The row reserves 2·wave more height and odd cells sit 2·wave lower, so the
    // route undulates while every box keeps its reserved space.
    const height = Math.max(...row.map((c) => c.h)) + 2 * o.wave;
    const heads = row.map((c, i) => {
      const left = ltr ? cursor : cursor - c.w;
      cursor = ltr ? cursor + c.w + o.cellGap : cursor - c.w - o.cellGap;
      return placeCell(c, left, rowTop + (i % 2 ? 2 * o.wave : 0), mod, o, out);
    });
    placedRows.push({
      top: rowTop,
      bottom: rowTop + height,
      direction: ltr ? "ltr" : "rtl",
      heads,
    });
    blockBottom = Math.max(blockBottom, rowTop + height);
    rowTop += height + o.rowGap;
  });
  return { placedRows, blockBottom };
}

// One module: its node, its rows of cells, its route, and its summary. Returns
// the module node and the bottom of its block.
function placeModule(
  mod: TreeModule,
  top: number,
  previous: LayoutNode,
  o: LayoutOptions,
  out: LayoutParts,
): { moduleNode: LayoutNode; blockBottom: number } {
  const spineHalf = nodeSize("module", o).w / 2;
  const rowLeft = spineHalf + o.gutter;
  const moduleNode = placeModuleNode(mod, top, previous, o, out);
  const measured = mod.cells.map((cell) => ({ cell, ...measureCell(cell, o) }));
  const single = measured.length <= o.rowSize;
  const rows = chunk(measured, o.rowSize);
  const widths = rows.map(
    (row) => row.reduce((sum, c) => sum + c.w, 0) + (row.length - 1) * o.cellGap,
  );
  const blockRight = rowLeft + Math.max(0, ...widths);
  const rowTop = single
    ? moduleNode.cy - nodeSize("step", o).d / 2
    : moduleNode.y + moduleNode.h + o.rowGap;
  const placed = placeRows(
    rows,
    { rowLeft, blockRight, rowTop, blockBottom: moduleNode.y + moduleNode.h },
    mod,
    o,
    out,
  );
  connectRoute(out, moduleNode, placed.placedRows, single, !mod.readable, [
    spineHalf + o.gutter / 2,
    blockRight + o.gutter / 2,
  ]);
  out.modules.push({
    id: mod.id,
    moduleId: mod.moduleId,
    box: {
      x: -spineHalf,
      y: moduleNode.y,
      w: blockRight + o.gutter + spineHalf,
      h: placed.blockBottom - moduleNode.y,
    },
    spineHalf,
    gutters: { left: [spineHalf, rowLeft], right: [blockRight, blockRight + o.gutter] },
    rows: placed.placedRows.map((row) => ({
      top: row.top,
      bottom: row.bottom,
      direction: row.direction,
      heads: row.heads.map((h) => h.id),
    })),
  });
  return { moduleNode, blockBottom: placed.blockBottom };
}

export function layoutRouteMap(tree: Tree, overrides: Partial<LayoutOptions> = {}): Layout {
  const o = validated(overrides);
  const out: LayoutParts = { nodes: [], edges: [], cells: [], modules: [] };
  const root: LayoutNode = {
    id: "root",
    kind: "root",
    x: o.rootX,
    y: 0,
    w: o.rootWidth,
    h: o.rootHeight,
    cx: o.rootX + o.rootWidth / 2,
    cy: o.rootHeight / 2,
  };
  out.nodes.push(root);

  let top = o.rootHeight + o.rootGap;
  let previous = root;
  for (const mod of tree.modules) {
    const placed = placeModule(mod, top, previous, o, out);
    previous = placed.moduleNode;
    top = placed.blockBottom + o.moduleGap;
  }
  return { ...out, bounds: boundsOf(out) };
}

function boundsOf({ nodes, edges }: LayoutParts): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const take = (x: number, y: number): void => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const n of nodes) {
    take(n.x, n.y);
    take(n.x + n.w, n.y + n.h);
  }
  for (const e of edges) {
    for (const [x, y] of e.points) {
      take(x, y);
    }
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
