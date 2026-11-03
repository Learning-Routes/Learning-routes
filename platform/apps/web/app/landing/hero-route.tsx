import type { LandingText } from "@learning-routes/core/copy/landing";

// The landing's large route, from v2's Main (Platform STEP 4 §4): server SVG, with what
// is done in green, you-are-here in gold, a stop of extra practice and the exam. Colours
// come from the stylesheet, so both themes hold. Under 6 KB, with a test.

const WHOLE =
  "M70 560 C 70 470, 210 470, 230 400 S 120 290, 210 230 S 430 230, 450 150 S 380 60, 520 40";
const DONE = "M70 560 C 70 470, 210 470, 230 400 S 120 290, 210 230";
const AHEAD = "M210 230 S 430 230, 450 150 S 380 60, 520 40";
const TO_EXTRA = "M230 400 C 300 410, 330 380, 360 352";

export function HeroRoute({ words, className }: { words: LandingText; className?: string }) {
  return (
    <svg
      className={`hero-route ${className ?? ""}`.trim()}
      viewBox="0 0 600 600"
      role="img"
      aria-label={words.mapLabel}
    >
      <path className="hero-road" d={WHOLE} />
      <path className="hero-done" d={DONE} />
      <path className="hero-ahead" d={AHEAD} />
      <path className="hero-extra" d={TO_EXTRA} />
      <circle className="hero-stop-done" cx="70" cy="560" r="16" />
      <path className="hero-check" d="M62 560 l6 6 l11 -12" />
      <circle className="hero-stop-done" cx="230" cy="400" r="16" />
      <path className="hero-check" d="M222 400 l6 6 l11 -12" />
      <circle className="hero-stop-extra" cx="360" cy="352" r="11" />
      <circle className="hero-here-glow" cx="210" cy="230" r="34" />
      <circle className="hero-here" cx="210" cy="230" r="20" />
      <circle className="hero-stop-ahead" cx="450" cy="150" r="14" />
      <rect
        className="hero-exam"
        x="502"
        y="22"
        width="36"
        height="36"
        rx="6"
        transform="rotate(45 520 40)"
      />
      <text className="hero-label-strong" x="252" y="222">
        {words.mapHere}
      </text>
      <text className="hero-label" x="252" y="248">
        {words.mapTopic}
      </text>
      <text className="hero-label-extra" x="378" y="358">
        {words.mapExtra}
      </text>
      <text className="hero-label" x="482" y="92" textAnchor="end">
        {words.mapExam}
      </text>
      <text className="hero-label" x="100" y="566">
        {words.mapFirst}
      </text>
    </svg>
  );
}
