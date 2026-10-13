// WP-37 — the journey as a map. Pure geometry: NO DOM, no Stimulus, no CSS, so
// every rule below is asserted under node by test/javascript/journey_map_layout_test.rb.
//
// THE TREE. Route → modules (along a spine) → primary steps → reinforcement.
// It is never deeper than that, and every node of a kind has the same size.
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
// left gutter, so no edge passes through a box it does not end at.

export const DEFAULTS = Object.freeze({
  labelWidth: 168,
  labelFontPx: 13,
  labelLineHeight: 18,
  labelLines: 2,
  labelGap: 8,
  rootWidth: 360,
  rootHeight: 76,
  rootGap: 56,
  moduleDiameter: 56,
  stepDiameter: 44,
  reinforcementDiameter: 32,
  cellGap: 24,
  rowGap: 40,
  gutter: 32,
  moduleGap: 72,
  fanGutter: 24,
  fanGap: 16,
  fanRowGap: 20,
  rowSize: 4,
  fanRowSize: 3
});

const isReinforcement = (topic) => topic.reinforcement === true;

// The controller's JSON → the tree. Reinforcement goes under its parent_id when
// that parent is a primary step of the same module; otherwise it is an ORPHAN,
// and the orphans of a module share one anchor cell placed first.
export function buildTree(root, stages) {
  return {
    root: { title: (root && root.title) || "" },
    modules: (stages || []).map((stage, index) => {
      const topics = stage.topics || [];
      const cells = [];
      const byId = new Map();
      for (const topic of topics) {
        if (isReinforcement(topic)) continue;
        // The direction cue: its 1-based place among the module's primary steps.
        const cell = { kind: "step", topic, ordinal: cells.length + 1, children: [] };
        cells.push(cell);
        byId.set(topic.id, cell);
      }
      const orphans = [];
      for (const topic of topics) {
        if (!isReinforcement(topic)) continue;
        const parent = topic.parent_id == null ? null : byId.get(topic.parent_id);
        (parent ? parent.children : orphans).push(topic);
      }
      if (orphans.length) cells.unshift({ kind: "anchor", topic: null, children: orphans });
      return {
        id: `m:${stage.module_id}`,
        moduleId: stage.module_id,
        index,
        stage,
        readable: stage.readable === true,
        cells
      };
    })
  };
}

function nodeSize(kind, o) {
  const d = kind === "module" ? o.moduleDiameter
    : kind === "reinforcement" ? o.reinforcementDiameter
    : o.stepDiameter;
  return { d, w: Math.max(o.labelWidth, d), h: d + o.labelGap + o.labelLines * o.labelLineHeight };
}

function measureCell(cell, o) {
  const step = nodeSize("step", o);
  const kid = nodeSize("reinforcement", o);
  const n = cell.children.length;
  if (n === 0) return { w: step.w, h: step.h, fanW: 0 };
  const cols = Math.min(o.fanRowSize, n);
  const rows = Math.ceil(n / o.fanRowSize);
  const fanW = cols * kid.w + (cols - 1) * o.fanGap;
  return { w: Math.max(step.w, o.fanGutter + fanW), h: step.h + rows * (kid.h + o.fanRowGap), fanW };
}

const edge = (from, to, kind, points, locked) => ({ from: from.id, to: to.id, kind, points, locked });

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function placeCell(measured, left, top, mod, o, out) {
  const step = nodeSize("step", o);
  const kid = nodeSize("reinforcement", o);
  const { cell } = measured;
  const kids = cell.children;
  const fanLeft = left + o.fanGutter;
  // Centred over its fan — Reingold–Tilford's rule — or over its own cell.
  const cx = kids.length ? fanLeft + measured.fanW / 2 : left + measured.w / 2;
  const cy = top + step.d / 2;
  const shared = { moduleId: mod.id, readable: mod.readable, level: mod.stage.level };
  const head = cell.kind === "anchor"
    ? { id: `a:${mod.moduleId}`, kind: "anchor", x: cx, y: cy, w: 0, h: 0, cx, cy, ...shared }
    : { id: `s:${cell.topic.id}`, kind: "step", x: cx - step.w / 2, y: top, w: step.w, h: step.h, cx, cy,
        topic: cell.topic, ordinal: cell.ordinal, ...shared };
  out.nodes.push(head);

  const headBottom = top + step.h;
  const trunkX = left + o.fanGutter / 2;
  const street0 = headBottom + o.fanRowGap / 2;
  kids.forEach((topic, i) => {
    const row = Math.floor(i / o.fanRowSize);
    const col = i % o.fanRowSize;
    const rowTop = headBottom + o.fanRowGap + row * (kid.h + o.fanRowGap);
    const x = fanLeft + col * (kid.w + o.fanGap);
    const child = { id: `s:${topic.id}`, kind: "reinforcement", x, y: rowTop, w: kid.w, h: kid.h,
                    cx: x + kid.w / 2, cy: rowTop + kid.d / 2, topic, ...shared };
    out.nodes.push(child);
    const street = rowTop - o.fanRowGap / 2;
    const points = row === 0
      ? [[cx, cy], [cx, street0], [child.cx, street0], [child.cx, child.cy]]
      : [[cx, cy], [cx, street0], [trunkX, street0], [trunkX, street], [child.cx, street], [child.cx, child.cy]];
    out.edges.push(edge(head, child, "fan", points, !mod.readable));
  });

  out.cells.push({ id: head.id, x: left, y: top, w: measured.w, h: measured.h, children: kids.length });
  return head;
}

// Owner's ruling (CP2): a bad option THROWS. Every option is a finite number,
// and the two row sizes are whole numbers >= 1 — rowSize 0 would loop forever in
// `chunk`, which hangs a browser tab; an exception is the better failure.
function validated(overrides) {
  const o = { ...DEFAULTS, ...overrides };
  for (const [key, value] of Object.entries(o)) {
    if (!Number.isFinite(value)) throw new Error(`journey layout option ${key} must be a finite number, got ${value}`);
  }
  for (const key of ["rowSize", "fanRowSize"]) {
    if (!Number.isInteger(o[key]) || o[key] < 1) throw new Error(`journey layout option ${key} must be an integer >= 1, got ${o[key]}`);
  }
  return o;
}

export function layoutJourney(tree, overrides = {}) {
  const o = validated(overrides);
  const out = { nodes: [], edges: [], cells: [], modules: [] };
  const moduleSize = nodeSize("module", o);
  const step = nodeSize("step", o);
  const spineHalf = Math.max(o.labelWidth, o.moduleDiameter) / 2;
  const rowLeft = spineHalf + o.gutter;

  const root = { id: "root", kind: "root", x: -o.rootWidth / 2, y: 0, w: o.rootWidth, h: o.rootHeight,
                 cx: 0, cy: o.rootHeight / 2 };
  out.nodes.push(root);

  let top = o.rootHeight + o.rootGap;
  let previous = root;
  for (const mod of tree.modules) {
    const moduleNode = { id: mod.id, kind: "module", x: -moduleSize.w / 2, y: top, w: moduleSize.w,
                         h: moduleSize.h, cx: 0, cy: top + moduleSize.d / 2, moduleId: mod.id,
                         stage: mod.stage, readable: mod.readable, level: mod.stage.level };
    out.nodes.push(moduleNode);
    out.edges.push(edge(previous, moduleNode, "spine", [[0, previous.cy], [0, moduleNode.cy]], false));
    previous = moduleNode;

    const measured = mod.cells.map((cell) => ({ cell, ...measureCell(cell, o) }));
    const single = measured.length <= o.rowSize;
    const rows = chunk(measured, o.rowSize);
    const widths = rows.map((row) => row.reduce((sum, c) => sum + c.w, 0) + (row.length - 1) * o.cellGap);
    const blockRight = rowLeft + Math.max(0, ...widths);
    let rowTop = single ? moduleNode.cy - step.d / 2 : moduleNode.y + moduleNode.h + o.rowGap;
    let blockBottom = moduleNode.y + moduleNode.h;
    const placedRows = [];

    rows.forEach((row, r) => {
      const ltr = r % 2 === 0;
      let cursor = ltr ? rowLeft : blockRight;
      const height = Math.max(...row.map((c) => c.h));
      const heads = row.map((c) => {
        const left = ltr ? cursor : cursor - c.w;
        cursor = ltr ? cursor + c.w + o.cellGap : cursor - c.w - o.cellGap;
        return placeCell(c, left, rowTop, mod, o, out);
      });
      placedRows.push({ top: rowTop, bottom: rowTop + height, direction: ltr ? "ltr" : "rtl", heads });
      blockBottom = Math.max(blockBottom, rowTop + height);
      rowTop += height + o.rowGap;
    });

    const locked = !mod.readable;
    const sequence = placedRows.flatMap((row) => row.heads.map((head) => ({ head, row })));
    if (sequence.length) {
      const first = sequence[0].head;
      const points = single
        ? [[0, moduleNode.cy], [first.cx, first.cy]]
        : [[0, moduleNode.cy], [0, first.cy], [first.cx, first.cy]];
      out.edges.push(edge(moduleNode, first, "module", points, locked));
    }
    const leftGutterX = spineHalf + o.gutter / 2;
    const rightGutterX = blockRight + o.gutter / 2;
    for (let i = 0; i + 1 < sequence.length; i++) {
      const a = sequence[i];
      const b = sequence[i + 1];
      let points;
      if (a.row === b.row) {
        points = [[a.head.cx, a.head.cy], [b.head.cx, b.head.cy]];
      } else {
        const gx = a.row.direction === "ltr" ? rightGutterX : leftGutterX;
        points = [[a.head.cx, a.head.cy], [gx, a.head.cy], [gx, b.head.cy], [b.head.cx, b.head.cy]];
      }
      out.edges.push(edge(a.head, b.head, "route", points, locked));
    }

    out.modules.push({
      id: mod.id,
      moduleId: mod.moduleId,
      box: { x: -spineHalf, y: moduleNode.y, w: blockRight + o.gutter + spineHalf, h: blockBottom - moduleNode.y },
      spineHalf,
      gutters: { left: [spineHalf, rowLeft], right: [blockRight, blockRight + o.gutter] },
      rows: placedRows.map((row) => ({ top: row.top, bottom: row.bottom, direction: row.direction,
                                        heads: row.heads.map((h) => h.id) }))
    });
    top = blockBottom + o.moduleGap;
  }

  out.bounds = boundsOf(out);
  return out;
}

function boundsOf({ nodes, edges }) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  const take = (x, y) => {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  };
  for (const n of nodes) { take(n.x, n.y); take(n.x + n.w, n.y + n.h); }
  for (const e of edges) for (const [x, y] of e.points) take(x, y);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
