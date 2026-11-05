import { MOST, type RouteDocument } from "./route-document";

// What upload_document's parser builds a route in (Platform STEP 8 §2): the modules, lessons and
// blocks so far, and the report of where each piece of the source went.

export interface ReportItem {
  line: number;
  kind: "imported" | "plain_text" | "skipped";
  what: string;
  why?: string;
}

export interface Node {
  type: string;
  value?: string;
  url?: string;
  alt?: string | null;
  depth?: number;
  position?: { start: { line: number; offset?: number }; end: { offset?: number } };
  children?: Node[];
}

export type Block = RouteDocument["modules"][number]["lessons"][number]["blocks"][number];

const SHOWN_IN_REPORT = 60;

export const plain = (node: Node): string =>
  node.value ?? node.alt ?? (node.children ?? []).map(plain).join("");

export const only = (node: Node, type: string) =>
  node.type === "paragraph" && node.children?.length === 1 && node.children[0]?.type === type
    ? node.children[0]
    : null;

export class Builder {
  readonly report: ReportItem[] = [];
  readonly modules: {
    title: Record<string, string>;
    lessons: { title: Record<string, string>; blocks: Block[] }[];
  }[] = [];
  private prose: string[] = [];
  private proseLine = 0;
  title: string | null;

  constructor(
    private readonly source: string,
    private readonly locale: string,
    title: string | undefined,
  ) {
    this.title = title ?? null;
  }

  slice(node: Node) {
    return this.source.slice(node.position?.start.offset ?? 0, node.position?.end.offset ?? 0);
  }

  note(node: Node, kind: ReportItem["kind"], what: string, why?: string) {
    this.report.push({
      line: node.position?.start.line ?? 1,
      kind,
      what: what.slice(0, SHOWN_IN_REPORT),
      ...(why ? { why } : {}),
    });
  }

  text(words: string) {
    return { [this.locale]: words } as Record<string, string>;
  }

  flush() {
    if (this.prose.length > 0) {
      const body = this.prose.join("\n\n");
      this.prose = [];
      this.push({ type: "concept", body: this.text(body) } as Block, this.proseLine, "concept");
    }
  }

  private push(block: Block, line: number, what: string) {
    this.lesson().blocks.push(block);
    this.report.push({ line, kind: "imported", what });
  }

  private module() {
    if (this.modules.length === 0) {
      this.modules.push({ title: this.text(this.title ?? ""), lessons: [] });
    }
    return this.modules.at(-1) as Builder["modules"][number];
  }

  private lesson() {
    const module = this.module();
    if (module.lessons.length === 0) {
      module.lessons.push({ title: { ...module.title }, blocks: [] });
    }
    return module.lessons.at(-1) as Builder["modules"][number]["lessons"][number];
  }

  openModule(node: Node) {
    this.flush();
    this.modules.push({ title: this.text(plain(node)), lessons: [] });
    this.note(node, "imported", `module: ${plain(node)}`);
  }

  openLesson(node: Node) {
    this.flush();
    this.module().lessons.push({ title: this.text(plain(node)), blocks: [] });
    this.note(node, "imported", `lesson: ${plain(node)}`);
  }

  addProse(node: Node) {
    const words = this.slice(node);
    if (this.prose.join("\n\n").length + words.length > MOST.textLength) {
      this.flush();
    }
    if (this.prose.length === 0) {
      this.proseLine = node.position?.start.line ?? 1;
    }
    this.prose.push(words);
  }

  add(block: Block, node: Node, what: string) {
    this.flush();
    this.push(block, node.position?.start.line ?? 1, what);
  }

  lastBlock(): Block | undefined {
    return this.lesson().blocks.at(-1);
  }
}
