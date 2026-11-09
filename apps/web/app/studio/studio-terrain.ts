import { Mesh, PlaneGeometry, ShaderMaterial, Vector2, Vector3 } from "three";

// The assistant map's ground (Platform STEP 10): smooth noise for height, real contour lines drawn
// from that height, and the trail's own coordinates on it.

const STEP_DEPTH = 9;

function hash(x: number, z: number) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function valueNoise(x: number, z: number) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi);
  const b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1);
  const d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** The terrain's height: three octaves of smooth noise, gentle enough for a trail. */
function heightAt(x: number, z: number) {
  let sum = 0;
  let amplitude = 1;
  let frequency = 0.028;
  for (let octave = 0; octave < 3; octave++) {
    sum += amplitude * (valueNoise(x * frequency + 11.3, z * frequency - 4.7) - 0.5);
    amplitude *= 0.45;
    frequency *= 2.1;
  }
  return sum * 9;
}
/** Where the trail's i-th stop would be, before any fork moved it. */
export function trailBase(index: number) {
  return new Vector2(Math.sin(index * 0.5) * 6 + Math.sin(index * 0.17) * 4, -index * STEP_DEPTH);
}
export const lift = (point: Vector2, up = 0.3) =>
  new Vector3(point.x, heightAt(point.x, point.y) + up, point.y);

const TERRAIN_VERTEX = `varying float vHeight; varying vec3 vNormal2; varying float vDepth;
void main(){ vec4 world=modelMatrix*vec4(position,1.); vHeight=world.y; vNormal2=normal;
  vec4 view=viewMatrix*world; vDepth=-view.z; gl_Position=projectionMatrix*view; }`;
const TERRAIN_FRAGMENT = `varying float vHeight; varying vec3 vNormal2; varying float vDepth;
float contour(float v,float w){ float f=abs(fract(v-.5)-.5)/fwidth(v); return 1.-smoothstep(0.,w,f); }
void main(){
  float shade=clamp(dot(normalize(vNormal2),normalize(vec3(-.6,.7,.4)))*.9+.1,0.,1.);
  vec3 c=mix(vec3(.036,.026,.052),vec3(.115,.086,.150),shade)*mix(.85,1.15,smoothstep(-4.,4.,vHeight));
  c=mix(c,vec3(.20,.155,.26),contour(vHeight,1.)*.7);
  c=mix(c,vec3(.34,.27,.44),contour(vHeight*.2,1.2)*.9);
  c=mix(c,vec3(.051,.035,.075),clamp(1.-exp(-vDepth*.006),0.,1.));
  gl_FragColor=vec4(c,1.);
}`;

/** The night terrain: its contours come from its own height, lit by a low moon. */
export function makeTerrain() {
  const ground = new PlaneGeometry(320, 320, 260, 260);
  ground.rotateX(-Math.PI / 2);
  ground.translate(0, 0, -80);
  const positions = ground.attributes.position;
  if (positions) {
    for (let i = 0; i < positions.count; i++) {
      positions.setY(i, heightAt(positions.getX(i), positions.getZ(i)));
    }
  }
  ground.computeVertexNormals();
  return new Mesh(
    ground,
    new ShaderMaterial({ vertexShader: TERRAIN_VERTEX, fragmentShader: TERRAIN_FRAGMENT }),
  );
}
