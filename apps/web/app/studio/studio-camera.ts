import { PerspectiveCamera, Vector3 } from "three";

// The assistant map's camera (Platform STEP 10): a tilted map view that eases toward where the work
// is, and leans a little with the pointer. Under reduced motion it moves at once.

export class MapCamera {
  readonly camera = new PerspectiveCamera(30, 1, 1, 600);
  private readonly target = { position: new Vector3(), look: new Vector3() };
  private readonly look = new Vector3();
  private readonly pointer = { x: 0, y: 0 };

  /** Close behind a point, the point a little above the middle of the screen. */
  follow(point: Vector3, distance: number) {
    this.target.position.set(
      point.x + 4 * distance,
      point.y + 46 * distance,
      point.z + 46 * distance,
    );
    this.target.look.set(point.x, point.y, point.z + 4 * distance);
  }

  /** High over a point, leaving room below for the subtitles. */
  overview(point: Vector3) {
    const distance = 2;
    this.target.position.set(
      point.x + 4 * distance,
      point.y + 46 * distance,
      point.z + 46 * distance,
    );
    this.target.look.set(point.x, point.y, point.z + 13 * distance);
  }

  /** Starts above where it will settle, so the first view arrives. */
  arrive(offset: Vector3) {
    this.camera.position.copy(this.target.position).add(offset);
    this.look.copy(this.target.look);
  }

  readonly onPointer = (event: PointerEvent) => {
    this.pointer.x = event.clientX / window.innerWidth - 0.5;
    this.pointer.y = event.clientY / window.innerHeight - 0.5;
  };

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.fov = width < 720 ? 42 : 30;
    this.camera.updateProjectionMatrix();
  }

  update(seconds: number, isStill: boolean) {
    const settle = (isStill ? 1 : 1 - 0.08 ** seconds) * 0.5;
    const lean = new Vector3(this.pointer.x * 4, -this.pointer.y * 3, 0);
    this.camera.position.lerp(this.target.position.clone().add(lean), settle);
    this.look.lerp(this.target.look, settle);
    this.camera.lookAt(this.look);
  }
}
