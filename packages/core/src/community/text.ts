import * as z from "zod";

// What people write in a community (Platform STEP 17) is stored as written and shown as text,
// never as HTML. Only what no reader needs goes: control characters (a line break and a tab
// stay) and the marks that reverse the direction of text, which can disguise what a line says.

// shortcut(Platform STEP 17): one pass of removals, no Unicode normalisation; if lookalike
// letters become a problem, normalise to NFKC here.
function isUnseen(code: number): boolean {
  return (
    (code < 0x20 && code !== 0x0a && code !== 0x09) ||
    (code >= 0x7f && code <= 0x9f) ||
    code === 0x200e ||
    code === 0x200f ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

export function cleanText(text: string): string {
  return Array.from(text.replace(/\r\n?/g, "\n"))
    .filter((char) => !isUnseen(char.codePointAt(0) ?? 0))
    .join("")
    .trim();
}

/** A post's or a reply's text: 1 to 2,000 characters once cleaned. */
export const CommunityText = z
  .string()
  .max(8_000)
  .transform(cleanText)
  .pipe(z.string().min(1).max(2_000));

/** A name a person shows in the community: never an address. */
export const DisplayName = z
  .string()
  .max(200)
  .transform(cleanText)
  .pipe(
    z
      .string()
      .max(60)
      .refine((name) => !name.includes("@"), "a name, not an address"),
  );
