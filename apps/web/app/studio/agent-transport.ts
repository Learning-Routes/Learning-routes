import {
  STUDIO_PATH,
  type StudioEvent,
  type StudioInput,
} from "@learning-routes/core/studio/session";
import type { StudioTransport } from "./session-transport";

// The page's connection to the creator's assistant (Platform STEP 10): the protocol over the agent's
// WebSocket. On connecting it is sent the conversation so far, as events, so a reload draws the page
// again; after a lost connection it asks only for what it missed.

// What the reducer knows: anything else from the wire is not drawn.
const EVENT_TYPES: readonly string[] = [
  "began",
  "stepped",
  "said",
  "working",
  "worked",
  "asked",
  "chose",
  "planned",
  "built",
  "previewed",
  "confirming",
  "declined",
  "published",
] satisfies StudioEvent["type"][];
const FIRST_RETRY_MS = 500;
const LONGEST_RETRY_MS = 15_000;

interface Frame {
  /** Kept events have one: the page asks for those after the last it has. */
  seq?: number;
  event?: { type?: unknown };
}

function frameOf(data: unknown): Frame | null {
  if (typeof data !== "string") {
    return null;
  }
  try {
    const frame = JSON.parse(data) as Frame;
    return typeof frame.event?.type === "string" && EVENT_TYPES.includes(frame.event.type)
      ? frame
      : null;
  } catch {
    return null;
  }
}

export class AgentTransport implements StudioTransport {
  private readonly listeners = new Set<(event: StudioEvent) => void>();
  private readonly outbox: string[] = [];
  private socket: WebSocket | null = null;
  private lastSeq = 0;
  private retries = 0;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private isClosed = false;

  constructor(
    private readonly where: { origin: string; spaceId: string; locale: string },
    private readonly open: (url: string) => WebSocket = (url) => new WebSocket(url),
  ) {
    this.connect();
  }

  private connect() {
    const url = new URL(STUDIO_PATH, this.where.origin);
    url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
    url.search = new URLSearchParams({
      space: this.where.spaceId,
      locale: this.where.locale,
      after: String(this.lastSeq),
    }).toString();
    const socket = this.open(url.toString());
    this.socket = socket;
    socket.onopen = () => {
      this.retries = 0;
      for (const text of this.outbox.splice(0)) {
        socket.send(text);
      }
    };
    socket.onmessage = (message) => this.receive(message.data);
    socket.onclose = () => {
      if (!this.isClosed) {
        const wait = Math.min(LONGEST_RETRY_MS, FIRST_RETRY_MS * 2 ** this.retries);
        this.retries += 1;
        this.retry = setTimeout(() => this.connect(), wait);
      }
    };
  }

  private receive(data: unknown) {
    const frame = frameOf(data);
    if (!frame) {
      return;
    }
    if (frame.seq !== undefined) {
      if (frame.seq <= this.lastSeq) {
        return;
      }
      this.lastSeq = frame.seq;
    }
    for (const listener of this.listeners) {
      listener(frame.event as StudioEvent);
    }
  }

  send(input: StudioInput) {
    const text = JSON.stringify(input);
    if (this.socket?.readyState === 1) {
      this.socket.send(text);
    } else {
      this.outbox.push(text);
    }
  }

  subscribe(listener: (event: StudioEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  close() {
    this.isClosed = true;
    clearTimeout(this.retry);
    this.socket?.close();
  }
}
