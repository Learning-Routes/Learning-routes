import type { ModelMessage } from "@learning-routes/core/ai/gate";
import { AGENT_TEXT, type WorkingOn } from "@learning-routes/core/copy/agent";
import { LOCALES, type LocaleCode } from "@learning-routes/core/locales";
import { budgetOf, monthOf } from "@learning-routes/core/studio/budget";
import { STUDIO_PROMPT, studioContext } from "@learning-routes/core/studio/prompt";
import type { StudioEvent, StudioOption, StudioStep } from "@learning-routes/core/studio/session";
import { type ContentTool, runTurn } from "@learning-routes/core/studio/turn";
import { Agent, type Connection, type ConnectionContext } from "agents";
import * as z from "zod";
import { newId } from "../ids";
import { type AgentEnv, USER_HEADER } from "./env";
import { modelCall, type SpendBook } from "./model";
import { Effects } from "./studio-effects";

// One creator space's assistant (Platform STEP 10 §1): a Durable Object built with the Agents SDK.
// It keeps every conversation of the space in its own SQLite, replays one to a page that comes
// back, and runs each turn through runTurn. The Worker in front of it checked who is connecting.

const Input = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("message"), text: z.string().trim().min(1).max(4_000) }),
  z.strictObject({ type: z.literal("choice"), optionId: z.string().max(8) }),
  z.strictObject({ type: z.literal("publish"), isConfirmed: z.boolean() }),
]);
type Input = z.infer<typeof Input>;

interface Seat {
  userId: string;
  conversationId: string;
  locale: LocaleCode;
}

export interface ConversationRow {
  id: string;
  user_id: string;
  locale: string;
  step: string;
  options: string;
  route_id: string | null;
  shown_lessons: string | null;
  pending_publish: string | null;
  warned_month: string | null;
}

const localeOf = (given: string | null): LocaleCode =>
  (LOCALES as readonly string[]).includes(given ?? "") ? (given as LocaleCode) : "es";

export class Studio extends Agent<AgentEnv> {
  // Not state: only the order of this instance's turns while it is awake.
  private turns: Promise<void> = Promise.resolve();

  override async onStart() {
    this.sql`create table if not exists conversations (id text primary key, user_id text not null,
      locale text not null, step text not null, options text not null default '[]', route_id text,
      shown_lessons text, pending_publish text, warned_month text, created_at integer not null)`;
    this.sql`create table if not exists events (conversation_id text not null, seq integer not null,
      body text not null, primary key (conversation_id, seq))`;
    this
      .sql`create table if not exists messages (conversation_id text not null, seq integer not null,
      body text not null, primary key (conversation_id, seq))`;
    this
      .sql`create table if not exists spend (at integer not null, month text not null, day text not null,
      conversation_id text not null, model text not null, prompt_tokens integer not null,
      cached_tokens integer not null, completion_tokens integer not null, microcents integer not null,
      is_charged integer not null)`;
  }

  // Our protocol only: the SDK's own messages would be noise to the page.
  override shouldSendProtocolMessages() {
    return false;
  }

  override async onConnect(connection: Connection, { request }: ConnectionContext) {
    const userId = request.headers.get(USER_HEADER);
    if (!userId) {
      connection.close(1008, "unauthenticated");
      return;
    }
    const url = new URL(request.url);
    const locale = localeOf(url.searchParams.get("locale"));
    const conversationId = this.conversationFor(userId, locale, url.searchParams.has("new"));
    connection.setState({ userId, conversationId, locale } satisfies Seat);
    // A page that comes back gets what it missed, in order: the whole conversation after a reload.
    const after = Number(url.searchParams.get("after")) || 0;
    for (const row of this.sql<{ seq: number; body: string }>`select seq, body from events
      where conversation_id = ${conversationId} and seq > ${after} order by seq`) {
      connection.send(`{"seq":${row.seq},"event":${row.body}}`);
    }
  }

  override async onMessage(connection: Connection, message: string | ArrayBuffer) {
    const seat = connection.state as Seat | undefined;
    const read = typeof message === "string" ? Input.safeParse(safeJson(message)) : null;
    if (!(seat && read?.success)) {
      return;
    }
    this.turns = this.turns
      .then(() => this.answer(seat, read.data))
      .catch((error: unknown) => {
        console.error(JSON.stringify({ message: "studio turn failed", error: String(error) }));
        this.emit(
          seat.conversationId,
          { type: "said", text: AGENT_TEXT[seat.locale].failed },
          true,
        );
      });
    await this.turns;
  }

  private conversationFor(userId: string, locale: LocaleCode, isNew: boolean): string {
    const [latest] = this.sql<{ id: string }>`select id from conversations where user_id = ${userId}
      order by created_at desc limit 1`;
    if (latest && !isNew) {
      return latest.id;
    }
    const id = newId();
    this.sql`insert into conversations (id, user_id, locale, step, created_at)
      values (${id}, ${userId}, ${locale}, ${"meet"}, ${Date.now()})`;
    return id;
  }

  conversation(id: string): ConversationRow {
    const [row] = this.sql<ConversationRow>`select * from conversations where id = ${id}`;
    if (!row) {
      throw new Error("no such conversation");
    }
    return row;
  }

  setConversation(id: string, change: Partial<Omit<ConversationRow, "id" | "user_id">>) {
    const row = { ...this.conversation(id), ...change };
    this.sql`update conversations set locale = ${row.locale}, step = ${row.step},
      options = ${row.options}, route_id = ${row.route_id}, shown_lessons = ${row.shown_lessons},
      pending_publish = ${row.pending_publish}, warned_month = ${row.warned_month}
      where id = ${id}`;
  }

  /** To every page open on this conversation; `keep` also stores it for replay. */
  emit(conversationId: string, event: StudioEvent, keep: boolean) {
    let frame = `{"event":${JSON.stringify(event)}}`;
    if (keep) {
      const [last] = this.sql<{ seq: number }>`select coalesce(max(seq), 0) as seq from events
        where conversation_id = ${conversationId}`;
      const seq = (last?.seq ?? 0) + 1;
      this.sql`insert into events (conversation_id, seq, body)
        values (${conversationId}, ${seq}, ${JSON.stringify(event)})`;
      frame = `{"seq":${seq},"event":${JSON.stringify(event)}}`;
    }
    for (const connection of this.getConnections<Seat>()) {
      if (connection.state?.conversationId === conversationId) {
        connection.send(frame);
      }
    }
  }

  private history(conversationId: string): ModelMessage[] {
    return this.sql<{
      body: string;
    }>`select body from messages where conversation_id = ${conversationId}
      order by seq`.map((row) => JSON.parse(row.body) as ModelMessage);
  }

  private remember(conversationId: string, from: number, messages: ModelMessage[]) {
    messages.slice(from).forEach((message, at) => {
      this.sql`insert into messages (conversation_id, seq, body)
        values (${conversationId}, ${from + at + 1}, ${JSON.stringify(message)})`;
    });
  }

  private book(conversationId: string): SpendBook {
    return {
      spent: (now) => {
        const [row] = this.sql<{ month: number; today: number }>`select
          coalesce(sum(case when month = ${monthOf(now)} then microcents end), 0) as month,
          coalesce(sum(case when day = ${new Date(now).toISOString().slice(0, 10)} then microcents end), 0) as today
          from spend where is_charged = 1`;
        return { month: row?.month ?? 0, today: row?.today ?? 0 };
      },
      record: (row) => {
        const now = Date.now();
        this
          .sql`insert into spend (at, month, day, conversation_id, model, prompt_tokens, cached_tokens,
          completion_tokens, microcents, is_charged) values (${now}, ${monthOf(now)},
          ${new Date(now).toISOString().slice(0, 10)}, ${conversationId}, ${row.model}, ${row.promptTokens},
          ${row.cachedTokens}, ${row.completionTokens}, ${row.microcents}, ${row.isCharged ? 1 : 0})`;
        console.log(JSON.stringify({ message: "studio model call", ...row }));
      },
    };
  }

  private async answer(seat: Seat, input: Input) {
    const words = AGENT_TEXT[seat.locale];
    const effects = new Effects(this, this.env, this.ctx, seat);
    const row = this.conversation(seat.conversationId);
    if (input.type === "publish") {
      await effects.publish(input.isConfirmed);
      return;
    }
    let text: string;
    if (input.type === "choice") {
      const option = (JSON.parse(row.options) as StudioOption[]).find(
        (each) => each.id === input.optionId,
      );
      if (!option) {
        return;
      }
      this.emit(seat.conversationId, { type: "chose", optionId: option.id }, true);
      this.setConversation(seat.conversationId, { options: "[]" });
      text = option.decision ? `${option.label} (${option.decision})` : option.label;
    } else {
      text = input.text;
      const [any] = this.sql<{
        seq: number;
      }>`select seq from events where conversation_id = ${seat.conversationId} limit 1`;
      if (!any) {
        this.emit(seat.conversationId, { type: "began", text }, true);
      }
    }
    this.warnWhenLow(seat);
    const messages = this.history(seat.conversationId);
    const before = messages.length;
    messages.push({ role: "user", content: text });
    const deps = {
      step: row.step as StudioStep,
      call: modelCall(this.env, this.book(seat.conversationId), {
        id: seat.conversationId,
        system: STUDIO_PROMPT + studioContext({ spaceId: this.name, locale: seat.locale }),
      }),
      runContentTool: effects.runContentTool,
      studio: effects.studio,
      afterWrite: effects.afterWrite,
      emit: (event: StudioEvent, keep: boolean) => this.emit(seat.conversationId, event, keep),
      words: {
        failed: words.failed,
        budgetOut: this.env.OPENROUTER_API_KEY ? words.budgetOut : words.notOn,
        tooLong: words.tooLong,
        working: (tool: ContentTool) =>
          Object.hasOwn(words.working, tool)
            ? words.working[tool as WorkingOn]
            : words.working.reading,
      },
    };
    try {
      await runTurn(messages, deps);
    } finally {
      this.remember(seat.conversationId, before, messages);
    }
  }

  private warnWhenLow(seat: Seat) {
    const now = Date.now();
    const row = this.conversation(seat.conversationId);
    const spent = this.book(seat.conversationId).spent(now).month;
    if (
      budgetOf(spent, Number(this.env.AGENT_SPACE_MONTHLY_MICROCENTS)) === "low" &&
      row.warned_month !== monthOf(now)
    ) {
      this.setConversation(seat.conversationId, { warned_month: monthOf(now) });
      this.emit(
        seat.conversationId,
        { type: "said", text: AGENT_TEXT[seat.locale].budgetLow },
        true,
      );
    }
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
