// Bootstraps two Motion Canvas scenes WITHOUT the editor or the vite plugin, and
// exposes a tiny API the demo page calls: mc.mount(el, sceneName, {data, words, onToken}).
//
// This mirrors what @motion-canvas/player does internally (Player + Stage),
// minus the web component, so the whole thing can be inlined into one HTML file.
import {
  bootstrap, MetaFile, ValueDispatcher, Player, Stage, Vector2,
} from '@motion-canvas/core';
import type {FullSceneDescription, Project} from '@motion-canvas/core';
import agreement from './scenes/agreement';
import transform from './scenes/transform';
import {resetCueStats, cueStats} from './lib/cues';
import type {Word} from './lib/cues';

// What the vite plugin's `?scene` transform does, by hand.
function describe(desc: any, name: string): FullSceneDescription {
  desc.name = name;
  const meta = new MetaFile(name, false);
  meta.loadData({version: 0});
  meta.attach(desc.meta);
  desc.onReplaced ??= new ValueDispatcher(desc.config);
  return desc;
}

const SCENES: Record<string, FullSceneDescription> = {
  agreement: describe(agreement, 'agreement'),
  transform: describe(transform, 'transform'),
};

const VERSIONS = {core: '3.17.2', two: '3.17.2', ui: null, vitePlugin: null};

function makeProjectFor(name: string): Project {
  const projectMeta = new MetaFile('project', false);
  projectMeta.loadData({
    version: 0,
    shared: {background: 'rgba(0,0,0,0)', range: [0, null], size: {x: 1600, y: 900}, audioOffset: 0},
    preview: {fps: 30, resolutionScale: 1},
    rendering: {fps: 30, resolutionScale: 1, colorSpace: 'srgb', exporter: {name: '@motion-canvas/core/image-sequence', options: {}}},
  });
  const settings = new MetaFile('settings', false);
  settings.loadData({version: 0});
  return bootstrap(name, VERSIONS as any, [], {scenes: [SCENES[name]]}, projectMeta, settings);
}

type MountOpts = {
  data?: Record<string, unknown>;
  words?: Word[] | null;
  onToken?: (index: number | null) => void;
};

type Handle = {
  play(next?: Record<string, unknown>): void;
  destroy(): void;
  canvas: HTMLCanvasElement;
  player: Player;
  cueStats(): {asked: number; missed: number};
};

function mount(el: HTMLElement, sceneName: string, opts: MountOpts = {}): Handle {
  const project = makeProjectFor(sceneName);
  project.logger.onLogged.subscribe((e: any) => { if (e.level === 'error' || e.level === 'warn') console.error('[mc]', e.level, e.message, e.stack || '', e.object ?? ''); });
  const stage = new Stage();
  const player = new Player(project);
  const settings = {...project.meta.getFullRenderingSettings(), size: new Vector2(1600, 900), resolutionScale: Math.min(2, window.devicePixelRatio || 1)};
  stage.configure(settings);
  player.configure(settings);

  resetCueStats();
  if (opts.data || opts.words) {
    player.setVariables({[sceneName]: opts.data ?? {}, words: opts.words ?? null, onToken: opts.onToken ?? null});
  }

  const render = async () => { await stage.render(player.playback.currentScene, player.playback.previousScene); };
  player.onRender.subscribe(render);

  const canvas = stage.finalBuffer;
  canvas.style.width = '100%'; canvas.style.height = 'auto'; canvas.style.display = 'block';
  el.replaceChildren(canvas);

  player.toggleLoop(false);
  player.activate();
  player.togglePlayback(true);

  return {
    canvas, player, cueStats,
    play(next?: Record<string, unknown>) {
      if (next) player.setVariables({[sceneName]: next});
      player.requestReset();
      player.togglePlayback(true);
    },
    destroy() { player.togglePlayback(false); player.deactivate(); player.onRender.unsubscribe(render); },
  };
}

(window as any).mc = {mount};
