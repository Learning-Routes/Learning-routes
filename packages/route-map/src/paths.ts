// WP-37b — what the route map DRAWS, from what the layout PLACES. Pure: no DOM,
// no Stimulus, no CSS. Ported from v1's app/javascript/lib/journey_map_paths.js;
// every rule is asserted in test/paths.test.ts.
//
// THE PICTURE. Each module's route is ONE continuous path: out of the module disc,
// through every head in route order. Within a row it runs on cubics with horizontal
// tangents at every node. Between rows it makes a U-turn of constant radius down
// the gutter the layout reserved. So the line has no corner anywhere, and it never
// passes behind a label.
// The student's progress is a string PREFIX of that path. Chevrons mark the curves
// still ahead. Reinforcement hangs from its head on rounded dotted traces
// (fan-traces.ts). The paths use the grammar path-sampling.ts reads.
import { at } from "./at-index";
import { type FanTraces, nodeOf, pushFan } from "./fan-traces";
import type { Layout, LayoutNode } from "./layout-model";
import type { Tree } from "./route-tree";

export const PATH_DEFAULTS = Object.freeze({
  panelPad: 18, // a module's panel = its layout box inflated by this
  traceRadius: 9, // fan trace corners; keep ≤ fanRowGap / 2 − 1
  tension: 0.55, // cubic control-arm length as a share of dx
});

export type PathOptions = { [K in keyof typeof PATH_DEFAULTS]: number } & {
  gutter: number;
  reinforcementDiameter: number;
  bendRadius: number;
};

type Box = Layout["bounds"];

export interface Paths extends FanTraces {
  panels: { moduleId: string; box: Box; level?: string; locked: boolean }[];
  spine: { moduleId: string; d: string }[];
  spineTravelled: { moduleId: string; d: string; level?: string }[];
  route: { moduleId: string; d: string; level?: string }[];
  routeLocked: { moduleId: string; d: string; level?: string }[];
  travelled: { moduleId: string; d: string; level?: string }[];
  chevrons: { moduleId: string; x: number; y: number; angle: number }[];
  origin: { x: number; y: number };
  current: { nodeId: string; headId: string | null; moduleId?: string } | null;
}

function required(key: string, value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    throw new Error(`route map paths option ${key} must be a finite number, got ${value}`);
  }
  return value;
}

function options(opts: Partial<PathOptions>): PathOptions {
  const merged = { ...PATH_DEFAULTS, ...opts };
  const gutter = required("gutter", merged.gutter);
  const reinforcementDiameter = required("reinforcementDiameter", merged.reinforcementDiameter);
  // A U-turn's radius: half the gutter less 4 px keeps the arc out of the row-end label.
  return {
    ...merged,
    gutter,
    reinforcementDiameter,
    bendRadius: merged.bendRadius ?? gutter / 2 - 4,
  };
}

const inflate = (b: Box, p: number): Box => ({
  x: b.x - p,
  y: b.y - p,
  w: b.w + 2 * p,
  h: b.h + 2 * p,
});

// Horizontal tangents at both ends.
function cubic(a: LayoutNode, b: LayoutNode, k: number): string {
  const dx = b.cx - a.cx;
  return `C ${a.cx + k * dx} ${a.cy} ${b.cx - k * dx} ${b.cy} ${b.cx} ${b.cy}`;
}

// From a row's last head to the next row's first, down the gutter at x = gx.
function uTurn(a: LayoutNode, b: LayoutNode, gx: number, r: number): string {
  const dir = gx > a.cx ? 1 : -1;
  const sweep = dir > 0 ? 1 : 0;
  return (
    `L ${gx - dir * r} ${a.cy} A ${r} ${r} 0 0 ${sweep} ${gx} ${a.cy + r} ` +
    `L ${gx} ${b.cy - r} A ${r} ${r} 0 0 ${sweep} ${gx - dir * r} ${b.cy} L ${b.cx} ${b.cy}`
  );
}

interface Progress {
  curNode: LayoutNode | null;
  headId: string | null;
  curModIndex: number;
}

export function buildPaths(
  layout: Layout,
  tree: Tree,
  currentId: string | number | null | undefined,
  opts: Partial<PathOptions> = {},
): Paths {
  const o = options(opts);
  const byId = new Map(layout.nodes.map((n) => [n.id, n] as const));
  const root = nodeOf(byId, "root");
  const fans = layout.edges.filter((e) => e.kind === "fan");

  const curNode = currentId == null ? null : byId.get(`s:${currentId}`) || null;
  const curFan = curNode && fans.find((e) => e.to === curNode.id);
  const headId = curNode ? (curFan ? curFan.from : curNode.id) : null;
  const curModIndex = curNode ? layout.modules.findIndex((m) => m.id === curNode.moduleId) : -1;

  const out: Paths = {
    panels: [],
    spine: [],
    spineTravelled: [],
    route: [],
    routeLocked: [],
    travelled: [],
    chevrons: [],
    trunk: [],
    branch: [],
    branchOn: [],
    origin: { x: 0, y: root.y + 10 },
    current: curNode ? { nodeId: curNode.id, headId, moduleId: curNode.moduleId } : null,
  };

  let previous = root;
  layout.modules.forEach((m, mi) => {
    const mod = nodeOf(byId, m.id);
    // The spine: from the origin's centre, then from just below each module's label.
    const y0 = previous === root ? root.y + 16 : previous.y + previous.h + 2;
    previous = mod;
    drawModule(out, m, mi, mod, y0, {
      tree,
      byId,
      fans,
      o,
      progress: { curNode, headId, curModIndex },
    });
  });
  return out;
}

interface DrawContext {
  tree: Tree;
  byId: Map<string, LayoutNode>;
  fans: Layout["edges"];
  o: PathOptions;
  progress: Progress;
}

// One module: its spine, its panel, its route (or locked route), what of it is
// travelled, its chevrons and its fans.
function drawModule(
  out: Paths,
  m: LayoutModule,
  mi: number,
  mod: LayoutNode,
  y0: number,
  { tree, byId, fans, o, progress }: DrawContext,
): void {
  const { curNode, headId, curModIndex } = progress;
  const readable = (tree.modules[mi] ?? mod).readable === true;
  const { level } = mod;
  const spine = `M 0 ${y0} L 0 ${mod.y}`;
  out.spine.push({ moduleId: m.id, d: spine });
  if (mi <= curModIndex) {
    out.spineTravelled.push({ moduleId: m.id, d: spine, level });
  }
  out.panels.push({ moduleId: m.id, box: inflate(m.box, o.panelPad), level, locked: !readable });

  const heads = m.rows.flatMap((row) => row.heads.map((id) => ({ node: nodeOf(byId, id), row })));
  const [firstHead] = heads;
  if (!firstHead) {
    return;
  }

  const segs = segments(m, mod, firstHead.node, heads, o);
  const start = `M ${mod.cx} ${mod.cy}`;
  const d = [start, ...segs.map((s) => s.d)].join(" ");

  if (!readable) {
    out.routeLocked.push({ moduleId: m.id, d, level });
    return;
  }
  out.route.push({ moduleId: m.id, d, level });

  const travelled = travelledPath(start, segs, d, mi - curModIndex, headId);
  if (travelled) {
    out.travelled.push({ moduleId: m.id, d: travelled, level });
  }

  const startsAhead = mi > curModIndex;
  pushChevrons(out, m.id, segs, startsAhead, mi === curModIndex ? headId : null, o);
  for (const { node: head } of heads) {
    pushFan(out, head, fans, byId, curNode, o);
  }
}

type LayoutModule = Layout["modules"][number];
type Head = { node: LayoutNode; row: LayoutModule["rows"][number] };
type Segment = { d: string; a: LayoutNode; b: LayoutNode; curve: boolean };

// Segments in route order; `curve` marks a cubic between two heads (a chevron's place).
function segments(
  m: LayoutModule,
  mod: LayoutNode,
  first: LayoutNode,
  heads: Head[],
  o: PathOptions,
): Segment[] {
  const segs: Segment[] = [
    {
      d:
        Math.abs(first.cy - mod.cy) < 0.5
          ? `L ${first.cx} ${first.cy}`
          : cubic(mod, first, o.tension),
      a: mod,
      b: first,
      curve: false,
    },
  ];
  for (let i = 0; i + 1 < heads.length; i++) {
    const a = at(heads, i);
    const b = at(heads, i + 1);
    if (a.row === b.row) {
      segs.push({ d: cubic(a.node, b.node, o.tension), a: a.node, b: b.node, curve: true });
    } else {
      const [g0, g1] = a.row.direction === "ltr" ? m.gutters.right : m.gutters.left;
      const r = Math.min(o.bendRadius, (b.node.cy - a.node.cy) / 2);
      segs.push({
        d: uTurn(a.node, b.node, (g0 + g1) / 2, r),
        a: a.node,
        b: b.node,
        curve: false,
      });
    }
  }
  return segs;
}

// How much of a module's route is travelled: all of it before the current module,
// up to the current head in it, none after (`offset` is module index − current).
function travelledPath(
  start: string,
  segs: Segment[],
  d: string,
  offset: number,
  headId: string | null,
): string | null {
  if (offset < 0) {
    return d;
  }
  if (offset > 0) {
    return null;
  }
  const upTo = segs.findIndex((s) => s.b.id === headId);
  return [start, ...segs.slice(0, upTo + 1).map((s) => s.d)].join(" ");
}

// Chevrons on the curves still ahead. On a cubic with arms k·dx at both ends,
// t = 0.5 is the chord's midpoint and the tangent there is (1 − k)·dx : dy.
// `aheadAfter` is the current head in the current module: curves after it are ahead.
function pushChevrons(
  out: Paths,
  moduleId: string,
  segs: Segment[],
  startsAhead: boolean,
  aheadAfter: string | null,
  o: PathOptions,
): void {
  let ahead = startsAhead;
  for (const s of segs) {
    if (ahead && s.curve) {
      const dx = s.b.cx - s.a.cx;
      const dy = s.b.cy - s.a.cy;
      out.chevrons.push({
        moduleId,
        x: (s.a.cx + s.b.cx) / 2,
        y: (s.a.cy + s.b.cy) / 2,
        angle: (Math.atan2(dy, (1 - o.tension) * dx) * 180) / Math.PI,
      });
    }
    if (aheadAfter !== null && s.b.id === aheadAfter) {
      ahead = true;
    }
  }
}
