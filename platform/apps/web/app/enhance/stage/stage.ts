import { at } from "@learning-routes/route-map/at-index";
import {
  PANEL_WEIGHTS,
  PANELS,
  type RestingCamera,
} from "@learning-routes/route-map/landing-cameras";
import type { Point } from "@learning-routes/route-map/landing-curves";
import { buildLandingModel } from "@learning-routes/route-map/landing-model";
import { PCFShadowMap, SRGBColorSpace, WebGLRenderer } from "three";
import {
  buildLabels,
  type ExampleRoute,
  type Labels,
  type Projector,
  type StageWords,
  showRoute,
} from "./labels";
import { placeNames } from "./name-frame";
import { listenToPage, nextTask, projectorFor, radiusOn } from "./page-wiring";
import { buildScene, type SceneParts } from "./scene";
import { activePanel, lerp, panelOffset, storyTime } from "./story";
import { aimCamera, type StoryState, updateDoneRing, updateStory } from "./story-frame";
import {
  anchorOf,
  buildPanelDots,
  drawLead,
  holdHero,
  layoutText,
  layoutTexts,
  markCurrentDot,
  type PanelText,
  required,
  roomFor,
  showPanel,
} from "./texts";
import { applyTheme } from "./theme";

// The landing's stage, from v1's landing_stage_controller.js (STEP 41 §2). The text is server
// HTML and is already on screen; this adds the map behind it. Canvas and names are aria-hidden.

const HEADER = 64;
const FALLOFF = 5.2;

export class LandingStage {
  private readonly model = buildLandingModel();
  private readonly stage: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly top: HTMLElement;
  private readonly dotsList: HTMLElement;
  private readonly tabs: HTMLButtonElement[];
  private readonly panels: HTMLElement[];
  private readonly routes: Record<string, ExampleRoute>;
  private readonly words: StageWords;
  private readonly listeners = new AbortController();
  private dots: HTMLButtonElement[] = [];
  private renderer: WebGLRenderer | null = null;
  private parts!: SceneParts;
  private project!: Projector;
  private drawnRadius!: (p: Point, radius: number) => number;
  private labels!: Labels;
  private texts: PanelText[] = [];
  private rest: RestingCamera[] = [];
  private observer: IntersectionObserver | null = null;
  private frameRequest = 0;
  private isOnScreen = true;
  private lastTime = 0;
  private eased = 0;
  private previousQ = 0;
  private readonly ring = { time: -1 };
  private active = -2;
  private stageHeight = 0;
  private pinTop = 0;
  private totalWeight = PANEL_WEIGHTS.reduce((sum, weight) => sum + weight, 0);

  constructor(private readonly journey: HTMLElement) {
    this.stage = required(journey, ".lp-stage");
    this.canvas = required(journey, ".lp-world");
    this.top = required(journey, ".lp-top");
    this.dotsList = required(journey, ".lp-vdots ol");
    this.tabs = [...journey.querySelectorAll<HTMLButtonElement>(".lp-opts button")];
    this.panels = [...journey.querySelectorAll<HTMLElement>(".lp-ann")];
    this.routes = JSON.parse(journey.dataset.routes ?? "{}");
    this.words = JSON.parse(journey.dataset.words ?? "{}");
  }

  /** Rejects when WebGL fails: the page then stays on its server HTML. Yields between steps. */
  async start() {
    const renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer = renderer;
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    // three.js removed PCFSoftShadowMap in r182; PCFShadowMap is its soft filter now.
    renderer.shadowMap.type = PCFShadowMap;
    const isCoarse = window.matchMedia("(pointer: coarse)").matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isCoarse ? 1.5 : 2));
    await nextTask();
    this.parts = buildScene(this.model);
    this.project = projectorFor(this.parts.camera, this.stage);
    this.drawnRadius = radiusOn(this.project);
    this.labels = buildLabels(required(this.journey, ".lp-labels"), this.model, this.words);
    this.dots = buildPanelDots(
      this.dotsList,
      this.panels,
      (panel) => this.goToPanel(panel),
      this.listeners.signal,
    );
    this.setRoute(at(this.tabs, 0).dataset.route ?? "");
    await nextTask();
    this.journey.classList.add("lp-gl");
    holdHero(at(this.panels, 0), this.stage);
    this.measure();
    renderer.setSize(this.stage.clientWidth, this.stage.clientHeight, false);
    this.eased = this.exactTime();
    this.lastTime = performance.now();
    applyTheme(this.parts, this.journey);
    await this.layOutOverTime();
    this.listen();
    renderer.compile(this.parts.scene, this.parts.camera);
    await nextTask();
    this.frame();
    this.loop();
    this.journey.dataset.stage = "on";
    void document.fonts.ready.then(() => {
      if (this.renderer) {
        this.measure();
        this.layoutTexts();
        this.frame();
      }
    });
  }

  private async layOutOverTime() {
    const { clientWidth: width, clientHeight: height } = this.stage;
    this.texts = [];
    for (const [index, element] of this.panels.entries()) {
      const { text, rest } = layoutText(element, index, this.model, width, height);
      this.texts[index] = text;
      this.rest[index] = rest;
      await nextTask();
    }
  }

  private listen() {
    this.observer = listenToPage(this.journey, this.listeners.signal, {
      setOnScreen: (isOnScreen) => {
        this.isOnScreen = isOnScreen;
        this.wake();
      },
      wake: () => this.wake(),
      resize: () => this.resize(),
      repaintTheme: () => {
        applyTheme(this.parts, this.journey);
        this.frame();
      },
      leave: (keepsPage) => (keepsPage ? this.stopLoop() : this.dispose()),
    });
    for (const tab of this.tabs) {
      tab.addEventListener("click", () => this.setRoute(tab.dataset.route ?? ""), {
        signal: this.listeners.signal,
      });
    }
  }

  private stopLoop() {
    cancelAnimationFrame(this.frameRequest);
    this.frameRequest = 0;
  }

  /** Dispose on navigation: every listener, the observer, the loop and the GL context. */
  dispose() {
    this.stopLoop();
    this.listeners.abort();
    this.observer?.disconnect();
    this.renderer?.dispose();
    this.renderer = null;
  }

  private setRoute(key: string) {
    const route = this.routes[key];
    if (!route) {
      return;
    }
    showRoute(this.labels, route, this.words);
    for (const tab of this.tabs) {
      tab.setAttribute("aria-pressed", String(tab.dataset.route === key));
    }
  }

  private goToPanel(panel: number) {
    const y = this.pinTop + panelOffset(panel, PANEL_WEIGHTS) * this.stageHeight;
    window.scrollTo({ top: y, behavior: "smooth" });
  }

  private measure() {
    this.stageHeight = window.innerHeight - HEADER;
    this.journey.style.height = `${this.totalWeight * this.stageHeight + this.stageHeight}px`;
    this.pinTop = this.journey.getBoundingClientRect().top + window.scrollY - HEADER;
  }

  private exactTime() {
    return storyTime((window.scrollY - this.pinTop) / this.stageHeight, PANEL_WEIGHTS);
  }

  private isPinned() {
    const y = window.scrollY;
    return y >= this.pinTop - 2 && y <= this.pinTop + this.totalWeight * this.stageHeight;
  }

  private resize() {
    this.measure();
    this.renderer?.setSize(this.stage.clientWidth, this.stage.clientHeight, false);
    this.layoutTexts();
    this.frame();
  }

  private layoutTexts() {
    const { clientWidth: width, clientHeight: height } = this.stage;
    const { texts, rest } = layoutTexts(this.panels, this.model, width, height);
    this.texts = texts;
    this.rest = rest;
  }

  private wake() {
    if (!this.frameRequest && this.renderer) {
      this.lastTime = performance.now();
      this.loop();
    }
  }

  // Pauses when the tab is hidden, the stage is off screen, or nothing on it is moving.
  private loop() {
    this.frameRequest = 0;
    if (!this.isOnScreen || document.hidden || !this.renderer) {
      return;
    }
    this.frame();
    const isMoving =
      this.eased !== this.exactTime() || this.parts.pin.visible || this.ring.time >= 0;
    if (isMoving) {
      this.frameRequest = requestAnimationFrame(() => this.loop());
    }
  }

  private frame() {
    if (!this.renderer) {
      return;
    }
    const now = performance.now();
    const delta = Math.min(1 / 30, (now - this.lastTime) / 1000);
    this.lastTime = now;
    const time = this.exactTime();
    this.eased = lerp(this.eased, time, 1 - Math.exp(-FALLOFF * delta));
    if (Math.abs(this.eased - time) < 1e-4) {
      this.eased = time;
    }
    const s = this.eased;
    const story = updateStory(this.parts, this.model, s, now);
    this.previousQ = updateDoneRing(this.parts, this.ring, this.previousQ, story.q, delta);
    aimCamera(this.parts.camera, this.rest, s, this.stage.clientWidth / this.stage.clientHeight);
    this.renderer.render(this.parts.scene, this.parts.camera);
    this.updateTexts(time, s, story);
  }

  // The text rides with its spot; then the controls and the names.
  private updateTexts(time: number, s: number, story: StoryState) {
    for (const text of this.texts) {
      const seen = this.project(text.anchor);
      text.x = seen.x;
      text.y = seen.y;
      text.element.style.transform = `translate(${seen.x.toFixed(1)}px, ${seen.y.toFixed(1)}px)`;
    }
    const pinned = this.isPinned();
    const panel = activePanel(time, pinned, PANELS);
    if (panel !== this.active) {
      this.active = panel;
      showPanel(this.texts, panel);
    }
    const shown = this.texts[this.active];
    if (this.active > 0 && shown) {
      drawLead(
        shown,
        anchorOf(this.model, shown.index, this.stage.clientWidth, story.token),
        this.project,
      );
    }
    this.top.classList.toggle("lp-on", pinned && s >= 0.9);
    this.dotsList.parentElement?.classList.toggle("lp-on", pinned && s >= 0.9);
    markCurrentDot(this.dots, Math.min(PANELS - 1, Math.floor(time)));
    placeNames({
      model: this.model,
      parts: this.parts,
      labels: this.labels,
      words: this.words,
      project: this.project,
      drawnRadius: this.drawnRadius,
      width: this.stage.clientWidth,
      s,
      story,
      placed: roomFor(this.stage.clientWidth, this.stage.clientHeight, shown),
    });
  }
}
