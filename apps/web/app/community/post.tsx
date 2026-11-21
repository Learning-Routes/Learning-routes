import type { CommunityText } from "@learning-routes/core/copy/community";
import type { CommunityItem } from "@learning-routes/core/repos/community-ports";
import { Form } from "react-router";

// One post of a route's community, with its replies (Platform STEP 22). Every action is a plain
// form post, so it works before the page hydrates; text is rendered as text, never as HTML.

export type Post = CommunityItem & { replies: CommunityItem[] };

const HUES = ["a", "b", "c", "d", "e", "f"];
const toneOf = (name: string) => HUES[(name.codePointAt(0) ?? 0) % HUES.length];

export function Face({ name }: { name: string }) {
  return (
    <span className={`cm-face cm-face-${toneOf(name)}`} aria-hidden="true">
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

const UNITS: [number, Intl.RelativeTimeFormatUnit][] = [
  [86_400_000, "day"],
  [3_600_000, "hour"],
  [60_000, "minute"],
];

/** "hace 3 horas", in the reader's language, from the server's clock so both renders agree. */
export function ago(then: number, now: number, locale: string, justNow: string) {
  const gap = Math.max(0, now - then);
  const unit = UNITS.find(([size]) => gap >= size);
  if (!unit) {
    return justNow;
  }
  return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(
    -Math.floor(gap / unit[0]),
    unit[1],
  );
}

interface Shared {
  words: CommunityText;
  locale: string;
  now: number;
}

function Useful({ item, words }: { item: CommunityItem; words: CommunityText }) {
  return (
    <Form method="post" preventScrollReset className="cm-inline">
      <input type="hidden" name="intent" value="useful" />
      <input type="hidden" name="postId" value={item.id} />
      <input type="hidden" name="on" value={item.markedUseful ? "0" : "1"} />
      <button type="submit" className="cm-act" aria-pressed={item.markedUseful}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 11v9H4v-9zM7 11l4-8a2.5 2.5 0 0 1 2.4 3.2L12.600 9H18a2 2 0 0 1 2 2.400l-1.300 7A2 2 0 0 1 16.700 20H7" />
        </svg>
        {`${words.useful} ${item.usefulCount}`}
      </button>
    </Form>
  );
}

function Report({ item, words }: { item: CommunityItem; words: CommunityText }) {
  return (
    <details className="cm-more">
      <summary className="cm-act">{words.report}</summary>
      <Form method="post" preventScrollReset className="cm-report">
        <input type="hidden" name="intent" value="report" />
        <input type="hidden" name="postId" value={item.id} />
        <button type="submit" name="reason" value="spam" className="cm-choice">
          {words.reportSpam}
        </button>
        <button type="submit" name="reason" value="abuse" className="cm-choice">
          {words.reportAbuse}
        </button>
        <button type="submit" name="reason" value="other" className="cm-choice">
          {words.reportOther}
        </button>
      </Form>
    </details>
  );
}

function Byline({ item, words, locale, now }: { item: CommunityItem } & Shared) {
  return (
    <p className="cm-by">
      <b>{item.authorName || words.someone}</b>
      {item.byCreator ? <span className="cm-teacher">{words.byCreator}</span> : null}
      <time dateTime={new Date(item.createdAt).toISOString()}>
        {ago(item.createdAt, now, locale, words.now)}
      </time>
    </p>
  );
}

function Reply({ item, ...shared }: { item: CommunityItem } & Shared) {
  const { words } = shared;
  return (
    <li className={`cm-reply ${item.isAnswer ? "is-answer" : ""}`}>
      <Face name={item.authorName} />
      <div className="cm-bubble">
        {item.isAnswer ? <p className="cm-flag">{words.answer}</p> : null}
        <Byline item={item} {...shared} />
        <p className="cm-text">{item.isDeleted ? words.deleted : item.body}</p>
        {item.isHidden ? <p className="cm-hidden">{words.hidden}</p> : null}
        <div className="cm-acts">
          <Useful item={item} words={words} />
          <Report item={item} words={words} />
        </div>
      </div>
    </li>
  );
}

export function PostCard({ post, ...shared }: { post: Post } & Shared) {
  const { words } = shared;
  const kind =
    post.kind === "question" || post.kind === "win" || post.kind === "note" ? post.kind : "note";
  const label = { question: words.kindQuestion, win: words.kindWin, note: words.kindNote }[kind];
  return (
    <li className="cm-post" id={`p-${post.id}`}>
      {post.isPinned ? <p className="cm-flag">{words.pinned}</p> : null}
      <header className="cm-head">
        <Face name={post.authorName} />
        <Byline item={post} {...shared} />
      </header>
      <span className={`cm-kind cm-kind-${kind}`}>{label}</span>
      <p className="cm-text cm-text-post">{post.isDeleted ? words.deleted : post.body}</p>
      {post.isHidden ? <p className="cm-hidden">{words.hidden}</p> : null}
      <div className="cm-acts">
        <Useful item={post} words={words} />
        <span className="cm-count">
          {words.replies.replace("{n}", String(post.replies.length))}
        </span>
        <Report item={post} words={words} />
      </div>
      {post.replies.length ? (
        <ol className="cm-replies">
          {post.replies.map((reply) => (
            <Reply key={reply.id} item={reply} {...shared} />
          ))}
        </ol>
      ) : null}
      {post.isDeleted ? null : (
        <Form method="post" preventScrollReset className="cm-answer" key={post.replies.length}>
          <input type="hidden" name="intent" value="reply" />
          <input type="hidden" name="postId" value={post.id} />
          <input
            className="cm-input"
            name="body"
            required
            maxLength={2000}
            placeholder={words.replyPlaceholder}
            aria-label={words.replyPlaceholder}
            autoComplete="off"
          />
          <button type="submit" className="button button-primary button-small">
            <span className="button-label">{words.send}</span>
          </button>
        </Form>
      )}
    </li>
  );
}
