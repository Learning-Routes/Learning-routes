import { describe, expect, it } from "vitest";
import {
  INITIAL_STUDIO_STATE,
  planStations,
  type StudioEvent,
  type StudioState,
  studioReducer,
} from "../../src/studio/session";

const MODULES = [
  { title: "Lo básico", lessons: [{ title: "¿Qué es una variable?" }, { title: "Un paso" }] },
  { title: "Fracciones", lessons: [{ title: "Sumar" }, { title: "Práctica", isNew: true }] },
];

const run = (events: StudioEvent[], from: StudioState = INITIAL_STUDIO_STATE) =>
  events.reduce(studioReducer, from);

describe("studioReducer", () => {
  it("keeps the creator's first words at the trail's start", () => {
    const state = run([{ type: "began", text: "Quiero mi app de matemáticas" }]);
    expect(state.hasBegun).toBe(true);
    expect(state.opening).toBe("Quiero mi app de matemáticas");
  });

  it("writes a walked branch on the trail with its decision, and clears the choices", () => {
    const state = run([
      {
        type: "asked",
        isFork: true,
        options: [
          { id: "school", label: "Colegio", decision: "Para colegio" },
          { id: "uni", label: "Universidad" },
          { id: "adults", label: "Adultos" },
        ],
      },
      { type: "chose", optionId: "uni" },
    ]);
    expect(state.trail).toEqual([{ branch: 1, branches: 3, decision: "Universidad" }]);
    expect(state.options).toEqual([]);
    expect(state.isFork).toBe(false);
  });

  it("leaves the trail alone when the choice was not a fork", () => {
    const state = run([
      { type: "asked", isFork: false, options: [{ id: "go", label: "Sigue" }] },
      { type: "chose", optionId: "go" },
    ]);
    expect(state.trail).toEqual([]);
  });

  it("ignores a choice it never offered", () => {
    const asked = run([{ type: "asked", isFork: true, options: [{ id: "a", label: "A" }] }]);
    expect(studioReducer(asked, { type: "chose", optionId: "z" })).toBe(asked);
  });

  it("never counts more built stations than the plan has, or fewer than none", () => {
    const planned = run([{ type: "planned", title: "Álgebra", summary: "", modules: MODULES }]);
    expect(run([{ type: "built", stations: 99 }], planned).built).toBe(6);
    expect(run([{ type: "built", stations: -3 }], planned).built).toBe(0);
    expect(run([{ type: "built", stations: 4 }]).built).toBe(0);
  });

  it("shortens what is built when a new plan has fewer stations", () => {
    const built = run([
      { type: "planned", title: "Álgebra", summary: "", modules: MODULES },
      { type: "built", stations: 6 },
      { type: "planned", title: "Álgebra", summary: "", modules: MODULES.slice(0, 1) },
    ]);
    expect(built.built).toBe(3);
  });

  it("asks before publishing and remembers the address once published", () => {
    const asking = run([
      { type: "asked", isFork: false, options: [{ id: "x", label: "X" }] },
      { type: "confirming", address: "andres.learningroutes.com", price: null },
    ]);
    expect(asking.options).toEqual([]);
    expect(asking.confirming).toEqual({ address: "andres.learningroutes.com", price: null });
    const done = run([{ type: "published", address: "andres.learningroutes.com" }], asking);
    expect(done.confirming).toBeNull();
    expect(done.publishedAt).toBe("andres.learningroutes.com");
  });

  it("puts the question away when the creator says not yet, and publishes nothing", () => {
    const asking = run([{ type: "confirming", address: "andres.learningroutes.com", price: null }]);
    const declined = run([{ type: "declined" }], asking);
    expect(declined.confirming).toBeNull();
    expect(declined.publishedAt).toBeNull();
  });
});

describe("planStations", () => {
  it("lists each module and then its lessons, marking the new ones", () => {
    expect(planStations(MODULES).map((s) => `${s.kind}:${s.title}:${s.isNew}`)).toEqual([
      "module:Lo básico:false",
      "lesson:¿Qué es una variable?:false",
      "lesson:Un paso:false",
      "module:Fracciones:false",
      "lesson:Sumar:false",
      "lesson:Práctica:true",
    ]);
  });
});
