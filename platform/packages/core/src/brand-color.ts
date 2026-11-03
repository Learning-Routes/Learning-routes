// A space's brand colour carries white text on its primary actions (Platform STEP 4
// §2.1), so white on it must pass WCAG AA. Pure: the database only checks the format.

const HEX_COLOR = /^#[0-9a-f]{6}$/;
const AA_RATIO = 4.5;
const SEARCH_STEPS = 12;

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.040_45 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The contrast ratio of white text on this colour. */
export function contrastWithWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

/** The colour darkened by a factor from 0 (black) to 1 (unchanged), so its hue stays. */
function darkened(hex: string, factor: number): string {
  const channels = [1, 3, 5].map((at) =>
    Math.floor(Number.parseInt(hex.slice(at, at + 2), 16) * factor)
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${channels.join("")}`;
}

function nearestPassing(hex: string): string {
  let passes = 0;
  let fails = 1;
  for (let step = 0; step < SEARCH_STEPS; step++) {
    const middle = (passes + fails) / 2;
    if (contrastWithWhite(darkened(hex, middle)) >= AA_RATIO) {
      passes = middle;
    } else {
      fails = middle;
    }
  }
  return darkened(hex, passes);
}

export type BrandColorCheck =
  | { ok: true; color: string }
  | { ok: false; message: string; suggestion: string };

export function checkBrandColor(input: string): BrandColorCheck {
  const color = input.toLowerCase();
  if (!HEX_COLOR.test(color)) {
    return {
      ok: false,
      message: `"${input}" is not a colour: write it as six hex digits, like #6a2ea0`,
      suggestion: "#6a2ea0",
    };
  }
  const ratio = contrastWithWhite(color);
  if (ratio >= AA_RATIO) {
    return { ok: true, color };
  }
  const suggestion = nearestPassing(color);
  return {
    ok: false,
    message: `white text on ${color} has a contrast of ${ratio.toFixed(1)}:1, and buttons need ${AA_RATIO}:1. The nearest colour that passes is ${suggestion}`,
    suggestion,
  };
}
