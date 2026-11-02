import type { LandingText } from "@learning-routes/core/copy/landing";
import { landingScene, type SceneOptions } from "@learning-routes/route-map/landing-scene";

// The landing's map as server-rendered SVG, from route-map's geometry: the same model
// and cameras as the approved mockup, and no script (Platform STEP 3 §4). Decorative:
// the text beside it says everything it shows.

const MODULE_TOPICS = [6, 5, 4];
const CHIP_HEIGHT = 26;
const CHIP_PADDING = 10;
const CHIP_CHAR = 6.6;
// Under the disc's level, so the route leaving it stays in view.
const CHIP_BELOW_LINE = 22;

function Chip({
  x,
  y,
  text,
  badge,
  locked,
}: {
  x: number;
  y: number;
  text: string;
  badge?: string;
  locked: boolean;
}) {
  const width = text.length * CHIP_CHAR + CHIP_PADDING * 2 + 12;
  const badgeWidth = badge ? badge.length * CHIP_CHAR + 14 : 0;
  return (
    <g
      className={locked ? "map-chip map-chip-locked" : "map-chip"}
      transform={`translate(${x} ${y})`}
    >
      <rect
        className="map-chip-field"
        y={-CHIP_HEIGHT / 2}
        width={width + badgeWidth}
        height={CHIP_HEIGHT}
        rx="7"
      />
      <circle className="map-chip-dot" cx={CHIP_PADDING + 2} r="3.5" />
      <text className="map-chip-text" x={CHIP_PADDING + 12} dy="0.34em">
        {text}
      </text>
      {badge ? (
        <>
          <rect
            className="map-chip-badge"
            x={width - 4}
            y={-9}
            width={badgeWidth}
            height="18"
            rx="5"
          />
          <text className="map-chip-badge-text" x={width + 3} dy="0.34em">
            {badge}
          </text>
        </>
      ) : null}
    </g>
  );
}

export function RouteMapFigure({
  scene: options,
  words,
  className,
  title = true,
  crop,
}: {
  scene: SceneOptions;
  words: LandingText;
  className: string;
  title?: boolean;
  /** The part of the stage to show: a phone's camera frames a taller stage than this. */
  crop?: { top: number; height: number };
}) {
  const scene = landingScene(options);
  return (
    <svg
      className={`route-map ${className}`}
      viewBox={`0 ${crop?.top ?? 0} ${scene.width} ${crop?.height ?? scene.height}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      {scene.sheets.map((sheet) => (
        <g key={sheet.top} className={sheet.locked ? "map-sheet map-sheet-locked" : "map-sheet"}>
          <path className="map-sheet-shade" d={sheet.shade} />
          <path className="map-sheet-side" d={sheet.side} />
          <path className="map-sheet-top" d={sheet.top} />
        </g>
      ))}
      {scene.track.map((d) => (
        <path key={d} className="map-track" d={d} />
      ))}
      {scene.branch.map((d) => (
        <path key={d} className="map-branch" d={d} />
      ))}
      <path className="map-route" d={scene.route} pathLength={1} />
      <path className="map-origin" d={scene.origin} />
      {scene.discs.map((disc) => (
        <path key={disc.d} className={`map-disc map-disc-${disc.module}`} d={disc.d} />
      ))}
      {scene.stops.map((stop) => (
        <path
          key={stop.d}
          className={`map-stop map-stop-${stop.state}${stop.exam ? " map-stop-exam" : ""}${stop.locked ? " map-stop-locked" : ""}`}
          d={stop.d}
        />
      ))}
      {scene.branchStops.map((d) => (
        <path key={d} className="map-branch-stop" d={d} />
      ))}
      {title
        ? scene.discs.map((disc) => {
            const locked = disc.module === 2;
            const name = words.moduleName.replace("{n}", String(disc.module + 1));
            const total = MODULE_TOPICS[disc.module] ?? 0;
            const detail = locked
              ? words.moduleTopics.replace("{n}", String(total))
              : words.moduleProgress
                  .replace("{done}", String(disc.module === 0 ? options.done : 0))
                  .replace("{total}", String(total));
            return (
              <Chip
                key={disc.module}
                x={disc.label.x}
                y={disc.label.y + CHIP_BELOW_LINE}
                text={`${name}  ${detail}`}
                badge={disc.module === 0 ? words.moduleFree : undefined}
                locked={locked}
              />
            );
          })
        : null}
    </svg>
  );
}
