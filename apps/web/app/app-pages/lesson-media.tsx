import type { LocalizedText } from "@learning-routes/core/localized-text";
import { useState } from "react";
import { Button } from "../ui/button";
import type { ViewContext } from "./lesson-context";
import { Markdown } from "./markdown-view";

// What a creator brings that isn't words (Platform STEP 8 §1): images, video and cards.

const HTTPS = /^https:\/\//i;
const YOUTUBE =
  /^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)([\w-]{6,20})(?:[?&#/].*)?$/i;
const VIMEO = /^https:\/\/(?:www\.|player\.)?vimeo\.com\/(?:video\/)?(\d{4,12})(?:[?#/].*)?$/i;

/** The address to frame, with tracking off: YouTube's and Vimeo's own privacy modes. */
function videoEmbed(url: string) {
  const youtube = YOUTUBE.exec(url)?.[1];
  if (youtube) {
    return { host: "YouTube", src: `https://www.youtube-nocookie.com/embed/${youtube}` };
  }
  const vimeo = VIMEO.exec(url)?.[1];
  return vimeo ? { host: "Vimeo", src: `https://player.vimeo.com/video/${vimeo}?dnt=1` } : null;
}

export const safeAddress = (value: unknown) =>
  typeof value === "string" && HTTPS.test(value) && URL.canParse(value) ? value : null;

export function Figure({ context }: { context: ViewContext }) {
  const { block, md, text, words } = context;
  const [broken, setBroken] = useState(false);
  const source = safeAddress(block.data.image_url);
  const alt = text(block.data.alt_text) || String(block.data.image_description ?? "");
  const caption = text(block.data.caption);
  return (
    <figure className="lesson-figure settle-2">
      <Markdown nodes={md("body")} />
      {source && !broken ? (
        <img
          src={source}
          alt={alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      ) : (
        <p className="lesson-figure-missing" role="img" aria-label={alt || words.imageFailed}>
          {words.imageFailed}
          {alt ? ` ${alt}` : ""}
        </p>
      )}
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

/** Nothing of a third party loads until the person asks: not a frame, not a thumbnail. */
export function Video({ context }: { context: ViewContext }) {
  const { block, md, words } = context;
  const [playing, setPlaying] = useState(false);
  const address = safeAddress(block.data.video_url);
  const embed = address ? videoEmbed(address) : null;
  return (
    <section className="lesson-video settle-2">
      <Markdown nodes={md("body")} />
      {embed && playing ? (
        <iframe
          className="lesson-video-frame"
          src={embed.src}
          title={words.watchVideo}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation"
          allow="encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      ) : null}
      {embed && !playing ? (
        <div className="lesson-video-ask">
          <Button emphasis="secondary" onClick={() => setPlaying(true)}>
            {words.watchVideo}
          </Button>
          <p className="app-fine">{words.videoLoads.replace("{host}", embed.host)}</p>
        </div>
      ) : null}
      {!embed && address ? (
        <a className="text-link" href={address} rel="noopener nofollow ugc">
          {words.openVideo}
        </a>
      ) : null}
      {address ? null : <p className="app-fine">{words.videoMissing}</p>}
    </section>
  );
}

function Card({ front, back, flip }: { front: string; back: string; flip: string }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <li>
      <button
        type="button"
        className={`lesson-card${flipped ? " is-flipped" : ""}`}
        aria-pressed={flipped}
        onClick={() => setFlipped(!flipped)}
      >
        <span className="lesson-card-face lesson-card-front" aria-hidden={flipped}>
          {front}
        </span>
        <span className="lesson-card-face lesson-card-back" aria-hidden={!flipped}>
          {back}
        </span>
        <span className="lesson-card-hint">{flip}</span>
      </button>
    </li>
  );
}

export function Cards({ block, md, text, words }: ViewContext) {
  const cards = (block.data.cards as { front: LocalizedText; back: LocalizedText }[]) ?? [];
  return (
    <section className="lesson-cards settle-2">
      <Markdown nodes={md("body")} />
      <ul>
        {cards.map((card, index) => (
          <Card key={index} front={text(card.front)} back={text(card.back)} flip={words.flipCard} />
        ))}
      </ul>
    </section>
  );
}
