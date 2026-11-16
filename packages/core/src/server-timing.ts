// Server-Timing (Platform STEP 15): each phase of a request, by name, in milliseconds. It names
// phases only, never a person or a row, so it stays on in production.
//
// shortcut(Platform STEP 15): a Worker's clock only moves across I/O, so a phase of pure CPU work
// (rendering, signing) reads as 0 in production; it is the waits these numbers are for.

const NOT_A_TOKEN = /[^A-Za-z0-9!#$%&'*+.^_`|~-]/g;

export class ServerTiming {
  readonly #entries: string[] = [];

  /** Runs the work and records how long it took, even when it throws. */
  async measure<T>(name: string, work: () => Promise<T>): Promise<T> {
    const started = Date.now();
    try {
      return await work();
    } finally {
      this.add(name, Date.now() - started);
    }
  }

  add(name: string, ms: number) {
    this.#entries.push(`${name.replace(NOT_A_TOKEN, "-")};dur=${ms.toFixed(1)}`);
  }

  /** Another server's phases, under this name: "api-lesson.play.session". */
  addFrom(prefix: string, header: string | null) {
    for (const entry of (header ?? "").split(",")) {
      const [name, ...params] = entry.trim().split(";");
      if (name) {
        this.#entries.push([`${prefix}.${name}`.replace(NOT_A_TOKEN, "-"), ...params].join(";"));
      }
    }
  }

  get header(): string {
    return this.#entries.join(", ");
  }
}
