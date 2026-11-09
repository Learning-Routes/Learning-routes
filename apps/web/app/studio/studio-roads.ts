import { CatmullRomCurve3, type Scene, Vector2, Vector3 } from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { lift } from "./studio-terrain";

// Lines on the assistant's map (Platform STEP 10), drawn like roads: a constant width in pixels and,
// for most, a dark casing under them. Each one is revealed from its start, for growth.

export const COLORS = {
  walk: 0xede6f5,
  plan: 0xb9abcb,
  built: 0x46b883,
  gold: 0xe9a23b,
  casing: 0x0d0913,
};

export interface Road {
  top: Line2;
  casing: Line2 | null;
  segments: number;
  shown: number;
}

/** Shows the first `fraction` of a road. */
export function reveal(road: Road, fraction: number) {
  const shown = Math.max(0, Math.floor(Math.min(1, fraction) * road.segments));
  road.top.geometry.instanceCount = shown;
  if (road.casing) {
    road.casing.geometry.instanceCount = shown;
  }
}

export class Roads {
  readonly materials: LineMaterial[] = [];

  constructor(private readonly scene: Scene) {}

  make(
    points: readonly Vector2[],
    color: number,
    width: number,
    hasCasing: boolean,
    opacity = 1,
    order = 2,
  ): Road {
    const curve = new CatmullRomCurve3(
      points.map((p) => new Vector3(p.x, 0, p.y)),
      false,
      "centripetal",
    );
    const count = Math.max(2, (points.length - 1) * 24);
    const flat: number[] = [];
    for (let i = 0; i <= count; i++) {
      const p = curve.getPoint(i / count);
      const lifted = lift(new Vector2(p.x, p.z));
      flat.push(lifted.x, lifted.y, lifted.z);
    }
    const casing = hasCasing ? this.line(flat, COLORS.casing, width + 5, 0.9) : null;
    if (casing) {
      casing.renderOrder = order - 1;
    }
    const top = this.line(flat, color, width, opacity);
    top.renderOrder = order;
    const road = { top, casing, segments: count, shown: 0 };
    reveal(road, 0);
    return road;
  }

  drop(road: Road | null) {
    if (!road) {
      return;
    }
    for (const line of [road.top, road.casing]) {
      if (line) {
        this.scene.remove(line);
        line.geometry.dispose();
        line.material.dispose();
        this.materials.splice(this.materials.indexOf(line.material), 1);
      }
    }
  }

  resize(width: number, height: number) {
    for (const material of this.materials) {
      material.resolution.set(width, height);
    }
  }

  private line(flat: number[], color: number, width: number, opacity: number) {
    const geometry = new LineGeometry();
    geometry.setPositions(flat);
    const material = new LineMaterial({
      color,
      linewidth: width,
      transparent: true,
      opacity,
      depthTest: false,
    });
    material.resolution.set(window.innerWidth, window.innerHeight);
    this.materials.push(material);
    const made = new Line2(geometry, material);
    made.computeLineDistances();
    this.scene.add(made);
    return made;
  }
}
