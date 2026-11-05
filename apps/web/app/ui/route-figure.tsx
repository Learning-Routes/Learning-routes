import { routeShape, type ShapeBox, type Station } from "@learning-routes/route-map/route-shape";

const STEPS_ALONG = 19;
/** A class per step along the line says when a station arrives. The CSP allows no inline style. */
export const arrival = (station: Pick<Station, "at">) =>
  `at-${Math.round(station.at * STEPS_ALONG)}`;

function Mark({
  station,
  here,
  done,
  topic,
  module,
}: {
  station: Station;
  here: number;
  done: number;
  topic: number;
  module: number;
}) {
  const { x, y, kind } = station;
  if (kind === "module") {
    return (
      <g className={`rf-pop ${arrival(station)}`}>
        <circle className="rf-ring" cx={x} cy={y} r={module} />
        <circle className="rf-core" cx={x} cy={y} r={module * 0.36} />
      </g>
    );
  }
  if (station.topic === here) {
    return (
      <g className={`rf-pop ${arrival(station)}`}>
        <circle className="rf-halo" cx={x} cy={y} r={module * 1.9} />
        <circle className="rf-here" cx={x} cy={y} r={module * 0.9} />
      </g>
    );
  }
  const isDone = (station.topic ?? 0) <= done;
  return (
    <circle
      className={`rf-topic rf-pop ${arrival(station)}${isDone ? " rf-topic-done" : ""}`}
      cx={x}
      cy={y}
      r={topic}
    />
  );
}

/**
 * A route's real shape: a ring and dot for each module, and a dot for each topic. `done` and `here` are topics, from 0, and only a student has them. `travels` adds the line
 * and the gold dot a card runs on hover. No modules, no line.
 */
export function RouteFigure({
  lessons,
  seed,
  box,
  done = -1,
  here = -1,
  travels = false,
  className = "",
}: {
  lessons: readonly number[];
  seed: string;
  box: ShapeBox;
  done?: number;
  here?: number;
  travels?: boolean;
  className?: string;
}) {
  if (lessons.length === 0) {
    return null;
  }
  const shape = routeShape(lessons, seed, box);
  const doneAt = shape.stations.find((station) => station.topic === done)?.at ?? 0;
  return (
    <svg
      className={`rf ${className}`.trim()}
      viewBox={`0 0 ${shape.width} ${shape.height}`}
      aria-hidden="true"
    >
      <path className="rf-track" d={shape.path} pathLength={1} strokeWidth={shape.trackWidth} />
      {done >= 0 ? (
        <path
          className="rf-done"
          d={shape.path}
          pathLength={1}
          strokeDasharray={`${doneAt} 2`}
          strokeWidth={shape.topicRadius * 1.5}
        />
      ) : null}
      {travels ? (
        <>
          <path className="rf-drawn" d={shape.path} pathLength={1} />
          <path className="rf-runner" d={shape.path} pathLength={1} />
        </>
      ) : null}
      {shape.stations.map((station) => (
        <Mark
          key={station.at}
          station={station}
          here={here}
          done={done}
          topic={shape.topicRadius}
          module={shape.moduleRadius}
        />
      ))}
    </svg>
  );
}
