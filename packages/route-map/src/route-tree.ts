// The route as a tree, from the controller's JSON: route → modules → primary
// steps → reinforcement. layout.ts places it.

// A topic as the controller's JSON sends it; only these fields are read here.
export interface Topic {
  id: string | number;
  reinforcement?: boolean;
  parent_id?: string | number | null;
  status?: string;
  [key: string]: unknown;
}

export interface Stage {
  module_id: string | number;
  level?: string;
  readable?: boolean;
  topics?: Topic[];
  [key: string]: unknown;
}

interface StepCell {
  kind: "step";
  topic: Topic;
  ordinal: number;
  children: Topic[];
}

interface AnchorCell {
  kind: "anchor";
  topic: null;
  children: Topic[];
}

export type Cell = StepCell | AnchorCell;

export interface TreeModule {
  id: string;
  moduleId: string | number;
  index: number;
  stage: Stage;
  readable: boolean;
  cells: Cell[];
}

export interface Tree {
  root: { title: string };
  modules: TreeModule[];
}

const isReinforcement = (topic: Topic): boolean => topic.reinforcement === true;

// A module's cells: its primary steps in order, each with its reinforcement.
function moduleCells(topics: Topic[]): Cell[] {
  const cells: Cell[] = [];
  const byId = new Map<Topic["id"], StepCell>();
  for (const topic of topics) {
    if (isReinforcement(topic)) {
      continue;
    }
    // The direction cue: its 1-based place among the module's primary steps.
    const cell: StepCell = { kind: "step", topic, ordinal: cells.length + 1, children: [] };
    cells.push(cell);
    byId.set(topic.id, cell);
  }
  const orphans: Topic[] = [];
  for (const topic of topics) {
    if (!isReinforcement(topic)) {
      continue;
    }
    const parent = topic.parent_id == null ? null : byId.get(topic.parent_id);
    (parent ? parent.children : orphans).push(topic);
  }
  if (orphans.length) {
    cells.unshift({ kind: "anchor", topic: null, children: orphans });
  }
  return cells;
}

// The controller's JSON → the tree. Reinforcement goes under its parent_id when
// that parent is a primary step of the same module; otherwise it is an ORPHAN,
// and the orphans of a module share one anchor cell placed first.
export function buildTree(
  root: { title?: string } | null | undefined,
  stages: Stage[] | null | undefined,
): Tree {
  return {
    root: { title: root?.title || "" },
    modules: (stages || []).map((stage, index) => ({
      id: `m:${stage.module_id}`,
      moduleId: stage.module_id,
      index,
      stage,
      readable: stage.readable === true,
      cells: moduleCells(stage.topics || []),
    })),
  };
}
