// What the player's simulators and their graders share (Platform STEP 12): plain numbers and one
// formula, with no imports, so browser code can load it.

export const APERTURES = [1.8, 2.8, 4, 5.6, 8, 11, 16] as const;
export const SHUTTERS = [30, 60, 125, 250, 500, 1000] as const;
export const ISOS = [100, 200, 400, 800, 1600, 3200] as const;
export const FLEX_JUSTIFY = ["flex-start", "center", "flex-end", "space-between"] as const;
export const FLEX_ALIGN = ["flex-start", "center", "flex-end"] as const;

/** The value of saving `monthly` at the end of each month for `years`, at a yearly `rate`. */
export function futureValue(monthly: number, rate: number, years: number): number {
  const r = rate / 12;
  const n = years * 12;
  return r === 0 ? monthly * n : (monthly * ((1 + r) ** n - 1)) / r;
}

/** How far a camera setting is from the scene's light, in stops: above 0 is too bright. */
export function exposureOffset(sceneEv: number, aperture: number, shutter: number, iso: number) {
  return sceneEv - (Math.log2(aperture * aperture * shutter) - Math.log2(iso / 100));
}
