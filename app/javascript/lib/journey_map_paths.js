// WP-37b — what the journey map DRAWS, from what the layout PLACES. Pure: no DOM,
// no Stimulus, no CSS, so every rule is asserted under node by
// test/javascript/journey_map_paths_test.rb.
//
// THE PICTURE. Each module's route is ONE continuous path: out of the module disc,
// through every head in route order. Within a row it runs on cubics with horizontal
// tangents at every node. Between rows it makes a U-turn of constant radius down
// the gutter the layout reserved. So the line has no corner anywhere, and it never
// passes behind a label.
// The student's progress is a string PREFIX of that path. Chevrons mark the curves
// still ahead. Reinforcement hangs from its head on rounded dotted traces that
// follow the layout's own fan streets.
//
// It imports nothing: importmap's digested assets do not resolve relative imports,
// so the layout options it needs come in `opts`.
//
// GRAMMAR. Absolute M L C Q A only, numbers separated by single spaces, one M per
// path. samplePath reads exactly this grammar and throws on anything else.

export const PATH_DEFAULTS = Object.freeze({
  panelPad: 18,   // a module's panel = its layout box inflated by this
  traceRadius: 9, // fan trace corners; keep ≤ fanRowGap / 2 − 1
  tension: 0.55   // cubic control-arm length as a share of dx
});

const REQUIRED = ["gutter", "reinforcementDiameter"];

function options(opts) {
  const o = { ...PATH_DEFAULTS, ...opts };
  for (const key of REQUIRED) {
    if (!Number.isFinite(o[key])) throw new Error(`journey paths option ${key} must be a finite number, got ${o[key]}`);
  }
  // A U-turn's radius: half the gutter less 4 px keeps the arc out of the row-end label.
  if (o.bendRadius == null) o.bendRadius = o.gutter / 2 - 4;
  return o;
}

const inflate = (b, p) => ({ x: b.x - p, y: b.y - p, w: b.w + 2 * p, h: b.h + 2 * p });

// Horizontal tangents at both ends.
function cubic(a, b, k) {
  const dx = b.cx - a.cx;
  return `C ${a.cx + k * dx} ${a.cy} ${b.cx - k * dx} ${b.cy} ${b.cx} ${b.cy}`;
}

// From a row's last head to the next row's first, down the gutter at x = gx.
function uTurn(a, b, gx, r) {
  const dir = gx > a.cx ? 1 : -1;
  const sweep = dir > 0 ? 1 : 0;
  return `L ${gx - dir * r} ${a.cy} A ${r} ${r} 0 0 ${sweep} ${gx} ${a.cy + r} ` +
    `L ${gx} ${b.cy - r} A ${r} ${r} 0 0 ${sweep} ${gx - dir * r} ${b.cy} L ${b.cx} ${b.cy}`;
}

// An orthogonal polyline as a trace with quadratic corners of radius ≤ r.
function rounded(points, r) {
  const p = points.filter((q, i) => i === 0 || Math.hypot(q[0] - points[i - 1][0], q[1] - points[i - 1][1]) > 0.01);
  let d = `M ${p[0][0]} ${p[0][1]}`;
  for (let i = 1; i < p.length - 1; i++) {
    const [ax, ay] = p[i - 1];
    const [bx, by] = p[i];
    const [cx, cy] = p[i + 1];
    const l1 = Math.hypot(bx - ax, by - ay);
    const l2 = Math.hypot(cx - bx, cy - by);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    d += ` L ${bx - (bx - ax) / l1 * rr} ${by - (by - ay) / l1 * rr} Q ${bx} ${by} ${bx + (cx - bx) / l2 * rr} ${by + (cy - by) / l2 * rr}`;
  }
  const last = p[p.length - 1];
  return `${d} L ${last[0]} ${last[1]}`;
}

export function buildPaths(layout, tree, currentId, opts = {}) {
  const o = options(opts);
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const root = byId.get("root");
  const fans = layout.edges.filter((e) => e.kind === "fan");

  const curNode = currentId == null ? null : byId.get(`s:${currentId}`) || null;
  const curFan = curNode && fans.find((e) => e.to === curNode.id);
  const headId = curNode ? (curFan ? curFan.from : curNode.id) : null;
  const curModIndex = curNode ? layout.modules.findIndex((m) => m.id === curNode.moduleId) : -1;

  const out = {
    panels: [], spine: [], spineTravelled: [], route: [], routeLocked: [], travelled: [],
    chevrons: [], trunk: [], branch: [], branchOn: [],
    origin: { x: 0, y: root.y + 10 },
    current: curNode ? { nodeId: curNode.id, headId, moduleId: curNode.moduleId } : null
  };

  let previous = root;
  layout.modules.forEach((m, mi) => {
    const mod = byId.get(m.id);
    const readable = tree.modules[mi] ? tree.modules[mi].readable === true : mod.readable === true;
    const { level } = mod;

    // The spine: from the origin's centre, then from just below each module's label.
    const y0 = previous === root ? root.y + 16 : previous.y + previous.h + 2;
    const spine = `M 0 ${y0} L 0 ${mod.y}`;
    out.spine.push({ moduleId: m.id, d: spine });
    if (mi <= curModIndex) out.spineTravelled.push({ moduleId: m.id, d: spine, level });
    previous = mod;
    out.panels.push({ moduleId: m.id, box: inflate(m.box, o.panelPad), level, locked: !readable });

    const heads = m.rows.flatMap((row) => row.heads.map((id) => ({ node: byId.get(id), row })));
    if (!heads.length) return;

    // Segments in route order; `curve` marks a cubic between two heads (a chevron's place).
    const first = heads[0].node;
    const segs = [{
      d: Math.abs(first.cy - mod.cy) < 0.5 ? `L ${first.cx} ${first.cy}` : cubic(mod, first, o.tension),
      a: mod, b: first, curve: false
    }];
    for (let i = 0; i + 1 < heads.length; i++) {
      const a = heads[i];
      const b = heads[i + 1];
      if (a.row === b.row) {
        segs.push({ d: cubic(a.node, b.node, o.tension), a: a.node, b: b.node, curve: true });
      } else {
        const [g0, g1] = a.row.direction === "ltr" ? m.gutters.right : m.gutters.left;
        const r = Math.min(o.bendRadius, (b.node.cy - a.node.cy) / 2);
        segs.push({ d: uTurn(a.node, b.node, (g0 + g1) / 2, r), a: a.node, b: b.node, curve: false });
      }
    }
    const start = `M ${mod.cx} ${mod.cy}`;
    const d = [start, ...segs.map((s) => s.d)].join(" ");

    if (!readable) {
      out.routeLocked.push({ moduleId: m.id, d, level });
      return;
    }
    out.route.push({ moduleId: m.id, d, level });

    if (mi < curModIndex) out.travelled.push({ moduleId: m.id, d, level });
    if (mi === curModIndex) {
      const upTo = segs.findIndex((s) => s.b.id === headId);
      out.travelled.push({ moduleId: m.id, d: [start, ...segs.slice(0, upTo + 1).map((s) => s.d)].join(" "), level });
    }

    // Chevrons on the curves still ahead. On a cubic with arms k·dx at both ends,
    // t = 0.5 is the chord's midpoint and the tangent there is (1 − k)·dx : dy.
    let ahead = mi > curModIndex;
    for (const s of segs) {
      if (ahead && s.curve) {
        const dx = s.b.cx - s.a.cx;
        const dy = s.b.cy - s.a.cy;
        out.chevrons.push({ moduleId: m.id, x: (s.a.cx + s.b.cx) / 2, y: (s.a.cy + s.b.cy) / 2,
                            angle: Math.atan2(dy, (1 - o.tension) * dx) * 180 / Math.PI });
      }
      if (mi === curModIndex && s.b.id === headId) ahead = true;
    }

    // Fans: a solid stub from under the head's label to the first street, then one
    // trace per child along the layout's own fan edge, ending on the child's disc.
    for (const { node: head } of heads) {
      const edges = fans.filter((e) => e.from === head.id);
      if (!edges.length) continue;
      const labelBottom = head.y + head.h;
      const street0 = edges[0].points[1][1];
      out.trunk.push({ from: head.id, d: `M ${head.cx} ${labelBottom} L ${head.cx} ${street0 - o.traceRadius}` });
      for (const e of edges) {
        const kid = byId.get(e.to);
        const points = e.points.slice();
        points[0] = [head.cx, labelBottom];
        points[points.length - 1] = [kid.cx, kid.cy - o.reinforcementDiameter / 2];
        const lit = (kid.topic && kid.topic.status === "completed") || (curNode && kid.id === curNode.id);
        (lit ? out.branchOn : out.branch).push({ from: head.id, to: kid.id, d: rounded(points, o.traceRadius) });
      }
    }
  });
  return out;
}

// ── Sampling: points along a path of this module's grammar, ≤ `step` px apart ──

function cubicAt(p0, c1, c2, p1, t) {
  const u = 1 - t;
  return [0, 1].map((i) => u * u * u * p0[i] + 3 * u * u * t * c1[i] + 3 * u * t * t * c2[i] + t * t * t * p1[i]);
}

function quadAt(p0, c, p1, t) {
  const u = 1 - t;
  return [0, 1].map((i) => u * u * p0[i] + 2 * u * t * c[i] + t * t * p1[i]);
}

function polylineLength(at) {
  let len = 0;
  let prev = at(0);
  for (let i = 1; i <= 64; i++) {
    const p = at(i / 64);
    len += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
  }
  return len;
}

export function samplePath(d, step = 3) {
  const tokens = String(d).trim().split(/\s+/);
  const points = [];
  let point = null;
  const num = () => {
    const v = Number(tokens.shift());
    if (!Number.isFinite(v)) throw new Error(`samplePath: bad number in ${d}`);
    return v;
  };
  const walk = (at, length, end) => {
    const n = Math.max(1, Math.ceil((2 * length) / step));
    for (let i = 1; i < n; i++) points.push(at(i / n));
    points.push(end);
    point = end;
  };
  while (tokens.length) {
    const op = tokens.shift();
    if (op === "M") {
      point = [num(), num()];
      points.push(point);
    } else if (op === "L") {
      const from = point;
      const to = [num(), num()];
      const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
      const n = Math.max(1, Math.ceil(length / step - 1e-9));
      for (let i = 1; i < n; i++) points.push([from[0] + (to[0] - from[0]) * i / n, from[1] + (to[1] - from[1]) * i / n]);
      points.push(to);
      point = to;
    } else if (op === "C") {
      const from = point;
      const c1 = [num(), num()];
      const c2 = [num(), num()];
      const to = [num(), num()];
      const at = (t) => cubicAt(from, c1, c2, to, t);
      walk(at, polylineLength(at), to);
    } else if (op === "Q") {
      const from = point;
      const c = [num(), num()];
      const to = [num(), num()];
      const at = (t) => quadAt(from, c, to, t);
      walk(at, polylineLength(at), to);
    } else if (op === "A") {
      const r = num();
      num(); num(); num(); // ry, rotation, large-arc: this grammar's arcs are quarter circles
      const sweep = num();
      const from = point;
      const to = [num(), num()];
      const dx = to[0] - from[0];
      const dy = to[1] - from[1];
      if (Math.abs(Math.hypot(dx, dy) - r * Math.SQRT2) > 1e-6) throw new Error(`samplePath: only quarter-circle arcs, in ${d}`);
      // S − C = v; E − C is v turned 90° in the sweep's direction.
      const v = sweep === 1 ? [(dy - dx) / 2, -(dx + dy) / 2] : [-(dx + dy) / 2, (dx - dy) / 2];
      const centre = [from[0] - v[0], from[1] - v[1]];
      const a0 = Math.atan2(v[1], v[0]);
      const turn = sweep === 1 ? Math.PI / 2 : -Math.PI / 2;
      walk((t) => [centre[0] + r * Math.cos(a0 + turn * t), centre[1] + r * Math.sin(a0 + turn * t)], r * Math.PI / 2, to);
    } else {
      throw new Error(`samplePath: unsupported command ${op} in ${d}`);
    }
  }
  return points;
}
