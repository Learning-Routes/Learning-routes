import { at } from "@learning-routes/route-map/at-index";
import { Scene, Vector2, Vector3, WebGLRenderer } from "three";
import { MapCamera } from "./studio-camera";
import {
  type Branch,
  type MapStation,
  PLAN_STEP,
  SPREADS,
  type StudioMapOptions,
} from "./studio-map-types";
import {
  type Marker,
  Markers,
  makeChip,
  placeChip,
  placeMarkers,
  placeNote,
  strong,
} from "./studio-markers";
import { COLORS, type Road, Roads, reveal } from "./studio-roads";
import { lift, makeTerrain, trailBase } from "./studio-terrain";

// The assistant's map (Platform STEP 10): a night terrain with contour lines, the trail of what
// the creator decided, the forks of the question in front of them, and the route as it is planned
// and built. Loaded only after the page works without it. The page owns the words; this file only
// draws, and it draws labels as crisp page text anchored to the scene, never as textures.

export class StudioMap {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly roads = new Roads(this.scene);
  private readonly marks: Markers;
  private readonly walked: Vector2[] = [trailBase(0)];
  private shift = new Vector2();
  private walkRoad: Road | null = null;
  private walkTarget = 1;
  private branches: Branch[] = [];
  private planPoints: Vector2[] = [];
  private planMarkers: { marker: Marker; station: MapStation }[] = [];
  private planRoad: Road | null = null;
  private builtRoad: Road | null = null;
  private builtShown = 0;
  private builtTarget = 0;
  private readonly here: Marker;
  private readonly hereTarget = new Vector3();
  private readonly view = new MapCamera();
  private note: { element: HTMLElement; leader: HTMLElement; station: number } | null = null;
  private frame = 0;
  private last = performance.now();
  private readonly startMarker: Marker;

  constructor(private readonly options: StudioMapOptions) {
    this.marks = new Markers(options.overlay);
    this.renderer = new WebGLRenderer({ canvas: options.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(COLORS.casing, 1);
    this.scene.add(makeTerrain());
    const start = lift(at(this.walked, 0));
    this.startMarker = this.marks.add(start, "studio-mark-walk", options.startLabel);
    this.here = this.marks.add(start, "studio-mark-here", null);
    this.hereTarget.copy(start);
    this.view.follow(start, 1.6);
    this.view.arrive(new Vector3(10, 30, 20));
    this.resize();
    window.addEventListener("resize", this.resize);
    window.addEventListener("pointermove", this.view.onPointer);
    this.frame = requestAnimationFrame(this.tick);
  }

  /** The creator's first words, under the start of the trail. */
  setOpening(text: string) {
    const label = this.startMarker.element.querySelector(".studio-label");
    if (label) {
      label.replaceChildren(strong(this.options.startLabel), document.createTextNode(`«${text}»`));
    }
  }

  /** The question's choices, drawn as branches leaving the last stop. */
  fork(labels: readonly string[]) {
    this.clearFork();
    const from = at(this.walked, this.walked.length - 1);
    const next = trailBase(this.walked.length).add(this.shift);
    this.view.follow(lift(from.clone().lerp(next, 0.5)), 1);
    labels.forEach((label, index) => {
      const end = this.branchEnd(index, labels.length);
      const spread = at(SPREADS[labels.length] ?? [0], index);
      const middle = from
        .clone()
        .lerp(end, 0.5)
        .add(new Vector2(spread * 0.12, 0));
      const road = this.roads.make([from, middle, end], COLORS.plan, 2, true, 0.9);
      const chip = makeChip(label, {
        choose: () => this.options.onChoose(index),
        enter: () => this.options.onHot(index),
        leave: () => this.options.onHot(-1),
      });
      this.options.overlay.appendChild(chip);
      this.branches.push({ road, chip, end, anchor: lift(end, 0.4) });
    });
  }

  clearFork() {
    for (const branch of this.branches) {
      this.roads.drop(branch.road);
      branch.chip.remove();
    }
    this.branches = [];
  }

  /** Walks one branch of the fork, the one at `branch` of `branches`, and writes the decision. */
  walk(branch: number, branches: number, decision: string) {
    this.clearFork();
    const end = this.branchEnd(branch, branches);
    this.shift = end.clone().sub(trailBase(this.walked.length));
    this.walked.push(end);
    this.roads.drop(this.walkRoad);
    this.walkRoad = this.roads.make(this.walked, COLORS.walk, 3, true);
    this.walkRoad.shown = (this.walked.length - 2) / (this.walked.length - 1);
    this.walkTarget = 1;
    const stop = lift(end);
    this.marks.add(stop, "studio-mark-walk", decision);
    this.hereTarget.copy(stop);
    this.view.follow(stop, 1);
  }

  /** The planned route, continuing from the last stop. */
  setPlan(stations: readonly MapStation[]) {
    for (const { marker } of this.planMarkers) {
      this.marks.drop(marker);
    }
    this.roads.drop(this.planRoad);
    this.roads.drop(this.builtRoad);
    // A route with no module yet has no plan to draw: a road needs two points.
    if (stations.length === 0) {
      this.planRoad = null;
      this.builtRoad = null;
      this.planMarkers = [];
      this.planPoints = [];
      return;
    }
    const from = at(this.walked, this.walked.length - 1);
    const isRedraw = this.planPoints.length > 0;
    this.planPoints = [from];
    stations.forEach((_, index) => {
      const step = index + 1;
      this.planPoints.push(
        new Vector2(
          from.x + Math.sin(step * 0.6) * 7 + Math.sin(step * 0.23) * 5,
          from.y - step * PLAN_STEP,
        ),
      );
    });
    this.planRoad = this.roads.make(this.planPoints, COLORS.plan, 2, true, 0.85);
    this.planRoad.shown = isRedraw ? 1 : 0;
    // Drawn after the plan and above it, so the built line is never covered.
    this.builtRoad = this.roads.make(this.planPoints, COLORS.built, 4, false, 1, 4);
    this.builtRoad.shown = this.builtShown;
    this.planMarkers = stations.map((station, index) => ({
      station,
      marker: this.marks.add(
        lift(at(this.planPoints, index + 1)),
        this.stationClass(station, false),
        station.kind === "module" || station.isNew ? station.label : null,
        station.sublabel,
      ),
    }));
    this.options.overlay.appendChild(this.here.element);
    this.overview(0.5);
  }

  /** How many of the plan's stations are built: the green line grows to the last one. */
  setBuilt(stations: number) {
    if (this.planPoints.length < 2) {
      return;
    }
    const last = this.planPoints.length - 1;
    this.builtTarget = Math.min(1, stations / last);
    const head = Math.min(last, Math.max(1, stations));
    this.hereTarget.copy(lift(at(this.planPoints, head)));
    if (stations >= last) {
      this.overview(0.58);
    } else {
      this.view.follow(lift(at(this.planPoints, Math.max(1, head - 2))), 1.1);
    }
  }

  /** Pins a lesson's preview beside its station, with a thin leader line; null takes it away. */
  pinNote(element: HTMLElement, leader: HTMLElement, station: number | null) {
    this.note = station === null ? null : { element, leader, station };
    if (station !== null) {
      this.view.follow(
        lift(at(this.planPoints, Math.min(this.planPoints.length - 1, station + 1))),
        1.05,
      );
    }
  }

  setHot(branch: number) {
    this.branches.forEach((item, index) => {
      item.chip.classList.toggle("is-hot", index === branch);
      item.road.top.material.color.setHex(index === branch ? COLORS.gold : COLORS.plan);
    });
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("pointermove", this.view.onPointer);
    this.clearFork();
    for (const marker of [...this.marks.list]) {
      this.marks.drop(marker);
    }
    this.renderer.dispose();
  }

  private branchEnd(index: number, count: number) {
    const spread = at(SPREADS[count] ?? [0], Math.min(index, (SPREADS[count]?.length ?? 1) - 1));
    const next = trailBase(this.walked.length).add(this.shift);
    return next.add(new Vector2(spread, count === 3 && index === 1 ? -2 : 0));
  }

  private stationClass(station: MapStation, isBuilt: boolean) {
    const base = station.kind === "module" ? "studio-mark-ring" : "studio-mark-dot";
    return `${base}${isBuilt ? " is-built" : station.isNew ? " is-new" : ""}`;
  }

  private overview(at01: number) {
    const index = Math.round(at01 * (this.planPoints.length - 1));
    this.view.overview(lift(at(this.planPoints, index)));
  }

  private readonly resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.view.resize(width, height);
    this.roads.resize(width, height);
  };

  private readonly tick = (now: number) => {
    const seconds = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const still = this.options.isReducedMotion;
    const ease = (rate: number) => (still ? 1 : Math.min(1, seconds * rate));
    if (this.walkRoad) {
      this.walkRoad.shown += (this.walkTarget - this.walkRoad.shown) * ease(2.4);
      reveal(this.walkRoad, this.walkRoad.shown);
    }
    if (this.planRoad) {
      this.planRoad.shown += (1 - this.planRoad.shown) * ease(1.1);
      reveal(this.planRoad, this.planRoad.shown);
    }
    if (this.builtRoad) {
      this.builtShown += (this.builtTarget - this.builtShown) * ease(1.3);
      reveal(this.builtRoad, this.builtShown);
    }
    for (const branch of this.branches) {
      branch.road.shown += (1 - branch.road.shown) * ease(2.6);
      reveal(branch.road, branch.road.shown);
    }
    const last = this.planPoints.length - 1;
    this.planMarkers.forEach(({ marker, station }, index) => {
      const isBuilt = this.builtTarget > 0 && (index + 1) / last <= this.builtShown + 0.015;
      const dot = marker.element.firstElementChild;
      if (dot) {
        dot.className = this.stationClass(station, isBuilt);
      }
    });
    this.here.position.lerp(this.hereTarget, ease(2.6));
    this.view.update(seconds, still);
    this.place();
    this.renderer.render(this.scene, this.view.camera);
    this.frame = requestAnimationFrame(this.tick);
  };

  /** Moves the page-text markers, chips and the pinned preview to where the scene puts them. */
  private place() {
    const floor = this.options.floor();
    placeMarkers(this.marks.list, this.view.camera, floor);
    for (const branch of this.branches) {
      placeChip(branch.chip, branch.anchor, this.view.camera);
    }
    if (this.note) {
      const last = this.planPoints.length - 1;
      const anchor = lift(at(this.planPoints, Math.min(last, this.note.station + 1)));
      placeNote(this.note, anchor, this.view.camera, floor);
    }
  }
}
