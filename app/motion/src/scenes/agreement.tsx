import {makeScene2D, Txt, Rect, Layout, Camera} from '@motion-canvas/2d';
import {
  createRef, all, sequence, waitFor, useScene,
  easeOutBack, easeInOutCubic, easeOutCubic, easeInCubic,
} from '@motion-canvas/core';
import {cueFor, remainingUntil} from '../lib/cues';
import type {Word} from '../lib/cues';
import schema from './agreement.schema.json';
import type {Agreement} from '../generated/schemas';

// Palette — matches Learning Routes' tokens so it reads as in-product.
const INK = '#1C1812', SUB = '#5B554C', MUTED = '#887F72';
const HI = '#F2D66B', HI2 = '#9AD1F0', OK = '#2F8F5B', BAD = '#C0453A', CARD = '#FFFDFA';
// Translucent washes of OK/BAD for the chip background behind the verb as it
// flips from wrong to right — named so nothing depends on string-concatenating
// an alpha suffix onto a colour at the call site.
const BAD_WASH = '#C0453A22', OK_WASH = '#2F8F5B1E';

// The exact font stack every fontFamily in this scene must use (global constraint).
const FONT = "'DM Sans', 'Hiragino Sans GB', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', system-ui, sans-serif";

// The JSON the AI generates. This schema is its only declaration: the type
// below is generated from it, and this fallback is its examples[0].
const FALLBACK = schema.examples[0] as Agreement;

// Reports the index of the token currently highlighted (or null) so a system
// test can read the beat off the canvas without importing this module.
function fireToken(onToken: ((index: number | null) => void) | null, index: number | null) {
  onToken?.(index);
}

export default makeScene2D(function* (view) {
  const scene = useScene();
  const d = scene.variables.get<Agreement>('agreement', FALLBACK)();
  const words = scene.variables.get<Word[] | null>('words', null)();
  const onToken = scene.variables.get<((index: number | null) => void) | null>('onToken', null);

  // Waits on the SCENE clock until absolute second `t`.
  function* waitUntilTime(t: number) {
    yield* waitFor(remainingUntil(t, useScene().playback.time));
  }

  let cueCursor = 0;

  const cam = createRef<Camera>();
  const row = createRef<Layout>();
  const caption = createRef<Txt>();
  const chips: ReturnType<typeof createRef<Rect>>[] = d.tokens.map(() => createRef<Rect>());
  const labels: ReturnType<typeof createRef<Txt>>[] = d.tokens.map(() => createRef<Txt>());
  const wordRefs: ReturnType<typeof createRef<Txt>>[] = d.tokens.map(() => createRef<Txt>());

  view.add(
    <Camera ref={cam}>
      <Layout direction="column" alignItems="center" gap={70} layout>
        <Layout ref={row} direction="row" alignItems="start" gap={18} layout>
          {d.tokens.map((t, i) => (
            <Layout direction="column" alignItems="center" gap={14} layout>
              <Rect ref={chips[i]} radius={16} padding={[10, 22]} fill={'#00000000'} scale={0} layout>
                <Txt ref={wordRefs[i]} text={t} fontFamily={FONT} fontWeight={700} fontSize={84} fill={INK} />
              </Rect>
              <Txt ref={labels[i]} text={i === d.subject ? d.labels.subject : i === d.verb ? d.labels.verb : ''}
                   fontFamily={FONT} fontSize={20} letterSpacing={4} fill={MUTED} opacity={0} />
            </Layout>
          ))}
        </Layout>
        <Txt ref={caption} text={d.why} fontFamily={FONT} fontSize={34} fill={SUB} opacity={0} textWrap width={1400} textAlign="center" />
      </Layout>
    </Camera>,
  );

  // 1 · words plop in, one after another — a spring, not a tween.
  yield* sequence(0.1, ...chips.map(c => c().scale(1, 0.5, easeOutBack)));
  yield* waitFor(0.35);

  // 2 · camera leans in on the sentence and the subject lights up, timed to
  // when the narration reaches the subject word (falls back to a fixed delay
  // when there is no `words` alignment, or the word is not found in it).
  yield* all(
    cam().zoom(1.18, 0.7, easeInOutCubic),
    chips[d.subject]().fill(HI, 0.4),
    labels[d.subject]().opacity(1, 0.4),
  );
  fireToken(onToken(), d.subject);
  const subjectCue = cueFor(d.tokens[d.subject], words, cueCursor);
  if (subjectCue !== null) { cueCursor += 1; yield* waitUntilTime(subjectCue); }
  else { yield* waitFor(0.55); }

  // 3 · the verb lights up in the second colour, same narration-timed beat.
  yield* all(chips[d.verb]().fill(HI2, 0.4), labels[d.verb]().opacity(1, 0.4));
  fireToken(onToken(), d.verb);
  const verbCue = cueFor(d.tokens[d.verb], words, cueCursor);
  if (verbCue !== null) { cueCursor += 1; yield* waitUntilTime(verbCue); }
  else { yield* waitFor(0.7); }

  // 4 · camera snaps to the verb; it turns red and shakes — a visible no.
  yield* all(cam().centerOn(chips[d.verb](), 0.5, easeInOutCubic), cam().zoom(1.7, 0.5, easeInOutCubic));
  yield* all(chips[d.verb]().fill(BAD_WASH, 0.25), wordRefs[d.verb]().fill(BAD, 0.25));
  const x0 = chips[d.verb]().position.x();
  for (const dx of [-9, 9, -6, 6, 0]) yield* chips[d.verb]().position.x(x0 + dx, 0.06);
  yield* waitFor(0.35);

  // 5 · the wrong word drops out; the right one rises in, green.
  yield* all(
    chips[d.verb]().position.y(70, 0.35, easeInCubic),
    chips[d.verb]().opacity(0, 0.3),
  );
  wordRefs[d.verb]().text(d.correct);
  wordRefs[d.verb]().fill(OK);
  chips[d.verb]().fill(OK_WASH);
  chips[d.verb]().position.y(-60);
  yield* all(
    chips[d.verb]().position.y(0, 0.5, easeOutBack),
    chips[d.verb]().opacity(1, 0.3),
  );
  yield* waitFor(0.5);

  // 6 · pull back, and the explanation types itself in.
  yield* all(cam().reset(0.8, easeInOutCubic));
  yield* caption().opacity(1, 0.5, easeOutCubic);
  fireToken(onToken(), null);
  yield* waitFor(1.4);
});
