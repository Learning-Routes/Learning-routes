import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The assistant's map (Platform STEP 10) in Node: WebGL and the page are stand-ins, the roads and
// the plan are real. A route with no module yet once crashed the map (STEP 11-prep §A2).

vi.mock("three", async (original) => ({
  ...(await original<typeof import("three")>()),
  WebGLRenderer: class {
    setPixelRatio() {}
    setClearColor() {}
    setSize() {}
    render() {}
    dispose() {}
  },
}));

/** Just enough of an element for the map's labels and chips. */
function element(): HTMLElement {
  const children: unknown[] = [];
  return {
    style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    className: "",
    textContent: "",
    appendChild: (child: unknown) => children.push(child),
    replaceChildren() {},
    remove() {},
    querySelector: () => null,
    addEventListener() {},
    getBoundingClientRect: () => ({ width: 0, height: 0 }),
    offsetWidth: 0,
    offsetHeight: 0,
  } as unknown as HTMLElement;
}

const station = (label: string) => ({ kind: "module" as const, label, isNew: false });

describe("the studio map", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      devicePixelRatio: 1,
      innerWidth: 1440,
      innerHeight: 900,
      addEventListener() {},
      removeEventListener() {},
    });
    vi.stubGlobal("document", { createElement: element, createTextNode: (text: string) => text });
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  async function newMap() {
    const { StudioMap } = await import("../app/studio/studio-map");
    return new StudioMap({
      canvas: {} as HTMLCanvasElement,
      overlay: element(),
      isReducedMotion: true,
      startLabel: "Empiezas aquí",
      floor: () => 700,
      inset: () => 0,
      ceiling: () => 74,
      onChoose() {},
      onHot() {},
    });
  }

  it("takes a plan with no module yet, before and after a real one", async () => {
    const map = await newMap();
    expect(() => map.setPlan([])).not.toThrow();
    map.setPlan([station("Módulo 1"), station("Módulo 2")]);
    expect(() => map.setPlan([])).not.toThrow();
    expect(() => map.setBuilt(0)).not.toThrow();
    map.dispose();
  });
});

describe("the map's camera beside the route's list", () => {
  it("centres the picture on the part of the page the list leaves visible", async () => {
    const { MapCamera } = await import("../app/studio/studio-camera");
    const view = new MapCamera();
    view.resize(1440, 900, 356);
    expect(view.camera.view?.offsetX).toBe(178);
    view.resize(390, 844);
    expect(view.camera.view?.offsetX).toBe(0);
  });
});
