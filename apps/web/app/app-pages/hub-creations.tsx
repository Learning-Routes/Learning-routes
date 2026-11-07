import { CREATOR_CREATIONS_TEXT } from "@learning-routes/core/copy/creator-creations";
import type { LocaleCode } from "@learning-routes/core/locales";
import type { LocalizedText } from "@learning-routes/core/localized-text";
import { useEffect, useRef, useState } from "react";
import { filled, inLocale } from "../storefront/words";
import { Button } from "../ui/button";

// A route's creations in the hub (Platform STEP 9 §4): each with the thumbnail taken on upload,
// a new version in its place, or out of the draft. Every form works with no script; the API
// checks who is asking.

export interface HubCreation {
  blockId: string;
  title: LocalizedText;
  lesson: LocalizedText;
  thumbnail: string | null;
}

function Thumbnail({ src, missing }: { src: string | null; missing: string }) {
  const [broken, setBroken] = useState(src === null);
  const [loaded, setLoaded] = useState(false);
  const image = useRef<HTMLImageElement>(null);
  // An image that failed before the page ran sent its error to no one.
  useEffect(() => {
    if (image.current?.complete) {
      image.current.naturalWidth === 0 ? setBroken(true) : setLoaded(true);
    }
  }, []);
  return broken ? (
    <p className="hub-creation-thumb app-fine">{missing}</p>
  ) : (
    <img
      ref={image}
      className={`hub-creation-thumb${loaded ? "" : " is-loading"}`}
      src={src ?? undefined}
      alt=""
      loading="lazy"
      decoding="async"
      onLoad={() => setLoaded(true)}
      onError={() => setBroken(true)}
    />
  );
}

function Hidden({
  routeId,
  revision,
  blockId,
}: {
  routeId: string;
  revision: number;
  blockId: string;
}) {
  return (
    <>
      <input type="hidden" name="routeId" value={routeId} />
      <input type="hidden" name="revision" value={revision} />
      <input type="hidden" name="blockId" value={blockId} />
    </>
  );
}

export function HubCreations({
  creations,
  routeId,
  revision,
  locale,
}: {
  creations: HubCreation[];
  routeId: string;
  revision: number;
  locale: LocaleCode;
}) {
  const words = CREATOR_CREATIONS_TEXT[locale];
  if (creations.length === 0) {
    return null;
  }
  return (
    <section className="hub-creations">
      <h4 className="hub-creations-title">{words.title}</h4>
      <ul>
        {creations.map((creation) => {
          const title = inLocale(creation.title, locale);
          const ids = { routeId, revision, blockId: creation.blockId };
          return (
            <li key={creation.blockId} className="hub-creation">
              <Thumbnail src={creation.thumbnail} missing={words.noThumbnail} />
              <p className="hub-creation-name">{title}</p>
              <p className="app-fine">
                {filled(words.inLesson, { lesson: inLocale(creation.lesson, locale) })}
              </p>
              <details>
                <summary className="text-link">{words.replace}</summary>
                <form method="post" encType="multipart/form-data" className="hub-creation-form">
                  <input type="hidden" name="intent" value="replace" />
                  <Hidden {...ids} />
                  <label className="field">
                    <span className="field-label">{words.replaceFile}</span>
                    <input type="file" name="file" accept=".html,.htm,text/html" required />
                  </label>
                  <Button type="submit" size="small" emphasis="secondary">
                    {words.replace}
                  </Button>
                </form>
              </details>
              <details>
                <summary className="text-link">{words.remove}</summary>
                <form method="post" className="hub-creation-form">
                  <input type="hidden" name="intent" value="remove" />
                  <Hidden {...ids} />
                  <p className="app-fine">{words.removeNote}</p>
                  <Button type="submit" size="small" emphasis="secondary">
                    {words.removeConfirm}
                  </Button>
                </form>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
