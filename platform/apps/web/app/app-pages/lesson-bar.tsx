import type { LessonView } from "@learning-routes/core/content/lesson-view";
import { LESSON_TEXT } from "@learning-routes/core/copy/lesson";
import type { LocaleCode } from "@learning-routes/core/locales";
import { filled } from "../storefront/words";

const PERCENT = 100;
const EDGE = 2;

/** Where each of a module's stations sits along the bar, evenly, as a share of its width. */
const stationAt = (index: number, stations: number) =>
  `${EDGE + (index * (PERCENT - EDGE * 2)) / stations}%`;

/** The module's line: done in green, the gold dot on this topic, the diamond for its end. */
export function LessonBar({
  lesson,
  locale,
  done,
}: {
  lesson: LessonView;
  locale: LocaleCode;
  done: boolean;
}) {
  const words = LESSON_TEXT[locale];
  const stations = lesson.topicsInModule;
  const place = lesson.topicInModule - 1 + (done ? 1 : 0);
  const here = stationAt(place, stations);
  return (
    <div className="lesson-bar">
      <p className="lesson-where">
        {filled(words.whereAmI, {
          module: lesson.moduleNumber,
          topic: lesson.topicInModule,
          total: stations,
        })}
      </p>
      <svg className="lesson-line" width="100%" height="36" aria-hidden="true">
        <line
          className="lesson-track"
          x1={stationAt(0, stations)}
          x2={stationAt(stations, stations)}
          y1="18"
          y2="18"
        />
        <line
          className="lesson-done"
          x1={stationAt(0, stations)}
          x2={stationAt(stations, stations)}
          y1="18"
          y2="18"
          pathLength={1}
          strokeDasharray={`${place / stations} 2`}
        />
        {Array.from({ length: stations }, (_, index) => (
          <circle
            key={index}
            className={index < place ? "lesson-stop lesson-stop-done" : "lesson-stop"}
            cx={stationAt(index, stations)}
            cy="18"
            r="4.5"
          />
        ))}
        <svg x={stationAt(stations, stations)} y="18" overflow="visible" aria-hidden="true">
          <rect
            className="lesson-end"
            x="-7"
            y="-7"
            width="14"
            height="14"
            rx="2"
            transform="rotate(45)"
          />
        </svg>
        <circle className="lesson-halo" cx={here} cy="18" r="14" />
        <circle className="lesson-here" cx={here} cy="18" r="8" />
      </svg>
      <a className="lesson-exit" href="/mis-rutas">
        {words.exit}
      </a>
    </div>
  );
}
