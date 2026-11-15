// The arithmetic of the sim kinds (Platform STEP 12). The schema uses it to refuse a goal no
// student could reach; the graders use it to recompute the goal from the submitted state.

/** The camera's fixed lists: f-numbers, shutter speeds as 1/x, and ISO. */
export const APERTURES = [1.4, 1.8, 2, 2.8, 4, 5.6, 8, 11, 16, 22] as const;
export const SHUTTERS = [1, 2, 4, 8, 15, 30, 60, 125, 250, 500, 1000, 2000, 4000] as const;
export const ISOS = [100, 200, 400, 800, 1600, 3200, 6400] as const;
/** Half a stop either way still looks right. */
export const EXPOSURE_TOLERANCE = 0.5;

export const JUSTIFY = ["start", "center", "end", "between"] as const;
export const ALIGN = ["start", "center", "end"] as const;
export const HUE_RELATIONS = ["complement", "analogous", "triad"] as const;

/** The exposure value of the settings, at ISO 100: log2(N²/t) − log2(iso/100). */
export function exposureOf(aperture: number, shutter: number, iso: number): number {
  return Math.log2(aperture * aperture * shutter) - Math.log2(iso / 100);
}

/** Whether some setting on the lists exposes the scene within the tolerance, fast enough. */
export function exposable(sceneEv: number, minShutter = 1): boolean {
  return APERTURES.some((aperture) =>
    SHUTTERS.some(
      (shutter) =>
        shutter >= minShutter &&
        ISOS.some(
          (iso) => Math.abs(sceneEv - exposureOf(aperture, shutter, iso)) <= EXPOSURE_TOLERANCE,
        ),
    ),
  );
}

/** What saving `monthly` at the end of every month grows to, at `ratePercent` a year. */
export function futureValue(monthly: number, ratePercent: number, years: number): number {
  const rate = ratePercent / 100 / 12;
  const months = years * 12;
  return monthly * (((1 + rate) ** months - 1) / rate);
}

/** Whether `value` is on the slider: inside it, and a whole number of steps from its start. */
export function onSlider(value: number, min: number, max: number, step: number): boolean {
  const steps = (value - min) / step;
  return value >= min && value <= max && Math.abs(steps - Math.round(steps)) < 1e-9;
}

/** The hues, 0–11 around the wheel, that stand in `relation` to `base`. */
export function huesFor(base: number, relation: (typeof HUE_RELATIONS)[number]): number[] {
  const around = (offset: number) => (base + offset + 12) % 12;
  if (relation === "complement") {
    return [around(6)];
  }
  return relation === "analogous" ? [around(-1), around(1)] : [around(4), around(8)];
}

export interface Term {
  atoms: Record<string, number>;
  side: "left" | "right";
}

/** For each element, the atoms on the left minus those on the right. */
function surplus(terms: readonly Term[], coefficients: readonly number[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const [index, term] of terms.entries()) {
    const sign = term.side === "left" ? 1 : -1;
    for (const [element, count] of Object.entries(term.atoms)) {
      totals.set(element, (totals.get(element) ?? 0) + sign * count * (coefficients[index] ?? 0));
    }
  }
  return totals;
}

/** How many of the elements balance, of how many. */
export function balanceOf(terms: readonly Term[], coefficients: readonly number[]) {
  const totals = [...surplus(terms, coefficients).values()];
  return { balanced: totals.filter((total) => total === 0).length, elements: totals.length };
}

/** Whether coefficients from 1 to `max` can balance the terms. */
export function balanceable(terms: readonly Term[], max: number): boolean {
  const coefficients = terms.map(() => 1);
  for (;;) {
    const { balanced, elements } = balanceOf(terms, coefficients);
    if (balanced === elements) {
      return true;
    }
    let at = 0;
    while (at < coefficients.length && coefficients[at] === max) {
      coefficients[at] = 1;
      at += 1;
    }
    if (at === coefficients.length) {
      return false;
    }
    coefficients[at] = (coefficients[at] ?? 0) + 1;
  }
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Whether the coefficients share a factor, so a smaller set balances too. */
export function reducible(coefficients: readonly number[]): boolean {
  return coefficients.reduce(gcd, 0) > 1;
}
