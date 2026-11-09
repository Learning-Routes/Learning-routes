import { runAction } from "@learning-routes/core/actions/define";
import { ACTIONS } from "@learning-routes/core/actions/registry";
import { AGENT_TEXT } from "@learning-routes/core/copy/agent";
import type { LocaleCode } from "@learning-routes/core/locales";
import type { RouteDraft } from "@learning-routes/core/repos/ports";
import { builtOf, lessonPreviewOf, plannedOf } from "@learning-routes/core/studio/draft";
import { askText, type StudioCall } from "@learning-routes/core/studio/studio-tools";
import type { ContentTool } from "@learning-routes/core/studio/turn";
import { pgTenancy } from "../db/tenancy";
import { type Database, transactionAs, withClient } from "../db/with-db";
import { type Caller, callTool, ctxFor } from "../mcp/call-tool";
import { TOOLS } from "../mcp/tools";
import { readSessions } from "./auth";
import { contentTool } from "./content-tools";
import type { AgentEnv } from "./env";
import type { Studio } from "./studio";

// What the assistant's turns do outside the model (Platform STEP 10 §1): content tools through the
// MCP's own runner with via "agent", the page's events read from the real draft, and publishing,
// which only the creator's button starts.

/** A tool's answer, as the model reads it: never longer than this. */
const MOST_RESULT_CHARS = 12_000;
const SCHEME = /^https?:\/\//;

interface Seat {
  userId: string;
  conversationId: string;
  locale: LocaleCode;
}

type Answer = { isError?: boolean; content: { text: string }[]; structuredContent?: unknown };

const resultText = (answer: Answer) => (answer.content[0]?.text ?? "").slice(0, MOST_RESULT_CHARS);

function formatted(draft: RouteDraft, locale: string): string | null {
  const { priceMinor, currency } = draft.route;
  if (priceMinor === null || currency === null) {
    return null;
  }
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(priceMinor / 100);
}

export class Effects {
  constructor(
    private readonly agent: Studio,
    private readonly env: AgentEnv,
    private readonly waitFor: Pick<ExecutionContext, "waitUntil">,
    private readonly seat: Seat,
  ) {}

  private db<T>(work: (db: Database, caller: Caller) => Promise<T>): Promise<T> {
    const { env } = this;
    return withClient(env, this.waitFor, async (db) => {
      const caller: Caller = {
        via: "agent",
        userId: this.seat.userId,
        clientId: "studio",
        scopes: new Set(["routes:read", "routes:write", "routes:publish"]),
        adapter: (await readSessions(env, db).$context).adapter,
        spaceId: this.agent.name,
      };
      return work(db, caller);
    });
  }

  /** Whether this creator still edits the space. */
  stillEditor(): Promise<boolean> {
    return this.db(async (db, caller) => {
      const scope = await transactionAs(db, caller.userId, (tx) =>
        pgTenancy(tx).scopeOf({ kind: "space", id: String(caller.spaceId) }, caller.userId),
      );
      return scope?.role === "owner" || scope?.role === "coeditor";
    });
  }

  private draft(db: Database, caller: Caller, routeId: string): Promise<RouteDraft | null> {
    return transactionAs(db, caller.userId, async (tx) => {
      const read = await runAction(ACTIONS, "route.get", { routeId }, ctxFor(tx, caller));
      return read.ok && (read.output as RouteDraft).spaceId === caller.spaceId
        ? (read.output as RouteDraft)
        : null;
    });
  }

  private emit = (event: Parameters<Studio["emit"]>[1]) =>
    this.agent.emit(this.seat.conversationId, event, true);

  runContentTool = async (name: ContentTool, argumentsText: string) => {
    let input: unknown;
    try {
      input = JSON.parse(argumentsText);
    } catch {
      return { text: "The arguments are not valid JSON." };
    }
    const answer = (await this.db((db, caller) =>
      callTool(this.env, db, caller, contentTool(name), input),
    )) as Answer;
    const routeId =
      (answer.structuredContent as { route_id?: string } | undefined)?.route_id ??
      (input as { route_id?: string }).route_id;
    return { text: resultText(answer), ...(routeId && !answer.isError ? { routeId } : {}) };
  };

  afterWrite = async (routeId: string) => {
    const draft = await this.db((db, caller) => this.draft(db, caller, routeId));
    if (!draft) {
      return;
    }
    const row = this.agent.conversation(this.seat.conversationId);
    // The plan the creator first saw: lessons added after it are marked new on their map.
    const shown =
      row.route_id === routeId && row.shown_lessons
        ? new Set(JSON.parse(row.shown_lessons) as string[])
        : null;
    if (row.route_id !== routeId || !row.shown_lessons) {
      this.agent.setConversation(this.seat.conversationId, {
        route_id: routeId,
        shown_lessons: JSON.stringify(draft.lessons.map((lesson) => lesson.id)),
      });
    }
    this.emit({ type: "planned", ...plannedOf(draft, this.seat.locale, shown) });
    this.emit({ type: "built", stations: builtOf(draft) });
  };

  studio = async (call: StudioCall, said: string): Promise<string> => {
    const id = this.seat.conversationId;
    switch (call.name) {
      case "ask_creator":
        this.emit({ type: "said", text: askText(said, call.question) });
        this.emit({ type: "asked", options: call.options, isFork: call.isFork });
        this.agent.setConversation(id, { options: JSON.stringify(call.options) });
        return "Asked. Wait for the creator's answer.";
      case "set_step":
        this.emit({ type: "stepped", step: call.step });
        this.agent.setConversation(id, { step: call.step });
        return `The step is now ${call.step}.`;
      case "show_lesson":
        return this.showLesson(call.routeId, call.lessonId);
      case "ask_to_publish":
        return this.askToPublish(call.routeId);
    }
  };

  private async showLesson(routeId: string, lessonId: string) {
    const { env } = this;
    const draft = await this.db((db, caller) => this.draft(db, caller, routeId));
    const preview =
      draft &&
      lessonPreviewOf(
        draft,
        lessonId,
        this.seat.locale,
        `${env.APP_ORIGIN}/creador/rutas/${routeId}/vista-previa`,
        AGENT_TEXT[this.seat.locale].kinds,
      );
    if (!preview) {
      return "There is no such lesson in this space's routes.";
    }
    this.emit({ type: "previewed", preview });
    return "Shown to the creator.";
  }

  private async askToPublish(routeId: string) {
    const found = await this.db(async (db, caller) => {
      const draft = await this.draft(db, caller, routeId);
      const space = await transactionAs(db, caller.userId, (tx) =>
        runAction(ACTIONS, "space.get", { spaceId: caller.spaceId }, ctxFor(tx, caller)),
      );
      return draft && space.ok ? { draft, slug: (space.output as { slug: string }).slug } : null;
    });
    if (!found) {
      return "There is no such route in this space.";
    }
    const address = `${found.slug}.${this.env.CREATOR_DOMAIN}/${found.draft.route.slug}`;
    this.agent.setConversation(this.seat.conversationId, { pending_publish: routeId });
    this.emit({ type: "confirming", address, price: formatted(found.draft, this.seat.locale) });
    return "The publish button is shown. Wait: only the creator can press it.";
  }

  /** The creator's own answer to the publish button; the model never gets here. */
  async publish(isConfirmed: boolean) {
    const id = this.seat.conversationId;
    const words = AGENT_TEXT[this.seat.locale];
    const routeId = this.agent.conversation(id).pending_publish;
    this.agent.setConversation(id, { pending_publish: null });
    if (!routeId) {
      return;
    }
    if (!isConfirmed) {
      this.emit({ type: "declined" });
      this.emit({ type: "said", text: words.declined });
      return;
    }
    this.agent.emit(id, { type: "working", text: words.working.publishing }, false);
    const answer = await this.db(async (db, caller) => {
      const draft = await this.draft(db, caller, routeId);
      const publish = TOOLS.find((tool) => tool.name === "publish_route");
      return draft && publish
        ? ((await callTool(this.env, db, caller, publish, {
            route_id: routeId,
            draft_revision: draft.revision,
          })) as Answer)
        : null;
    });
    this.agent.emit(id, { type: "worked" }, false);
    const url = (answer?.structuredContent as { public_url?: string | null } | undefined)
      ?.public_url;
    if (!answer || answer.isError || !url) {
      this.emit({ type: "said", text: words.publishFailed });
      return;
    }
    const address = url.replace(SCHEME, "");
    this.emit({ type: "published", address });
    this.emit({ type: "said", text: words.published.replace("{address}", () => address) });
  }
}
