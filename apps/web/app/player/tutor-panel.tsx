import { TUTOR_PANEL_TEXT } from "@learning-routes/core/copy/tutor-panel";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Icon, usePlayer } from "./shared";
import "./tutor-panel.css";
import { TUTOR_ASK } from "./tutor-path";

// The tutor's conversation (Platform STEP 20 §A): a question about the topic on screen, and an
// answer that arrives as it is written. The server keeps every limit; this only shows what it says.

interface Turn {
  who: "me" | "tutor";
  text: string;
  failed?: boolean;
}

const QUESTION_CHARS = 600;

/** Reads the answer as it streams, handing over what has arrived so far. */
async function ask(body: object, onText: (soFar: string) => void): Promise<string | null> {
  const answer = await fetch(TUTOR_ASK, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!answer.ok || !answer.body) {
    const said = (await answer.json().catch(() => null)) as { message?: string } | null;
    return said?.message ?? "";
  }
  const reader = answer.body.pipeThrough(new TextDecoderStream()).getReader();
  let soFar = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return null;
    }
    soFar += value;
    onText(soFar);
  }
}

function Turns({ turns, thinking }: { turns: Turn[]; thinking: string }) {
  return turns.map((turn, index) => (
    <p
      key={index}
      className={`t-msg ${turn.who === "me" ? "t-me" : "t-tutor"}${turn.failed ? " is-failed" : ""}`}
    >
      {turn.text || thinking}
    </p>
  ));
}

export default function TutorPanel({
  enrollmentId,
  topic,
  beat,
  onClose,
}: {
  enrollmentId: string;
  topic: number;
  beat: number | null;
  onClose: () => void;
}) {
  const { locale } = usePlayer();
  const words = TUTOR_PANEL_TEXT[locale];
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  // Each new word scrolls the answer into view.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [turns]);

  const send = async (question: string) => {
    const asked = question.trim();
    if (asked === "" || isBusy) {
      return;
    }
    setIsBusy(true);
    setDraft("");
    setTurns((before) => [...before, { who: "me", text: asked }, { who: "tutor", text: "" }]);
    const answerWith = (text: string, failed = false) =>
      setTurns((before) => [...before.slice(0, -1), { who: "tutor", text, failed }]);
    try {
      const refused = await ask(
        { enrollment_id: enrollmentId, topic, beat, question: asked },
        answerWith,
      );
      if (refused !== null) {
        answerWith(refused || words.failed, true);
      }
    } catch {
      answerWith(words.failed, true);
    }
    setIsBusy(false);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send(draft);
  };

  return (
    <>
      <button
        type="button"
        className="p-icon-btn t-close"
        aria-label={words.close}
        onClick={onClose}
      >
        <Icon name="close" size={18} />
      </button>
      <div className="p-tutor-body t-thread" aria-live="polite">
        <p className="t-msg t-tutor">{words.hello}</p>
        {turns.length === 0 ? (
          <div className="t-starters">
            {words.starters.map((starter) => (
              <button
                key={starter}
                type="button"
                className="t-starter"
                onClick={() => send(starter)}
              >
                {starter}
              </button>
            ))}
          </div>
        ) : null}
        <Turns turns={turns} thinking={words.thinking} />
        <div ref={end} />
      </div>
      <form className="t-ask" onSubmit={submit}>
        <input
          className="t-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={QUESTION_CHARS}
          placeholder={words.placeholder}
          aria-label={words.placeholder}
          enterKeyHint="send"
        />
        <button type="submit" className="t-send" disabled={isBusy || draft.trim() === ""}>
          {words.send}
        </button>
      </form>
      <p className="t-note">{words.perDay}</p>
    </>
  );
}
