// Sound for the simulators, made in the browser with Web Audio: no files, no library.

let shared: AudioContext | null = null;

/** The one audio context, made on the first sound (browsers start it only after a tap). */
export function audio(): AudioContext | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) {
    return null;
  }
  shared ??= new AudioContext();
  if (shared.state === "suspended") {
    shared.resume().catch(() => undefined);
  }
  return shared;
}

export const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** A soft piano-like note: two partials with a quick attack and a long fall. */
export function note(midi: number, delay = 0, length = 1.2) {
  const ctx = audio();
  if (!ctx) {
    return;
  }
  const at = ctx.currentTime + delay;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.22, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  gain.connect(ctx.destination);
  for (const [ratio, type] of [
    [1, "triangle"],
    [2, "sine"],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = midiToHz(midi) * ratio;
    osc.connect(gain);
    osc.start(at);
    osc.stop(at + length);
  }
}

/** A plucked string: a short noise burst through a resonant filter at the pitch. */
export function pluck(midi: number, delay = 0) {
  const ctx = audio();
  if (!ctx) {
    return;
  }
  const at = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = midiToHz(midi);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(midiToHz(midi) * 6, at);
  filter.frequency.exponentialRampToValueAtTime(midiToHz(midi) * 1.2, at + 0.6);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.16, at + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.6);
  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 1.7);
}

function noise(ctx: AudioContext, seconds: number) {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  return source;
}

/** A drum hit, synthesized: kick, snare, hat or clap. */
export function drum(sound: string, when?: number) {
  const ctx = audio();
  if (!ctx) {
    return;
  }
  const at = when ?? ctx.currentTime;
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  if (sound === "kick") {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(140, at);
    osc.frequency.exponentialRampToValueAtTime(45, at + 0.15);
    gain.gain.setValueAtTime(0.7, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
    osc.connect(gain);
    osc.start(at);
    osc.stop(at + 0.3);
    return;
  }
  const length = sound === "hat" ? 0.05 : sound === "clap" ? 0.12 : 0.18;
  const src = noise(ctx, length);
  const filter = ctx.createBiquadFilter();
  filter.type = sound === "hat" ? "highpass" : "bandpass";
  filter.frequency.value = sound === "hat" ? 7000 : sound === "clap" ? 1500 : 1800;
  gain.gain.setValueAtTime(sound === "hat" ? 0.18 : 0.4, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  src.connect(filter).connect(gain);
  src.start(at);
}

/** A short click, for a metronome. */
export function click(when?: number, accent = false) {
  const ctx = audio();
  if (!ctx) {
    return;
  }
  const at = when ?? ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.frequency.value = accent ? 1600 : 1100;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.25, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.06);
}
