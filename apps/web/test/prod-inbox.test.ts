import { describe, expect, it } from "vitest";
import { tokenIn } from "../e2e/prod/inbox";

// The production student check (STEP 11-prep §A3) reads its sign-in link from the proof inbox, a
// raw email as Email Routing delivered it. The token here is invented.

const TOKEN = "Zx9_test-only-token_0123456789abcdefABCDEF";
const LINK = `https://app.learningroutes.com/sign-in/confirm#token=${TOKEN}`;

const mail = (encoding: string, body: string) =>
  [
    "From: Learning Routes <hola@mail.learningroutes.com>",
    "Subject: Tu enlace para entrar",
    'Content-Type: multipart/alternative; boundary="b1"',
    "",
    "--b1",
    "Content-Type: text/plain; charset=utf-8",
    `Content-Transfer-Encoding: ${encoding}`,
    "",
    body,
    "--b1--",
  ].join("\r\n");

describe("the proof inbox's sign-in link", () => {
  it("is found in a quoted-printable body, soft line breaks and all", () => {
    const encoded = `Entra aqu=C3=AD: ${LINK.replace("=", "=3D").slice(0, 50)}=\r\n${LINK.replace("=", "=3D").slice(50)}`;
    expect(tokenIn(mail("quoted-printable", encoded))).toBe(TOKEN);
  });

  it("is found in a base64 body", () => {
    const encoded = Buffer.from(`Entra aquí: ${LINK}\n`)
      .toString("base64")
      .replace(/.{76}/g, "$&\r\n");
    expect(tokenIn(mail("base64", encoded))).toBe(TOKEN);
  });

  it("is null when the mail holds no link", () => {
    expect(tokenIn(mail("7bit", "Hola"))).toBeNull();
  });
});
