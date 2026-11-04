import { CONNECT_TEXT } from "@learning-routes/core/copy/connect";
import {
  CLIENT_COMMANDS,
  CLIENT_NAMES,
  CONNECT_CLIENTS,
  CONNECT_CLIENTS_TEXT,
  type ConnectClient,
} from "@learning-routes/core/copy/connect-clients";
import type { LocaleCode } from "@learning-routes/core/locales";
import { useRef, useState } from "react";
import { Button } from "../ui/button";

function CopyLine({ text, label, done }: { text: string; label: string; done: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="connect-address">
      <code className="connect-code">{text}</code>
      <Button
        size="small"
        emphasis="secondary"
        type="button"
        onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true))}
      >
        {copied ? done : label}
      </Button>
    </div>
  );
}

const ARROW_STEP: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };

/** One tab per assistant: at most three steps, and what to paste. */
export function ConnectTabs({ locale, address }: { locale: LocaleCode; address: string }) {
  const words = CONNECT_TEXT[locale];
  const clients = CONNECT_CLIENTS_TEXT[locale];
  const [open, setOpen] = useState<ConnectClient>("claude");
  const tabs = useRef(new Map<ConnectClient, HTMLButtonElement>());
  const command = CLIENT_COMMANDS[open]?.replace("{address}", address);
  const onKeyDown = (key: string) => {
    const step = ARROW_STEP[key];
    if (step === undefined) {
      return;
    }
    const count = CONNECT_CLIENTS.length;
    const next = CONNECT_CLIENTS[(CONNECT_CLIENTS.indexOf(open) + step + count) % count];
    if (next) {
      setOpen(next);
      tabs.current.get(next)?.focus();
    }
  };
  return (
    <div className="connect-tabs">
      <div className="connect-tablist" role="tablist" aria-label={clients.tabsLabel}>
        {CONNECT_CLIENTS.map((client) => (
          <button
            key={client}
            ref={(element) => {
              if (element) {
                tabs.current.set(client, element);
              }
            }}
            type="button"
            role="tab"
            id={`tab-${client}`}
            className="connect-tab"
            aria-selected={client === open}
            aria-controls="connect-panel"
            tabIndex={client === open ? 0 : -1}
            onClick={() => setOpen(client)}
            onKeyDown={(event) => onKeyDown(event.key)}
          >
            {CLIENT_NAMES[client]}
          </button>
        ))}
      </div>
      <div id="connect-panel" role="tabpanel" aria-labelledby={`tab-${open}`}>
        <ol className="connect-steps">
          {clients.steps[open].map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {command ? (
          <CopyLine text={command} label={clients.copyCommand} done={words.copied} />
        ) : (
          <CopyLine text={address} label={words.copyAddress} done={words.copied} />
        )}
      </div>
    </div>
  );
}
