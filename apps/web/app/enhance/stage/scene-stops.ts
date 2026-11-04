import type { Point } from "@learning-routes/route-map/landing-curves";
import type { LandingModel } from "@learning-routes/route-map/landing-model";
import {
  BoxGeometry,
  CurvePath,
  CylinderGeometry,
  Group,
  LineCurve3,
  type Material,
  Mesh,
  RingGeometry,
  type Scene,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from "three";
import type { Materials } from "./materials";

// The stops on the map: steps, exams, extra practice, module discs and the pin.

const STEP_HEIGHT = 0.16;
const cylinder = (radius: number, height: number) =>
  new CylinderGeometry(radius, radius, height, 48);
const torus = (radius: number, thickness: number) => {
  const geometry = new TorusGeometry(radius, thickness, 8, 64);
  geometry.rotateX(Math.PI / 2);
  return geometry;
};
const groupAt = ({ x, y, z }: Point) => {
  const group = new Group();
  group.position.set(x, y, z);
  return group;
};
const dot = () => new SphereGeometry(0.05, 8, 6);

function dottedRing(count: number, radius: number, material: Material) {
  const ring = new Group();
  const geometry = dot();
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const mesh = new Mesh(geometry, material);
    mesh.position.set(Math.cos(angle) * radius, 0.11, Math.sin(angle) * radius);
    ring.add(mesh);
  }
  return ring;
}

function checkGeometry() {
  const path = new CurvePath<Vector3>();
  path.add(new LineCurve3(new Vector3(-0.19, 0, 0.01), new Vector3(-0.06, 0, 0.14)));
  path.add(new LineCurve3(new Vector3(-0.06, 0, 0.14), new Vector3(0.2, 0, -0.13)));
  return new TubeGeometry(path, 8, 0.04, 6, false);
}

type StopState = "" | "todo" | "cur" | "done";
export type StepStop = {
  isExam: boolean;
  moduleIndex: number;
  position: Point;
  ring: Mesh;
  fill: Mesh;
  check: Mesh;
  current: Mesh;
  state: StopState;
};

const turnedIfExam = (mesh: Mesh, isExam: boolean) => {
  if (isExam) {
    mesh.rotation.y = Math.PI / 4;
  }
  return mesh;
};

function addStep(
  scene: Scene,
  materials: Materials,
  check: TubeGeometry,
  stop: Pick<StepStop, "position" | "moduleIndex" | "isExam">,
): StepStop {
  const { isExam } = stop;
  const shape = (box: number, radius: number, height: number) =>
    isExam ? new BoxGeometry(box, height, box) : cylinder(radius, height);
  const ringShape = () => (isExam ? new BoxGeometry(1.0, 0.04, 1.0) : torus(0.55, 0.032));
  const body = turnedIfExam(new Mesh(shape(0.92, 0.55, STEP_HEIGHT), materials.node), isExam);
  body.position.y = STEP_HEIGHT / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  const ring = turnedIfExam(new Mesh(ringShape(), materials.ring), isExam);
  ring.position.y = isExam ? STEP_HEIGHT - 0.01 : STEP_HEIGHT + 0.005;
  const fill = turnedIfExam(
    new Mesh(shape(0.96, 0.57, STEP_HEIGHT + 0.03), materials.route),
    isExam,
  );
  fill.position.y = (STEP_HEIGHT + 0.03) / 2;
  fill.castShadow = true;
  fill.visible = false;
  const checkMark = new Mesh(check, materials.check);
  checkMark.position.y = STEP_HEIGHT + 0.05;
  checkMark.visible = false;
  const currentShape = isExam ? new BoxGeometry(1.08, 0.06, 1.08) : torus(0.6, 0.055);
  const current = turnedIfExam(new Mesh(currentShape, materials.signal), isExam);
  current.position.y = STEP_HEIGHT + 0.01;
  current.visible = false;
  const group = groupAt(stop.position);
  group.add(body, ring, fill, checkMark, current);
  scene.add(group);
  return { ...stop, ring, fill, check: checkMark, current, state: "" };
}

function addExtraStop(scene: Scene, materials: Materials, position: Point) {
  const group = groupAt(position);
  const body = new Mesh(cylinder(0.32, 0.1), materials.node);
  body.position.y = 0.05;
  body.castShadow = true;
  const center = new Mesh(new SphereGeometry(0.08, 12, 8), materials.extra);
  center.position.y = 0.12;
  const fill = new Mesh(cylinder(0.34, 0.13), materials.extra);
  fill.position.y = 0.065;
  fill.visible = false;
  group.add(body, dottedRing(12, 0.33, materials.extra), center, fill);
  scene.add(group);
  return { group, fill, position };
}

function addDisc(scene: Scene, materials: Materials, position: Point, isLocked: boolean) {
  const group = groupAt(position);
  const body = new Mesh(cylinder(0.82, 0.22), materials.node);
  body.position.y = 0.11;
  body.castShadow = true;
  const material = isLocked ? materials.lock : materials.route;
  const outer = new Mesh(torus(0.82, 0.04), material);
  outer.position.y = 0.225;
  const inner = new Mesh(torus(0.56, 0.03), material);
  inner.position.y = 0.225;
  group.add(body, outer, inner);
  scene.add(group);
}

function addMaskedStop(scene: Scene, materials: Materials, position: Point) {
  const group = groupAt(position);
  const body = new Mesh(cylinder(0.48, 0.1), materials.node);
  body.position.y = 0.05;
  group.add(body, dottedRing(16, 0.5, materials.lock));
  scene.add(group);
}

function addPin(scene: Scene, materials: Materials) {
  const pin = new Group();
  const stem = new Mesh(new CylinderGeometry(0.025, 0.025, 0.62, 8), materials.ink);
  stem.position.y = 0.31;
  const head = new Mesh(new SphereGeometry(0.2, 24, 16), materials.signal);
  head.position.y = 0.76;
  head.castShadow = true;
  const pulse = new Mesh(new RingGeometry(0.3, 0.36, 48), materials.signalFlat);
  pulse.rotation.x = -Math.PI / 2;
  pulse.position.y = 0.02;
  pin.add(stem, head, pulse);
  scene.add(pin);
  return { pin, pulse };
}

export function addStops(scene: Scene, model: LandingModel, materials: Materials) {
  const [first, second, third] = model.modules;
  for (const module of model.modules) {
    addDisc(scene, materials, module.disc, module.isLocked);
  }
  const check = checkGeometry();
  const step = (moduleIndex: number, examAt: number) => (position: Point, i: number) =>
    addStep(scene, materials, check, { position, moduleIndex, isExam: i === examAt });
  const steps = [...first.heads.map(step(0, 5)), ...second.heads.map(step(1, 4))];
  for (const head of third.heads) {
    addMaskedStop(scene, materials, head);
  }
  const extraStops = model.extra.stops.map((p) => addExtraStop(scene, materials, p));
  const doneRing = new Mesh(new RingGeometry(0.7, 0.78, 64), materials.doneRing);
  doneRing.rotation.x = -Math.PI / 2;
  const exam = model.examPosition;
  doneRing.position.set(exam.x, exam.y + 0.05, exam.z);
  scene.add(doneRing);
  return { steps, extraStops, doneRing, ...addPin(scene, materials) };
}
export type StopParts = ReturnType<typeof addStops>;
