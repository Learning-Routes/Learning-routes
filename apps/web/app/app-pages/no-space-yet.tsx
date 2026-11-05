import type { ConnectText } from "@learning-routes/core/copy/connect";
import { ButtonLink } from "../ui/button";
import { Notice } from "../ui/parts";

/** Someone with no space yet, asked to connect an assistant: two ways forward, never a dead end. */
export function NoSpaceYet({ words, back }: { words: ConnectText; back: string }) {
  return (
    <>
      <Notice tone="info" title={words.noSpace} />
      <div className="connect-actions">
        <ButtonLink href="/ser-creador">{words.wantToTeach}</ButtonLink>
        <ButtonLink href="/mis-rutas" emphasis="secondary">
          {back}
        </ButtonLink>
      </div>
    </>
  );
}
