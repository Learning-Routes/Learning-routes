import { at } from "@learning-routes/route-map/at-index";
import { isPhone } from "@learning-routes/route-map/landing-cameras";
import { point } from "@learning-routes/route-map/landing-curves";
import type { LandingModel } from "@learning-routes/route-map/landing-model";
import {
  escapeHtml,
  fillIn,
  type Labels,
  LOCK_ICON,
  type Placed,
  type Projector,
  placeLabel,
  type StageWords,
} from "./labels";
import type { SceneParts } from "./scene";
import type { StoryState } from "./story-frame";

// One frame of the names: what each one says, and by priority where it goes.

type Frame = {
  model: LandingModel;
  parts: SceneParts;
  labels: Labels;
  words: StageWords;
  project: Projector;
  drawnRadius: (p: { x: number; y: number; z: number }, radius: number) => number;
  width: number;
  placed: Placed;
  s: number;
  story: StoryState;
};

function sweepOpacity(frame: Frame, step: Labels["steps"][number]) {
  const onPhone = isPhone(frame.width);
  const curve = at(frame.model.modules, step.moduleIndex).legs[step.index];
  const leg = frame.parts.legs.find((candidate) => candidate.curve === curve);
  const legEnd = (leg?.start ?? 0) + (leg?.length ?? 0);
  if (step.moduleIndex === 1 && onPhone) {
    return 0;
  }
  const { sweepHead } = frame.story;
  return sweepHead >= legEnd && (!onPhone || sweepHead < legEnd + 7) ? 1 : 0;
}

function stepOpacity(frame: Frame, step: Labels["steps"][number], index: number) {
  const { story, parts, width } = frame;
  if (story.isSweeping) {
    return sweepOpacity(frame, step);
  }
  const isCurrent = at(parts.steps, index).state === "cur" && story.q >= 0.9;
  const isNear = story.q >= 0.9 && story.q < 4;
  if (!isNear || (isPhone(width) && !isCurrent)) {
    return 0;
  }
  if (step.moduleIndex === 0) {
    return story.u < 7.6 ? 1 : 0.5;
  }
  return story.u >= 7.6 ? 1 : 0;
}

function placeSteps(frame: Frame) {
  const { labels, parts, words, project, width, placed, story } = frame;
  const rows = labels.steps.map((step, index) => {
    const stop = at(parts.steps, index);
    const isCurrent = stop.state === "cur" && story.q >= 0.9;
    const html = isCurrent
      ? `<small>${escapeHtml(words.here)}</small><b>${escapeHtml(step.name)}</b>`
      : escapeHtml(step.name);
    if (step.html !== html) {
      step.element.innerHTML = html;
      step.html = html;
    }
    return { step, stop, isCurrent, opacity: stepOpacity(frame, step, index) };
  });
  const place = ({ step, stop, opacity }: (typeof rows)[number]) => {
    const offset = frame.drawnRadius(stop.position, stop.isExam ? 0.72 : 0.62) * 0.72 + 5;
    const at = stop.position;
    placeLabel(
      { element: step.element, at, opacity, mode: "below", offset },
      project,
      width,
      placed,
    );
  };
  return { rows, place };
}

function placeChips(frame: Frame, isOverview: boolean) {
  const { model, labels, words, project, width, placed, story } = frame;
  model.modules.forEach((module, m) => {
    const name = escapeHtml(fillIn(words.module, { n: m + 1 }));
    const total = module.heads.length;
    const free = m === 0 ? `<em>${escapeHtml(words.free)}</em>` : "";
    const done = m === 0 ? story.doneInFirst : 0;
    const html = module.isLocked
      ? `${LOCK_ICON}${name}<span>${escapeHtml(fillIn(words.topics, { count: total }))}</span>`
      : `<i></i>${name}<span>${escapeHtml(fillIn(words.progress, { done, total }))}</span>${free}`;
    const chip = at(labels.chips, m);
    if (chip.html !== html) {
      chip.element.innerHTML = html;
      chip.html = html;
    }
    const seat = point(-0.6, module.surfaceY, module.top + 0.2);
    const opacity = isOverview ? 1 : 0;
    placeLabel({ element: chip.element, at: seat, opacity, mode: "left" }, project, width, placed);
  });
}

export function placeNames(frame: Frame) {
  const { model, labels, project, width, placed, s, story } = frame;
  const onPhone = isPhone(width);
  const isOverview = story.q < 0.9 || story.q >= 4;
  const showsWide = isOverview && !onPhone && s >= 0.9;
  const { rows, place } = placeSteps(frame);
  for (const row of rows.filter(({ isCurrent }) => isCurrent)) {
    place(row);
  }
  placeChips(frame, isOverview);
  const { origin } = model;
  placeLabel(
    {
      element: labels.root,
      at: point(origin.x, origin.y + 1.4, origin.z),
      opacity: showsWide ? 1 : 0,
      mode: "above",
    },
    project,
    width,
    placed,
  );
  labels.modules.forEach((element, m) => {
    const disc = at(model.modules, m).disc;
    const offset = frame.drawnRadius(disc, 0.9) * 0.72 + 5;
    placeLabel(
      { element, at: disc, opacity: showsWide ? 1 : 0, mode: "below", offset },
      project,
      width,
      placed,
    );
  });
  for (const row of rows.filter(({ isCurrent }) => !isCurrent)) {
    place(row);
  }
  labels.extras.forEach((element, n) => {
    const stop = at(model.extra.stops, n);
    const shows = story.extraReveal > 0.6 && story.q < 4 && !(onPhone && n);
    const offset = frame.drawnRadius(stop, 0.4) * 0.72 + 5;
    placeLabel(
      { element, at: stop, opacity: shows ? 1 : 0, mode: "below", offset },
      project,
      width,
      placed,
    );
  });
  for (const { step, stop, opacity } of rows) {
    const shows = opacity > 0 && stop.state === "todo" && !stop.isExam;
    const on = point(stop.position.x, stop.position.y + 0.17, stop.position.z);
    placeLabel(
      { element: step.number, at: on, opacity: shows ? opacity : 0, mode: "center" },
      project,
      width,
      placed,
      false,
    );
  }
}
