import { at } from "@learning-routes/route-map/at-index";
import { FIELD_OF_VIEW } from "@learning-routes/route-map/landing-cameras";
import type { LandingCurve } from "@learning-routes/route-map/landing-curves";
import {
  type LandingModel,
  SHEET_THICKNESS,
  SHEET_X,
} from "@learning-routes/route-map/landing-model";
import {
  BoxGeometry,
  ConeGeometry,
  Curve,
  DirectionalLight,
  ExtrudeGeometry,
  Fog,
  HemisphereLight,
  InstancedMesh,
  type Material,
  Mesh,
  Object3D,
  OctahedronGeometry,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Shape,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from "three";
import { buildMaterials, type Materials } from "./materials";
import { addStops, type StopParts } from "./scene-stops";

// The scale model, from v1's landing_stage_controller.js (STEP 41 §2): sheets with thickness,
// the route as a track with a bright line and a glow, stops, and the pin.

const clamp = (value: number) => Math.min(1, Math.max(0, value));
// TubeGeometry with 8 radial segments: 48 indices per length segment.
const INDICES_PER_SEGMENT = 48;

class CurveOf extends Curve<Vector3> {
  constructor(private readonly curve: LandingCurve) {
    super();
  }
  override getPoint(t: number, target = new Vector3()) {
    const { x, y, z } = this.curve.getPoint(t);
    return target.set(x, y, z);
  }
}

export type Tube = { mesh: Mesh; segments: number; length: number };

/** Shows the part of a tube from a to b, as fractions of its length. */
export function showTube({ mesh, segments }: Tube, a: number, b: number) {
  const first = Math.floor(clamp(a) * segments);
  const last = Math.ceil(clamp(b) * segments);
  mesh.visible = last > first;
  mesh.geometry.setDrawRange(
    first * INDICES_PER_SEGMENT,
    Math.max(0, last - first) * INDICES_PER_SEGMENT,
  );
}

export type Leg = {
  curve: LandingCurve;
  moduleIndex: number;
  track: Tube;
  bright: Tube;
  glow: Tube;
  length: number;
  start: number;
};

function roundedRectangle(width: number, height: number, radius: number) {
  const shape = new Shape();
  shape.moveTo(radius, 0);
  shape.lineTo(width - radius, 0);
  shape.quadraticCurveTo(width, 0, width, radius);
  shape.lineTo(width, height - radius);
  shape.quadraticCurveTo(width, height, width - radius, height);
  shape.lineTo(radius, height);
  shape.quadraticCurveTo(0, height, 0, height - radius);
  shape.lineTo(0, radius);
  shape.quadraticCurveTo(0, 0, radius, 0);
  return shape;
}

function addCornerTicks(scene: Scene, module: LandingModel["modules"][number], material: Material) {
  const [left, right] = SHEET_X;
  const across = new BoxGeometry(0.8, 0.02, 0.05);
  const along = new BoxGeometry(0.05, 0.02, 0.8);
  const corners = [
    [left + 0.45, module.top + 0.45, 1, 1],
    [right - 0.45, module.top + 0.45, -1, 1],
    [left + 0.45, module.bottom - 0.45, 1, -1],
    [right - 0.45, module.bottom - 0.45, -1, -1],
  ] as const;
  for (const [x, z, sideX, sideZ] of corners) {
    const a = new Mesh(across, material);
    a.position.set(x + sideX * 0.375, module.surfaceY + 0.015, z);
    const b = new Mesh(along, material);
    b.position.set(x, module.surfaceY + 0.015, z + sideZ * 0.375);
    scene.add(a, b);
  }
}

// Three sheets with thickness and corner ticks; the last one locked and translucent.
function addSheets(scene: Scene, model: LandingModel, materials: Materials) {
  const [left, right] = SHEET_X;
  for (const module of model.modules) {
    const geometry = new ExtrudeGeometry(
      roundedRectangle(right - left, module.bottom - module.top, 0.9),
      {
        depth: SHEET_THICKNESS,
        bevelEnabled: true,
        bevelThickness: 0.035,
        bevelSize: 0.035,
        bevelSegments: 2,
        curveSegments: 10,
      },
    );
    const mesh = new Mesh(geometry, module.isLocked ? materials.panelLocked : materials.panel);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(left, module.surfaceY, module.top);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (!module.isLocked) {
      addCornerTicks(scene, module, materials.route);
    }
  }
}

function addLights(scene: Scene) {
  const sky = new HemisphereLight(0xffffff, 0x888888, 1);
  const sun = new DirectionalLight(0xffffff, 1);
  sun.position.set(-14, 30, 16);
  sun.target.position.set(9.6, 0, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -27,
    right: 27,
    top: 27,
    bottom: -27,
    near: 1,
    far: 100,
  });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sky, sun, sun.target);
  return { sky, sun };
}

function addTube(
  scene: Scene,
  curve: LandingCurve,
  radius: number,
  material: Material,
  perUnit = 9,
): Tube {
  const length = curve.getLength();
  const segments = Math.max(8, Math.ceil(length * perUnit));
  const mesh = new Mesh(new TubeGeometry(new CurveOf(curve), segments, radius, 8, false), material);
  scene.add(mesh);
  return { mesh, segments, length };
}

const dotGeometry = () => new SphereGeometry(0.05, 8, 6);

function addDotted(
  scene: Scene,
  curve: LandingCurve,
  gap: number,
  material: Material,
  lift: number,
) {
  const count = Math.max(2, Math.floor(curve.getLength() / gap));
  const dots = new InstancedMesh(dotGeometry(), material, count + 1);
  const holder = new Object3D();
  for (let i = 0; i <= count; i++) {
    const p = curve.getPointAt(i / count);
    holder.position.set(p.x, p.y + lift, p.z);
    holder.updateMatrix();
    dots.setMatrixAt(i, holder.matrix);
  }
  scene.add(dots);
  return dots;
}

function addRoute(scene: Scene, model: LandingModel, materials: Materials) {
  let sum = 0;
  const legs: Leg[] = model.route.map(({ curve, moduleIndex }) => {
    const bright = addTube(scene, curve, 0.075, materials.route);
    const glow = addTube(scene, curve, 0.24, materials.glow, 4);
    bright.mesh.castShadow = true;
    showTube(bright, 0, 0);
    showTube(glow, 0, 0);
    const leg = {
      curve,
      moduleIndex,
      track: addTube(scene, curve, 0.035, materials.track),
      bright,
      glow,
      length: bright.length,
      start: sum,
    };
    sum += bright.length;
    return leg;
  });
  return { legs, routeLength: sum };
}

function addChevrons(scene: Scene, model: LandingModel, legs: Leg[], materials: Materials) {
  const [first, second] = model.modules;
  const geometry = new ConeGeometry(0.1, 0.28, 10);
  geometry.rotateZ(-Math.PI / 2);
  const entrances = [at(first.legs, 0), at(second.legs, 0)];
  const spineCurves = new Set(
    model.route.filter(({ isSpine }) => isSpine).map(({ curve }) => curve),
  );
  return legs
    .filter(
      (leg) => leg.moduleIndex < 2 && !spineCurves.has(leg.curve) && !entrances.includes(leg.curve),
    )
    .map((leg) => {
      const p = leg.curve.getPointAt(0.5);
      const t = leg.curve.getTangentAt(0.5);
      const mesh = new Mesh(geometry, materials.track);
      mesh.position.set(p.x, p.y + 0.05, p.z);
      mesh.rotation.y = Math.atan2(-t.z, t.x);
      scene.add(mesh);
      return { mesh, leg };
    });
}

export function buildScene(model: LandingModel) {
  const scene = new Scene();
  const camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, 0.5, 600);
  const { sky, sun } = addLights(scene);
  scene.fog = new Fog(0xffffff, 110, 230);
  const fog = scene.fog;
  const materials = buildMaterials();
  const ground = new Mesh(new PlaneGeometry(500, 500), materials.shadow);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(9.6, -1.4, 12);
  ground.receiveShadow = true;
  scene.add(ground);
  addSheets(scene, model, materials);
  const { legs, routeLength } = addRoute(scene, model, materials);
  const extraDots = model.extra.traces.map((t) => addDotted(scene, t, 0.24, materials.extra, 0.04));
  const extraLine = addTube(scene, at(model.extra.traces, 0), 0.055, materials.extra);
  extraLine.mesh.visible = false;
  for (const leg of legs.filter(({ moduleIndex }) => moduleIndex === 2)) {
    leg.track.mesh.visible = false;
    addDotted(scene, leg.curve, 0.4, materials.lock, 0.04);
  }
  const chevrons = addChevrons(scene, model, legs, materials);
  const stops: StopParts = addStops(scene, model, materials);
  const origin = new Mesh(new OctahedronGeometry(0.32), materials.route);
  origin.scale.set(1, 1.25, 1);
  origin.position.set(model.origin.x, model.origin.y + 0.42, model.origin.z);
  origin.castShadow = true;
  scene.add(origin);
  return {
    scene,
    camera,
    sky,
    sun,
    fog,
    materials,
    legs,
    routeLength,
    extraDots,
    extraLine,
    chevrons,
    ...stops,
  };
}
export type SceneParts = ReturnType<typeof buildScene>;
