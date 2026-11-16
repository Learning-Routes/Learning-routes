import type { ReactElement } from "react";

// The drawings a hotspot question can name instead of an image (Platform STEP 12). Each is drawn in
// a 400×300 box; a creator's spots are fractions of it, so a drawing never moves its parts.

/** A disc brake seen from the side: rotor, hub, caliper, pads, piston and brake line. */
function DiscBrake() {
  const holes = Array.from({ length: 10 }, (_, i) => {
    const angle = (i / 10) * Math.PI * 2;
    return { x: 180 + Math.cos(angle) * 78, y: 160 + Math.sin(angle) * 78 };
  });
  const bolts = Array.from({ length: 5 }, (_, i) => {
    const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
    return { x: 180 + Math.cos(angle) * 30, y: 160 + Math.sin(angle) * 30 };
  });
  return (
    <svg viewBox="0 0 400 300" className="p-diagram" role="img" aria-hidden="true">
      <circle cx="180" cy="160" r="118" className="d-shade" />
      <circle cx="180" cy="160" r="112" className="d-metal" />
      <circle cx="180" cy="160" r="96" className="d-line" />
      {holes.map((h, i) => (
        <circle key={i} cx={h.x} cy={h.y} r="5" className="d-hole" />
      ))}
      <circle cx="180" cy="160" r="48" className="d-hub" />
      {bolts.map((b, i) => (
        <circle key={i} cx={b.x} cy={b.y} r="5.5" className="d-bolt" />
      ))}
      <circle cx="180" cy="160" r="12" className="d-hole" />
      <path
        d="M232 40 Q300 30 318 92 L326 150 Q330 176 300 180 L262 176 Q240 172 240 150 Z"
        className="d-caliper"
      />
      <rect
        x="252"
        y="66"
        width="14"
        height="96"
        rx="4"
        className="d-pad"
        transform="rotate(-14 259 114)"
      />
      <rect x="288" y="74" width="20" height="54" rx="6" className="d-piston" />
      <path d="M318 96 C350 92 360 70 384 64" className="d-hose" />
      <circle cx="384" cy="64" r="6" className="d-bolt" />
    </svg>
  );
}

const DIAGRAMS: Record<string, () => ReactElement> = { disc_brake: DiscBrake };

export function Diagram({ name }: { name: unknown }) {
  const Drawing = typeof name === "string" ? DIAGRAMS[name] : undefined;
  return Drawing ? <Drawing /> : null;
}
