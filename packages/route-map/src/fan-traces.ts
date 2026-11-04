// Reinforcement hangs from its head on rounded dotted traces that follow the
// layout's own fan streets (cell-placement.ts).
import { at } from "./at-index";
import type { Layout, LayoutNode, XY } from "./layout-model";

export interface FanTraces {
  trunk: { from: string; d: string }[];
  branch: { from: string; to: string; d: string }[];
  branchOn: { from: string; to: string; d: string }[];
}

// A node the layout placed: a missing one means the layout and its edges disagree.
export function nodeOf(byId: Map<string, LayoutNode>, id: string): LayoutNode {
  const node = byId.get(id);
  if (!node) {
    throw new Error(`route map: the layout has no node ${id}`);
  }
  return node;
}

// An orthogonal polyline as a trace with quadratic corners of radius ≤ r.
function rounded(points: XY[], r: number): string {
  const p = points.filter((q, i) => {
    if (i === 0) {
      return true;
    }
    const [px, py] = at(points, i - 1);
    return Math.hypot(q[0] - px, q[1] - py) > 0.01;
  });
  const [x0, y0] = at(p, 0);
  let d = `M ${x0} ${y0}`;
  for (let i = 1; i < p.length - 1; i++) {
    const [ax, ay] = at(p, i - 1);
    const [bx, by] = at(p, i);
    const [cx, cy] = at(p, i + 1);
    const l1 = Math.hypot(bx - ax, by - ay);
    const l2 = Math.hypot(cx - bx, cy - by);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    d += ` L ${bx - ((bx - ax) / l1) * rr} ${by - ((by - ay) / l1) * rr} Q ${bx} ${by} ${bx + ((cx - bx) / l2) * rr} ${by + ((cy - by) / l2) * rr}`;
  }
  const [lx, ly] = at(p, p.length - 1);
  return `${d} L ${lx} ${ly}`;
}

// Fans: a solid stub from under the head's label to the first street, then one
// trace per child along the layout's own fan edge, ending on the child's disc.
export function pushFan(
  out: FanTraces,
  head: LayoutNode,
  fans: Layout["edges"],
  byId: Map<string, LayoutNode>,
  curNode: LayoutNode | null,
  o: { traceRadius: number; reinforcementDiameter: number },
): void {
  const edges = fans.filter((e) => e.from === head.id);
  const [firstEdge] = edges;
  if (!firstEdge) {
    return;
  }
  const labelBottom = head.y + head.h;
  const street0 = at(firstEdge.points, 1)[1];
  out.trunk.push({
    from: head.id,
    d: `M ${head.cx} ${labelBottom} L ${head.cx} ${street0 - o.traceRadius}`,
  });
  for (const e of edges) {
    const kid = nodeOf(byId, e.to);
    const points = e.points.slice();
    points[0] = [head.cx, labelBottom];
    points[points.length - 1] = [kid.cx, kid.cy - o.reinforcementDiameter / 2];
    const lit =
      (kid.topic && kid.topic.status === "completed") || (curNode && kid.id === curNode.id);
    (lit ? out.branchOn : out.branch).push({
      from: head.id,
      to: kid.id,
      d: rounded(points, o.traceRadius),
    });
  }
}
