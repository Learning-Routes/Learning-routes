import { useState } from "react";
import { Button } from "../ui/button";

export function CopyLine({ text, label, done }: { text: string; label: string; done: string }) {
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
