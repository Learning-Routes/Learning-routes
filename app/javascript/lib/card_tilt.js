// STEP 41 §1.3: a card you can act on leans towards the pointer (at most 3°
// sideways, 2.5° up and down, the reference's values) and its highlight
// follows it. px, py: the pointer inside the card, 0..1 from its top left.
const clamp = (v) => Math.min(1, Math.max(0, v))
const round = (v) => Math.round(v * 100) / 100 + 0

export function tiltFor(px, py) {
  const x = clamp(px)
  const y = clamp(py)
  return { rx: round((0.5 - y) * 5), ry: round((x - 0.5) * 6), mx: round(x * 100), my: round(y * 100) }
}
