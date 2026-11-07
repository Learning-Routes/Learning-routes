import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import type { ViewContext } from "./lesson-context";

// A creator's interactive creation (Platform STEP 9 §3), in its own box on the content host: an
// opaque origin that can run its scripts and nothing more. It loads once the lesson is on screen
// and the frame is near. The only thing the page takes from it is { type: "lr:done" }, from its own
// frame; saving that waits for a later step. Until the page runs (canFill is null), or when the
// frame never loads, the box says what the activity needs.

/** How long a frame has to load before the page says it could not. */
const WAIT_MS = 15_000;

export function Creation({ context }: { context: ViewContext }) {
  const { block, text, words, creator } = context;
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [near, setNear] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(false);
  const [canFill, setCanFill] = useState<boolean | null>(null);
  const title = text(block.data.title) || words.activity;
  const description = text(block.data.description);
  const alt = text(block.data.alt_text);

  useEffect(() => {
    setCanFill(document.fullscreenEnabled);
    const watcher = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          watcher.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    if (box.current) {
      watcher.observe(box.current);
    }
    const heard = (event: MessageEvent) => {
      if (event.source === frame.current?.contentWindow && event.data?.type === "lr:done") {
        setDone(true);
      }
    };
    window.addEventListener("message", heard);
    return () => {
      watcher.disconnect();
      window.removeEventListener("message", heard);
    };
  }, []);

  useEffect(() => {
    if (!near || loaded) {
      return;
    }
    const timer = setTimeout(() => setFailed(true), WAIT_MS);
    return () => clearTimeout(timer);
  }, [near, loaded]);

  return (
    <section className="lesson-video lesson-creation settle-2">
      {description ? <p>{description}</p> : null}
      <div
        ref={box}
        className="lesson-video-frame lesson-creation-box"
        data-shape={block.data.shape ?? "standard"}
      >
        {near && block.frame ? (
          <iframe
            ref={frame}
            className="lesson-video-frame lesson-creation-frame"
            src={block.frame}
            title={title}
            sandbox="allow-scripts"
            allow="autoplay"
            referrerPolicy="no-referrer"
            onLoad={() => {
              setLoaded(true);
              setFailed(false);
            }}
          />
        ) : null}
        {canFill === null || failed || !block.frame ? (
          <p className="lesson-creation-needs app-fine">{words.creationNeeds}</p>
        ) : null}
      </div>
      {alt ? <p>{alt}</p> : null}
      <p className="app-fine">{words.madeBy.replace("{creator}", () => creator)}</p>
      {canFill && loaded ? (
        <Button emphasis="secondary" onClick={() => box.current?.requestFullscreen()}>
          {words.fullScreen}
        </Button>
      ) : null}
      <p className="lesson-feedback lesson-feedback-right" role="status">
        {done ? words.creationDone : ""}
      </p>
    </section>
  );
}
