import type { AssistantText } from "@learning-routes/core/copy/assistant";
import type { StudioInput } from "@learning-routes/core/studio/session";
import { useState } from "react";

// The box to answer the assistant in (Platform STEP 10). Before the first answer, sending it empty
// starts with the example, so the first step never feels like a blank form.

const ELLIPSIS = /…$/;

export function Ask({
  hasBegun,
  words,
  send,
}: {
  hasBegun: boolean;
  words: AssistantText;
  send: (input: StudioInput) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <form
      className="studio-ask"
      onSubmit={(event) => {
        event.preventDefault();
        const text = draft.trim() || (hasBegun ? "" : words.firstPlaceholder.replace(ELLIPSIS, ""));
        if (text) {
          setDraft("");
          send({ type: "message", text });
        }
      }}
    >
      <button type="button" className="studio-attach" aria-label={words.attach}>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l8.6-8.6a4 4 0 0 1 5.7 5.7l-8.6 8.6a2 2 0 0 1-2.8-2.8l8-8" />
        </svg>
      </button>
      <label htmlFor="studio-input" className="studio-sr">
        {hasBegun ? words.placeholder : words.opening}
      </label>
      <input
        id="studio-input"
        autoComplete="off"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={hasBegun ? words.placeholder : words.firstPlaceholder}
      />
      <button type="submit" className="studio-send" aria-label={words.send}>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      </button>
    </form>
  );
}
