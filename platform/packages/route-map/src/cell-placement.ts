// Sizing and placing one cell: a primary step (or a module's anchor) and the fan
// of reinforcement hanging under it, with the fan's edges along its streets.
import type {
  EdgeKind,
  LayoutEdge,
  LayoutNode,
  LayoutOptions,
  LayoutParts,
  XY,
} from "./layout-model";
import type { Cell, TreeModule } from "./route-tree";

export interface MeasuredCell {
  cell: Cell;
  w: number;
  h: number;
  fanW: number;
}

export function nodeSize(kind: string, o: LayoutOptions): { d: number; w: number; h: number } {
  const d =
    kind === "module"
      ? o.moduleDiameter
      : kind === "reinforcement"
        ? o.reinforcementDiameter
        : o.stepDiameter;
  const labelWidth = kind === "module" ? o.moduleLabelWidth : o.labelWidth;
  return { d, w: Math.max(labelWidth, d), h: d + o.labelGap + o.labelLines * o.labelLineHeight };
}

export function measureCell(cell: Cell, o: LayoutOptions): { w: number; h: number; fanW: number } {
  const step = nodeSize("step", o);
  const kid = nodeSize("reinforcement", o);
  const n = cell.children.length;
  if (n === 0) {
    return { w: step.w, h: step.h, fanW: 0 };
  }
  const cols = Math.min(o.fanRowSize, n);
  const rows = Math.ceil(n / o.fanRowSize);
  const fanW = cols * kid.w + (cols - 1) * o.fanGap;
  return {
    w: Math.max(step.w, o.fanGutter + fanW),
    h: step.h + rows * (kid.h + o.fanRowGap),
    fanW,
  };
}

export const edge = (
  from: { id: string },
  to: { id: string },
  kind: EdgeKind,
  points: XY[],
  locked: boolean,
): LayoutEdge => ({ from: from.id, to: to.id, kind, points, locked });

// The cell's head: a step box, or a zero-size anchor for the module's orphans.
function headOf(
  measured: MeasuredCell,
  left: number,
  top: number,
  mod: TreeModule,
  o: LayoutOptions,
): LayoutNode {
  const step = nodeSize("step", o);
  const { cell } = measured;
  const fanLeft = left + o.fanGutter;
  // Centred over its fan — Reingold–Tilford's rule — or over its own cell.
  const cx = cell.children.length ? fanLeft + measured.fanW / 2 : left + measured.w / 2;
  const cy = top + step.d / 2;
  const shared = { moduleId: mod.id, readable: mod.readable, level: mod.stage.level };
  return cell.kind === "anchor"
    ? { id: `a:${mod.moduleId}`, kind: "anchor", x: cx, y: cy, w: 0, h: 0, cx, cy, ...shared }
    : {
        id: `s:${cell.topic.id}`,
        kind: "step",
        x: cx - step.w / 2,
        y: top,
        w: step.w,
        h: step.h,
        cx,
        cy,
        topic: cell.topic,
        ordinal: cell.ordinal,
        ...shared,
      };
}

// The fan: reinforcement in rows of fanRowSize under the head, each edge running
// down to the first street, along the trunk in the fan's gutter, then across.
function placeFan(
  head: LayoutNode,
  left: number,
  top: number,
  mod: TreeModule,
  kids: MeasuredCell["cell"]["children"],
  o: LayoutOptions,
  out: LayoutParts,
): void {
  const step = nodeSize("step", o);
  const kid = nodeSize("reinforcement", o);
  const fanLeft = left + o.fanGutter;
  const shared = { moduleId: mod.id, readable: mod.readable, level: mod.stage.level };
  const { cx, cy } = head;
  const headBottom = top + step.h;
  const trunkX = left + o.fanGutter / 2;
  const street0 = headBottom + o.fanRowGap / 2;
  kids.forEach((topic, i) => {
    const row = Math.floor(i / o.fanRowSize);
    const col = i % o.fanRowSize;
    const rowTop = headBottom + o.fanRowGap + row * (kid.h + o.fanRowGap);
    const x = fanLeft + col * (kid.w + o.fanGap);
    const child: LayoutNode = {
      id: `s:${topic.id}`,
      kind: "reinforcement",
      x,
      y: rowTop,
      w: kid.w,
      h: kid.h,
      cx: x + kid.w / 2,
      cy: rowTop + kid.d / 2,
      topic,
      ...shared,
    };
    out.nodes.push(child);
    const street = rowTop - o.fanRowGap / 2;
    const points: XY[] =
      row === 0
        ? [
            [cx, cy],
            [cx, street0],
            [child.cx, street0],
            [child.cx, child.cy],
          ]
        : [
            [cx, cy],
            [cx, street0],
            [trunkX, street0],
            [trunkX, street],
            [child.cx, street],
            [child.cx, child.cy],
          ];
    out.edges.push(edge(head, child, "fan", points, !mod.readable));
  });
}

export function placeCell(
  measured: MeasuredCell,
  left: number,
  top: number,
  mod: TreeModule,
  o: LayoutOptions,
  out: LayoutParts,
): LayoutNode {
  const head = headOf(measured, left, top, mod, o);
  out.nodes.push(head);
  const kids = measured.cell.children;
  placeFan(head, left, top, mod, kids, o, out);
  out.cells.push({
    id: head.id,
    x: left,
    y: top,
    w: measured.w,
    h: measured.h,
    children: kids.length,
  });
  return head;
}
