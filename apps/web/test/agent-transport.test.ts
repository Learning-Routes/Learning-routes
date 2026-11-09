import type { StudioEvent } from "@learning-routes/core/studio/session";
import { describe, expect, it, vi } from "vitest";
import { AgentTransport } from "../app/studio/agent-transport";

class FakeSocket {
  static opened: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((message: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.opened.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(frame: unknown) {
    this.onmessage?.({ data: typeof frame === "string" ? frame : JSON.stringify(frame) });
  }
  send(text: string) {
    this.sent.push(text);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}

function connect() {
  FakeSocket.opened = [];
  const transport = new AgentTransport(
    { origin: "https://app.example.com", spaceId: "s1", locale: "es" },
    (url) => new FakeSocket(url) as unknown as WebSocket,
  );
  const events: StudioEvent[] = [];
  transport.subscribe((event) => events.push(event));
  return { transport, events, socket: () => FakeSocket.opened.at(-1) as FakeSocket };
}

describe("the agent's transport", () => {
  it("opens the assistant's WebSocket on the app's host, for the space, in the page's language", () => {
    const { socket } = connect();
    expect(socket().url).toBe(
      "wss://app.example.com/creador/asistente/conexion?space=s1&locale=es&after=0",
    );
  });

  it("plays the conversation as events, and skips anything that is not one", () => {
    const { socket, events } = connect();
    socket().open();
    socket().receive({ seq: 1, event: { type: "began", text: "Hola" } });
    socket().receive({ event: { type: "said", text: "¡Ho" } });
    socket().receive({ seq: 2, event: { type: "nope" } });
    socket().receive("not json");
    socket().receive({ type: "cf_agent_identity" });
    expect(events).toEqual([
      { type: "began", text: "Hola" },
      { type: "said", text: "¡Ho" },
    ]);
  });

  it("keeps what the page sends until the socket is open", () => {
    const { transport, socket } = connect();
    transport.send({ type: "message", text: "Quiero mi app" });
    expect(socket().sent).toEqual([]);
    socket().open();
    expect(socket().sent).toEqual(['{"type":"message","text":"Quiero mi app"}']);
  });

  it("comes back after a lost connection, asking only for what it missed", () => {
    vi.useFakeTimers();
    const { socket, events } = connect();
    socket().open();
    socket().receive({ seq: 1, event: { type: "began", text: "Hola" } });
    socket().receive({ seq: 2, event: { type: "stepped", step: "content" } });
    socket().close();
    vi.advanceTimersByTime(30_000);
    expect(socket().url).toContain("after=2");
    socket().open();
    // A replayed event it already has is not played twice.
    socket().receive({ seq: 2, event: { type: "stepped", step: "content" } });
    socket().receive({ seq: 3, event: { type: "said", text: "¿Para quién?" } });
    expect(events.map((event) => event.type)).toEqual(["began", "stepped", "said"]);
    vi.useRealTimers();
  });

  it("stops for good when the page closes it", () => {
    vi.useFakeTimers();
    const { transport } = connect();
    transport.close();
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.opened).toHaveLength(1);
    vi.useRealTimers();
  });
});
