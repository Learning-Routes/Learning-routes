import { at } from "@learning-routes/route-map/at-index";
import {
  PANEL_WEIGHTS,
  PANELS,
  type RestingCamera,
} from "@learning-routes/route-map/landing-cameras";
import type { Point } from "@learning-routes/route-map/landing-curves";
import { buildLandingModel } from "@learning-routes/route-map/landing-model";
import { PCFShadowMap, SRGBColorSpace, WebGLRenderer } from "three";
import { buildLabels, type Labels, type Projector, showRoute } from "./labels";
import { placeNames } from "./name-frame";
import {
  listenToPage,
  markRoute,
  nextTask,
  projectorFor,
  radiusOn,
  undoStage,
} from "./page-wiring";
import { buildScene, type SceneParts } from "./scene";
import { activePanel, easedTime, panelOffset, storyTime } from "./story";
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
  rideWithSpots,
  roomFor,
  showPanel,
  stagePage,
} from "./texts";
import { applyTheme } from "./theme";

// The landing's stage, from v1's landing_stage_controller.js (STEP 41 §2). The text is server
// HTML and is already on screen; this adds the map behind it. Canvas and names are aria-hidden.

const HEADER = 64;

export class LandingStage {
  private readonly model = buildLandingModel();
  private readonly page: ReturnType<typeof stagePage>;
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
  private width = 0;
  private pinTop = 0;
  private totalWeight = PANEL_WEIGHTS.reduce((sum, weight) => sum + weight, 0);

  constructor(private readonly journey: HTMLElement) {
    this.page = stagePage(journey);
  }

  /** When anything fails the page goes back to its server HTML, as if this never ran. */
  async start() {
    try {
      await this.build();
    } catch (error) {
      this.dispose();
      undoStage(this.journey, this.page.panels);
      throw error;
    }
  }

  // Yields between its steps, and measures once the fonts are in.
  private async build() {
    await document.fonts.ready;
    const renderer = new WebGLRenderer({ canvas: this.page.canvas, antialias: true, alpha: true });
    this.renderer = renderer;
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    // three.js removed PCFSoftShadowMap in r182; PCFShadowMap is its soft filter now.
    renderer.shadowMap.type = PCFShadowMap;
    const isCoarse = window.matchMedia("(pointer: coarse)").matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isCoarse ? 1.5 : 2));
    await nextTask();
    this.parts = buildScene(this.model);
    this.project = projectorFor(this.parts.camera, this.page.stage);
    this.drawnRadius = radiusOn(this.project);
    this.labels = buildLabels(required(this.journey, ".lp-labels"), this.model, this.page.words);
    this.dots = buildPanelDots(
      this.page.dotsList,
      this.page.panels,
      (panel) => this.goToPanel(panel),
      this.listeners.signal,
    );
    this.setRoute(at(this.page.tabs, 0).dataset.route ?? "");
    await nextTask();
    this.journey.classList.add("lp-gl");
    holdHero(at(this.page.panels, 0), this.page.stage);
    this.width = this.page.stage.clientWidth;
    this.measure();
    renderer.setSize(this.page.stage.clientWidth, this.page.stage.clientHeight, false);
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
  }

  private async layOutOverTime() {
    const { clientWidth: width, clientHeight: height } = this.page.stage;
    this.texts = [];
    for (const [index, element] of this.page.panels.entries()) {
      const { text, rest } = layoutText(element, index, this.model, width, height);
      this.texts[index] = text;
      this.rest[index] = rest;
      await nextTask();
    }
  }

  private listen() {
    this.observer = listenToPage(this.journey, this.page.tabs, this.listeners.signal, {
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
      pickRoute: (key) => this.setRoute(key),
    });
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
    const route = this.page.routes[key];
    if (!route) {
      return;
    }
    showRoute(this.labels, route, this.page.words);
    markRoute(this.page.tabs, key);
  }

  private goToPanel(panel: number) {
    const y = this.pinTop + panelOffset(panel, PANEL_WEIGHTS) * this.stageHeight;
    window.scrollTo({ top: y, behavior: "smooth" });
  }

  private measure() {
    // The stage's own height: a phone's address bar moving must not move the story.
    this.stageHeight = this.page.stage.clientHeight;
    this.journey.style.height = `${this.totalWeight * this.stageHeight + this.stageHeight}px`;
    this.pinTop = this.journey.getBoundingClientRect().top + window.scrollY - HEADER;
  }

  private exactTime() {
    return storyTime((window.scrollY - this.pinTop) / this.stageHeight, PANEL_WEIGHTS);
  }

  private isPinned() {
    // iOS's rubber band scrolls above zero, and the hero must stay on show.
    const y = Math.max(0, window.scrollY);
    return y >= this.pinTop - 2 && y <= this.pinTop + this.totalWeight * this.stageHeight;
  }

  private resize() {
    const { clientWidth, clientHeight } = this.page.stage;
    if (!this.renderer || (clientWidth === this.width && clientHeight === this.stageHeight)) {
      return;
    }
    this.width = clientWidth;
    this.measure();
    this.renderer.setSize(this.page.stage.clientWidth, this.page.stage.clientHeight, false);
    ({ texts: this.texts, rest: this.rest } = layoutTexts(
      this.page.panels,
      this.model,
      clientWidth,
      clientHeight,
    ));
    this.frame();
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
    this.eased = easedTime(this.eased, time, delta);
    const s = this.eased;
    const story = updateStory(this.parts, this.model, s, now);
    this.previousQ = updateDoneRing(this.parts, this.ring, this.previousQ, story.q, delta);
    aimCamera(
      this.parts.camera,
      this.rest,
      s,
      this.page.stage.clientWidth / this.page.stage.clientHeight,
    );
    this.renderer.render(this.parts.scene, this.parts.camera);
    this.updateTexts(time, s, story);
  }

  // The text rides with its spot; then the controls and the names.
  private updateTexts(time: number, s: number, story: StoryState) {
    rideWithSpots(this.texts, this.project);
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
        anchorOf(this.model, shown.index, this.page.stage.clientWidth, story.token),
        this.project,
      );
    }
    this.page.top.classList.toggle("lp-on", pinned && s >= 0.9);
    this.page.dotsList.parentElement?.classList.toggle("lp-on", pinned && s >= 0.9);
    markCurrentDot(this.dots, Math.min(PANELS - 1, Math.floor(time)));
    placeNames({
      model: this.model,
      parts: this.parts,
      labels: this.labels,
      words: this.page.words,
      project: this.project,
      drawnRadius: this.drawnRadius,
      width: this.page.stage.clientWidth,
      s,
      story,
      placed: roomFor(this.page.stage.clientWidth, this.page.stage.clientHeight, shown),
    });
  }
}
