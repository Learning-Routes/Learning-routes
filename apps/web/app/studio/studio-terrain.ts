import { Mesh, PlaneGeometry, ShaderMaterial, Vector2, Vector3 } from "three";

// The assistant map's ground (Platform STEP 10): a smooth relief, and its contour lines drawn per
// pixel from the same height, so they stay fine and round at any distance. The hash is integer
// arithmetic, identical here and in the shader, so the lines sit exactly on the mesh.

const STEP_DEPTH = 9;
/** Noise cells per world unit, and how tall the relief stands. */
const SCALE = 0.028;
const RELIEF = 10;
/** Three layers of detail: broad hills, no wrinkles. The shader uses the same count. */
const OCTAVES = 3;

function hash(x: number, z: number) {
  let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) & 0xffffff) / 16777215;
}
function valueNoise(x: number, z: number) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
  const v = zf * zf * zf * (zf * (zf * 6 - 15) + 10);
  const top = hash(xi, zi) + (hash(xi + 1, zi) - hash(xi, zi)) * u;
  const bottom = hash(xi, zi + 1) + (hash(xi + 1, zi + 1) - hash(xi, zi + 1)) * u;
  return top + (bottom - top) * v;
}
function fbm(x: number, z: number) {
  let sum = 0;
  let amplitude = 1;
  let frequency = 1;
  for (let octave = 0; octave < OCTAVES; octave++) {
    sum +=
      (valueNoise(x * frequency + octave * 17.3, z * frequency - octave * 9.1) - 0.5) * amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum;
}
/** The terrain's height: warped noise, flatter along the trail so the road reads clearly. */
function heightAt(x: number, z: number) {
  const warpX = fbm(x * SCALE * 0.6 + 3.1, z * SCALE * 0.6);
  const warpZ = fbm(x * SCALE * 0.6 - 5.2, z * SCALE * 0.6 + 1.7);
  const corridor = 0.4 + 0.6 * Math.min(1, Math.abs(x) / 36);
  return fbm(x * SCALE + warpX * 0.9, z * SCALE + warpZ * 0.9) * RELIEF * corridor;
}
/** Where the trail's i-th stop would be, before any fork moved it. */
export function trailBase(index: number) {
  return new Vector2(Math.sin(index * 0.5) * 6 + Math.sin(index * 0.17) * 4, -index * STEP_DEPTH);
}
export const lift = (point: Vector2, up = 0.3) =>
  new Vector3(point.x, heightAt(point.x, point.y) + up, point.y);

const TERRAIN_VERTEX = `varying vec3 vWorld; varying vec3 vNormal2; varying float vDepth;
void main(){ vec4 world=modelMatrix*vec4(position,1.); vWorld=world.xyz; vNormal2=normal;
  vec4 view=viewMatrix*world; vDepth=-view.z; gl_Position=projectionMatrix*view; }`;
// The same height as heightAt, per pixel; then a hairline every half unit and a stronger one every
// two and a half, faded where they would crowd together and with distance.
const TERRAIN_FRAGMENT = `varying vec3 vWorld; varying vec3 vNormal2; varying float vDepth;
float hf(ivec2 p){ uint h=uint(p.x)*374761393u+uint(p.y)*668265263u; h=(h^(h>>13u))*1274126177u; h^=h>>16u;
  return float(h&0xffffffu)/16777215.; }
float vn(vec2 p){ vec2 i=floor(p),f=p-i; vec2 u=f*f*f*(f*(f*6.-15.)+10.); ivec2 c=ivec2(i);
  return mix(mix(hf(c),hf(c+ivec2(1,0)),u.x),mix(hf(c+ivec2(0,1)),hf(c+ivec2(1,1)),u.x),u.y); }
float fbm(vec2 p){ float s=0.,a=1.,f=1.; for(int o=0;o<${OCTAVES};o++){ s+=(vn(p*f+vec2(float(o)*17.3,-float(o)*9.1))-.5)*a; a*=.5; f*=2.; } return s; }
float heightAt(vec2 q){ float k=${SCALE.toFixed(4)}; vec2 w=vec2(fbm(q*k*.6+vec2(3.1,0.)),fbm(q*k*.6+vec2(-5.2,1.7)));
  return fbm(q*k+w*.9)*${RELIEF.toFixed(1)}*(.4+.6*min(1.,abs(q.x)/36.)); }
float iso(float v,float px){ float fw=max(fwidth(v),1e-5); float d=abs(fract(v-.5)-.5)/fw;
  return (1.-smoothstep(px*.5,px*.5+1.,d))*(1.-smoothstep(.08,.22,fw)); }
void main(){
  float h=heightAt(vWorld.xz);
  float light=clamp(dot(normalize(vNormal2),normalize(vec3(-.6,.7,.4))),0.,1.);
  vec3 c=mix(vec3(.040,.030,.058),vec3(.120,.092,.160),smoothstep(-7.,7.,h))*(.6+.8*light);
  float near=exp(-pow(vDepth*.0042,2.));
  c=mix(c,vec3(.70,.63,.88),max(iso(h*2.,.6)*.09,iso(h*.4,.9)*.26)*(.35+.65*near));
  c=mix(c,vec3(.051,.035,.075),clamp(1.-exp(-vDepth*.006),0.,1.));
  c+=(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5)/255.;
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
