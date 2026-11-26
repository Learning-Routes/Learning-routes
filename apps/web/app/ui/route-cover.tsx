import { useId } from "react";

// A route's cover: its own picture when it has one (see workers/voice.ts), over what is drawn
// here when it has none: drawn from the route's id, so each route keeps its
// own look everywhere it appears. Hills at dusk in the route's own hue, and its path across them.
// With the route's title it also says its subject: the title's first telling word, on a card.
// Everything is an SVG attribute; nothing here needs a style, so the strict CSP is untouched.

const HUES = [268, 204, 162, 338, 232, 186, 300, 12];

function seedOf(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** A small deterministic generator: the same seed draws the same cover. */
function rolls(seed: number) {
  let state = seed || 1;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507) >>> 0;
    state = Math.imul(state ^ (state >>> 13), 3266489909) >>> 0;
    state = (state ^ (state >>> 16)) >>> 0;
    return state / 4294967296;
  };
}

function ridge(roll: () => number, base: number, swing: number) {
  let d = `M0 ${base}`;
  for (let x = 0; x <= 400; x += 50) {
    const y = base - roll() * swing;
    d += ` Q${x + 25} ${(y - swing * 0.35).toFixed(1)} ${x + 50} ${y.toFixed(1)}`;
  }
  return `${d} V300 H0 Z`;
}

const NOT_ID = /[^a-zA-Z0-9]/g;
const WORD = /[\p{L}\p{N}]{4,}/u;

/** The first word of a title that says something: "Guitarra" of "Guitarra desde cero". */
function subjectOf(title: string | undefined) {
  const word = title?.match(WORD)?.[0] ?? "";
  return word.length > 12 ? "" : word;
}

export function RouteCover({
  seed,
  title,
  wide = false,
  className = "",
}: {
  seed: string;
  /** The route's title, in the reader's language. */
  title?: string;
  /** For a banner much wider than tall: shows the middle band, and a smaller card inside it. */
  wide?: boolean;
  className?: string;
}) {
  const subject = subjectOf(title);
  const cardWidth = 44 + subject.length * 17;
  const n = seedOf(seed);
  const roll = rolls(n);
  const hue = HUES[n % HUES.length] ?? 268;
  const warm = (hue + 40) % 360;
  // One route's cover can be on a page more than once, and a hidden copy must not own the
  // gradient the others point to: each drawing names its own.
  const id = `rc${useId().replace(NOT_ID, "")}`;
  const scale = wide ? 0.72 : 1;
  const cardX = 372 - cardWidth * scale;
  const cardY = 150 - 43 * scale;
  const sunX = 90 + roll() * 220;
  const sunY = 70 + roll() * 60;
  const far = ridge(roll, 190, 60);
  const mid = ridge(roll, 225, 50);
  const near = ridge(roll, 262, 36);
  const y1 = 250 - roll() * 30;
  const y2 = 150 + roll() * 40;
  const path = `M-10 ${y1.toFixed(0)} C 90 ${(y1 - 70).toFixed(0)}, 150 ${(y2 + 90).toFixed(0)}, 230 ${y2.toFixed(0)} S 360 ${(y2 - 60).toFixed(0)}, 410 ${(y2 - 20).toFixed(0)}`;
  return (
    <svg
      className={`route-cover ${className}`.trim()}
      viewBox={wide ? "0 60 400 180" : "0 0 400 300"}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={`hsl(${hue} 62% 26%)`} />
          <stop offset="0.55" stopColor={`hsl(${warm} 70% 52%)`} />
          <stop offset="1" stopColor={`hsl(${warm} 82% 70%)`} />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#${id})`} />
      <circle className="route-cover-sun" cx={sunX} cy={sunY} r="34" fill="hsl(44 100% 86%)" />
      <circle cx={sunX} cy={sunY} r="64" fill="hsl(44 100% 86%)" opacity="0.18" />
      <path d={far} fill={`hsl(${hue} 46% 34%)`} opacity="0.75" />
      <path d={mid} fill={`hsl(${hue} 50% 24%)`} opacity="0.9" />
      <path d={near} fill={`hsl(${hue} 56% 15%)`} />
      <path
        className="route-cover-path"
        d={path}
        fill="none"
        stroke="hsl(44 100% 88%)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="1 9"
        opacity="0.9"
      />
      {subject ? (
        <g
          className="route-cover-word"
          transform={`translate(${cardX} ${cardY}) scale(${scale}) rotate(-4 ${cardWidth / 2} 43)`}
        >
          <path
            d={`M0 18a18 18 0 0 1 18-18h${cardWidth - 36}a18 18 0 0 1 18 18v32a18 18 0 0 1-18 18H46l-20 18V68h-8A18 18 0 0 1 0 50z`}
            fill="#fff"
          />
          <text
            x={cardWidth / 2}
            y="45"
            textAnchor="middle"
            fontSize="30"
            fontWeight="600"
            fill={`hsl(${hue} 62% 26%)`}
          >
            {subject}
          </text>
        </g>
      ) : null}
      {/* The route's own picture, when it has one, over the drawing: an image that is not there
          draws nothing, so the hills stay. No script, no style: the storefront has neither. */}
      <image
        href={`/portada/${seed}.webp`}
        width="400"
        height="300"
        preserveAspectRatio="xMidYMid slice"
      />
    </svg>
  );
}

/** How far along, as a ring: a share from 0 to 1. */
export function ProgressRing({ share, label }: { share: number; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, share)) * 100);
  return (
    <span className="ring" role="img" aria-label={label}>
      <svg viewBox="0 0 44 44" aria-hidden="true" focusable="false">
        <circle className="ring-track" cx="22" cy="22" r="18" pathLength="100" />
        <circle
          className="ring-done"
          cx="22"
          cy="22"
          r="18"
          pathLength="100"
          strokeDasharray={`${pct} 100`}
          transform="rotate(-90 22 22)"
        />
      </svg>
      <b>{pct}%</b>
    </span>
  );
}
