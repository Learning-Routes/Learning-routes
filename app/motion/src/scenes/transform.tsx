import {makeScene2D, Txt, Rect, Layout} from '@motion-canvas/2d';
import {
  createRef, all, sequence, waitFor, useScene,
  easeInOutCubic, easeOutBack,
} from '@motion-canvas/core';
import {cueFor, remainingUntil} from '../lib/cues';
import type {Word} from '../lib/cues';
import schema from './transform.schema.json';
import type {Transform} from '../generated/schemas';

const INK = '#1C1812', MUTED = '#887F72', HI = '#F2D66B';

// The exact font stack every fontFamily in this scene must use (global constraint).
const FONT = "'DM Sans', 'Hiragino Sans GB', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', system-ui, sans-serif";

// The JSON the AI generates. This schema is its only declaration: the type
// below is generated from it, and this fallback is its examples[0].
const FALLBACK = schema.examples[0] as Transform;

// Reports the index of the token currently highlighted (or null) so a system
// test can read the beat off the canvas without importing this module.
function fireToken(onToken: ((index: number | null) => void) | null, index: number | null) {
  onToken?.(index);
}

export default makeScene2D(function* (view) {
  const scene = useScene();
  const d = scene.variables.get<Transform>('transform', FALLBACK)();
  const words = scene.variables.get<Word[] | null>('words', null)();
  const onToken = scene.variables.get<((index: number | null) => void) | null>('onToken', null);

  // Waits on the SCENE clock until absolute second `t`.
  function* waitUntilTime(t: number) {
    yield* waitFor(remainingUntil(t, useScene().playback.time));
  }

  let cueCursor = 0;

  const rows = d.steps.map(() => createRef<Layout>());
  const tags = d.steps.map(() => createRef<Txt>());
  const chips = d.steps.map(s => s.tokens.map(() => createRef<Rect>()));

  view.add(
    <Layout direction="column" alignItems="start" gap={34} layout>
      {d.steps.map((s, i) => (
        <Layout ref={rows[i]} direction="row" alignItems="center" gap={30} opacity={0} layout>
          <Txt ref={tags[i]} text={s.tag} fontFamily={FONT} fontSize={20} letterSpacing={4} fill={MUTED} width={210} textAlign="right" />
          <Layout direction="row" gap={14} layout>
            {s.tokens.map((t, k) => (
              <Rect ref={chips[i][k]} radius={14} padding={[8, 18]} fill={'#00000000'} scale={0} layout>
                <Txt text={t} fontFamily={FONT} fontWeight={700} fontSize={62} fill={INK} />
              </Rect>
            ))}
          </Layout>
        </Layout>
      ))}
    </Layout>,
  );

  for (let i = 0; i < d.steps.length; i++) {
    const step = d.steps[i];

    // previous rows fade to context
    yield* all(...rows.slice(0, i).map(r => r().opacity(0.35, 0.3)));
    // this row comes in, words plop one by one
    yield* rows[i]().opacity(1, 0.25);
    yield* sequence(0.08, ...chips[i].map(c => c().scale(1, 0.45, easeOutBack)));

    if (step.hi.length) {
      // Time the highlight to when the narration reaches the first highlighted
      // word of this step (falls back to a fixed delay on a miss/no `words`).
      const cue = cueFor(step.tokens[step.hi[0]], words, cueCursor);
      if (cue !== null) { cueCursor += 1; yield* waitUntilTime(cue); }
      else { yield* waitFor(0.45); }
      step.hi.forEach(k => fireToken(onToken(), k));
      yield* all(...step.hi.map(k => chips[i][k]().fill(HI, 0.35, easeInOutCubic)));
      yield* all(...step.hi.map(k => chips[i][k]().scale(1.06, 0.25, easeOutBack)));
      yield* all(...step.hi.map(k => chips[i][k]().scale(1, 0.25)));
    } else {
      yield* waitFor(0.45);
    }
    yield* waitFor(0.9);
  }
  // land: all rows readable
  yield* all(...rows.map(r => r().opacity(1, 0.4)));
  fireToken(onToken(), null);
  yield* waitFor(1.4);
});
