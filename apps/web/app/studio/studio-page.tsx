import type { AssistantText } from "@learning-routes/core/copy/assistant";
import { INITIAL_STUDIO_STATE, type StudioState } from "@learning-routes/core/studio/session";
import { useEffect, useMemo, useRef, useState } from "react";
import { filled } from "../storefront/words";
import type { StudioTransport } from "./session-transport";
import { Ask } from "./studio-ask";
import { Choices, Confirm, PreviewNote, RouteList, Said, StudioTop } from "./studio-parts";
import { syncMap, useConversation, useStudioMap } from "./use-studio";

// The creator's assistant (Platform STEP 10): a night map where every answer is a fork in the
// trail and the route is drawn as it is planned and built. Subtitles, choices and the route's list
// are page text; the map only adds the picture.

function usePublishedToast(publishedAt: string | null, words: AssistantText) {
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!publishedAt) {
      return;
    }
    setToast(filled(words.publishedAt, { address: publishedAt }));
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [publishedAt, words]);
  return toast;
}

export function StudioPage({
  words,
  connect,
}: {
  words: AssistantText;
  connect: () => StudioTransport;
}) {
  const { state, send } = useConversation(connect);
  const [hot, setHot] = useState(-1);
  const [isClient, setIsClient] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLElement>(null);
  const note = useRef<HTMLDivElement>(null);
  const leader = useRef<HTMLDivElement>(null);
  const parts = useMemo(() => ({ canvas, overlay, stage }), []);
  const latest = useRef(state);
  latest.current = state;
  const choose = (branch: number) => {
    const option = latest.current.options[branch];
    if (option) {
      setHot(-1);
      send({ type: "choice", optionId: option.id });
    }
  };
  const { map, hasMap, hasFailed } = useStudioMap(parts, words.startHere, choose, setHot);
  const drawn = useRef<StudioState>(INITIAL_STUDIO_STATE);
  useEffect(() => setIsClient(true), []);
  useEffect(() => {
    if (map.current) {
      syncMap(map.current, hasMap ? drawn.current : INITIAL_STUDIO_STATE, state, words, {
        note: note.current,
        leader: leader.current,
      });
      drawn.current = state;
    }
  }, [state, words, hasMap, map]);
  useEffect(() => map.current?.setHot(hot), [hot, map]);
  const toast = usePublishedToast(state.publishedAt, words);

  return (
    <div className={`studio${hasMap ? " has-map" : ""}`}>
      <canvas ref={canvas} className="studio-canvas" />
      <div className="studio-shade" aria-hidden="true" />
      <div ref={overlay} className="studio-overlay" aria-hidden="true" />
      <div ref={leader} className={`studio-leader${state.preview && hasMap ? " is-on" : ""}`} />
      <StudioTop state={state} words={words} />
      <RouteList state={state} words={words} isHidden={hasMap} />
      <PreviewNote preview={state.preview} words={words} isPinned={hasMap} noteRef={note} />
      <main ref={stage} className={`studio-stage${state.hasBegun ? "" : " is-first"}`}>
        {hasFailed ? <p className="studio-status">{words.noMap}</p> : null}
        <p className="studio-status" role="status">
          {state.working ? <span className="studio-status-dot" aria-hidden="true" /> : null}
          {state.working}
        </p>
        <Said text={state.hasBegun ? state.said : words.opening} isClient={isClient} />
        <Confirm state={state} words={words} send={send} />
        <Choices state={state} hot={hot} setHot={setHot} choose={choose} />
        <Ask hasBegun={state.hasBegun} words={words} send={send} />
        {state.hasBegun ? null : <p className="studio-hint">{words.hint}</p>}
      </main>
      <div className={`studio-toast${toast ? " is-on" : ""}`} role="status">
        {toast}
      </div>
    </div>
  );
}
