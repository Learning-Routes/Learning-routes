import { Color } from "three";
import type { SceneParts } from "./scene";

/** The model's tones, from the tokens: read again on every theme switch. */
export function applyTheme(parts: SceneParts, root: Element) {
  const { materials: m, sky, sun, fog } = parts;
  const styles = getComputedStyle(root);
  const value = (name: string) => styles.getPropertyValue(name).trim();
  const tone = (name: string) => new Color(value(name));
  sky.color.copy(tone("--lp-sky"));
  sky.groundColor.copy(tone("--lp-ground"));
  // Lights are physical since r155: ×π keeps the look the reference was approved with.
  sky.intensity = Number.parseFloat(value("--lp-hemi")) * Math.PI;
  sun.intensity = Number.parseFloat(value("--lp-key")) * Math.PI;
  fog.color.copy(tone("--color-bg"));
  m.panel.color.copy(tone("--color-card"));
  m.panelLocked.color.copy(tone("--color-card"));
  m.track.color.copy(tone("--lp-track"));
  m.node.color.copy(tone("--color-card"));
  m.ring.color.copy(tone("--lp-ring"));
  m.lock.color.copy(tone("--lp-lock"));
  m.check.color.copy(tone("--color-accent-text"));
  m.extra.color.copy(tone("--color-reinforce"));
  m.route.color.copy(tone("--color-accent"));
  m.glow.color.copy(tone("--color-accent"));
  m.glow.opacity = Number.parseFloat(value("--lp-glow"));
  m.signal.color.copy(tone("--color-highlight"));
  m.signalFlat.color.copy(tone("--color-highlight"));
  m.ink.color.copy(tone("--color-txt"));
  m.doneRing.color.copy(tone("--color-accent"));
  m.shadow.opacity = Number.parseFloat(value("--lp-shadow"));
}
