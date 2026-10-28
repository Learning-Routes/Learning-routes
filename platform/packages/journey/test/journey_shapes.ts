// The named route shapes the journey's pure modules are tested over: the layout
// (journey_map_layout.test.ts) and the drawn paths (journey_map_paths.test.ts).
// One list, so a shape added for one is checked by both.
import type { Stage, Topic } from "../src/journey_map_layout";

export interface ShapeTopic extends Topic {
  id: string;
  name: string;
  status: string;
  progress: number;
  reinforcement: boolean;
  parent_id: string | null;
  current: boolean;
  path: string;
}

export interface ShapeStage extends Stage {
  module_id: string;
  level: string;
  label: string;
  tag: string;
  status: string;
  readable: boolean;
  topics: ShapeTopic[];
}

export function topic(
  id: string,
  {
    reinforcement = false,
    parent_id = null,
  }: { reinforcement?: boolean; parent_id?: string | null } = {},
): ShapeTopic {
  return {
    id,
    name: `Tema ${id}`,
    status: "available",
    progress: 0,
    reinforcement,
    parent_id,
    current: false,
    path: "/x",
  };
}

export function stage(
  id: string,
  {
    primaries,
    fans = {},
    orphans = 0,
    readable = true,
  }: { primaries: number; fans?: Record<number, number>; orphans?: number; readable?: boolean },
): ShapeStage {
  const topics: ShapeTopic[] = [];
  for (let i = 0; i < orphans; i++) topics.push(topic(`${id}-o${i}`, { reinforcement: true }));
  for (let i = 0; i < primaries; i++) {
    const pid = `${id}-p${i}`;
    topics.push(topic(pid));
    for (let j = 0; j < (fans[i] ?? 0); j++) {
      topics.push(topic(`${pid}-r${j}`, { reinforcement: true, parent_id: pid }));
    }
  }
  return {
    module_id: id,
    level: "nv1",
    label: `Módulo ${id}`,
    tag: "NV1",
    status: readable ? "current" : "locked",
    readable,
    topics,
  };
}

export const SHAPES: Readonly<Record<string, ShapeStage[]>> = (() => {
  const shapes: Record<string, ShapeStage[]> = {};
  for (const count of [1, 7, 8, 20, 43]) {
    for (const modules of [1, 2, 5]) {
      shapes[`${count} steps x ${modules} modules`] = Array.from({ length: modules }, (_, m) =>
        stage(`m${m}`, { primaries: count }),
      );
    }
  }
  shapes["43 peers"] = [stage("m0", { primaries: 43 })];
  shapes["7 + 36 behind one step"] = [stage("m0", { primaries: 7, fans: { 2: 36 } })];
  shapes["production 7 + 13"] = [stage("m0", { primaries: 7, fans: { 1: 3, 2: 3, 4: 7 } })];
  shapes["orphans then fans"] = [stage("m0", { primaries: 5, orphans: 2, fans: { 0: 2, 3: 4 } })];
  shapes["two fans in one row"] = [stage("m0", { primaries: 4, fans: { 0: 3, 3: 3 } })];
  // A fan hangs directly under the step a row-to-row hop leaves from: the hop
  // must take the gutter, not drop through the fan (ltr row end, then rtl).
  shapes["fan under an ltr row end"] = [stage("m0", { primaries: 5, fans: { 3: 3 } })];
  shapes["fan under an rtl row end"] = [stage("m0", { primaries: 9, fans: { 7: 3 } })];
  shapes["preview + locked"] = [
    stage("m0", { primaries: 7, fans: { 2: 3 } }),
    stage("m1", { primaries: 9, readable: false }),
  ];
  return Object.freeze(shapes);
})();

// WP-37b §2.4: the options the page passes. The invariants run under these too,
// since this is the layout that ships.
export const VIEW = Object.freeze({
  labelWidth: 124,
  labelLineHeight: 16,
  labelLines: 3,
  labelGap: 8,
  moduleLabelWidth: 160,
  rootWidth: 420,
  rootHeight: 64,
  rootGap: 52,
  rootX: 18,
  moduleDiameter: 52,
  stepDiameter: 44,
  reinforcementDiameter: 28,
  cellGap: 16,
  rowGap: 36,
  gutter: 84,
  moduleGap: 76,
  fanGutter: 20,
  fanGap: 8,
  fanRowGap: 20,
  rowSize: 4,
  fanRowSize: 3,
  wave: 16,
});
