// Every colour a scene paints with — and the only place inside app/motion where
// a colour value is written down at all.
//
// Checkpoint 2 (PROMPT_27_WP36_NARRATED_SCENES.md, 12 September): the scene has
// no colours of its own. `motion_scene_controller.js` reads the page's CSS
// custom properties at mount and hands them over as the `theme` scene variable,
// so one compiled artifact is legible on the light theme and on the dark one.
// Before that, both scenes hardcoded the light palette: the canvas drew correct
// ink (`#1C1812`, sampled from its pixels) and the student on a dark OS saw a
// blank card.
//
// FALLBACK_THEME is the light bag and it serves ONE caller: the editorless
// preview page, which mounts a scene with no `theme`. It lives here rather than
// beside the scenes because motion_scene_chrome_test.rb admits no colour
// literal in any src/scenes/*.tsx — a palette reachable from a scene is the
// defect — and because one declaration shared by both scenes cannot drift from
// a second copy. Its values are the LIGHT values of the tokens named below, so
// the preview and a light-theme lesson look the same.
export type Theme = {
  ink: string; // --color-txt          the token words
  sub: string; // --color-sub          the explanation caption
  muted: string; // --color-muted        role labels and step tags
  ok: string; // --color-positive     the corrected word
  bad: string; // --color-negative     the wrong word
  hi: string; // --color-motion-hi    chip fill under the first highlighted token
  hi2: string; // --color-motion-hi2   chip fill under the second highlighted token
  okWash: string; // --color-positive-bg  chip fill behind the corrected word
  badWash: string; // --color-negative-bg  chip fill behind the wrong word
};

export const FALLBACK_THEME: Theme = {
  ink: '#1C1812',
  sub: '#6D665B',
  muted: '#887F72',
  ok: '#16A34A',
  bad: '#DC2626',
  hi: '#F2D66B',
  hi2: '#9AD1F0',
  okWash: 'rgba(22, 163, 74, 0.08)',
  badWash: 'rgba(220, 38, 38, 0.08)',
};
