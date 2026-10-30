import { LOCALES } from "@learning-routes/core/locales";
import { LocalizedText } from "@learning-routes/core/localized-text";
import { describe, expect, it } from "vitest";
import { query, URLS } from "./connect";

// The database's checks must accept exactly what core accepts (Platform STEP 2 §2).
const SAMPLES: unknown[] = [
  { en: "Hello" },
  { es: "Hola", en: "Hello", pt: "Olá", fr: "Bonjour", it: "Ciao" },
  { en: "" },
  {},
  { de: "Hallo" },
  { en: "Hello", de: "Hallo" },
  { en: 1 },
  { en: null },
  "Hello",
  ["en"],
  1,
];

describe("app.is_localized", () => {
  it.each(SAMPLES.map((sample) => [JSON.stringify(sample), sample]))(
    "agrees with core's LocalizedText on %s",
    async (_, sample) => {
      const [row] = await query(URLS.app, "select app.is_localized($1::jsonb) as ok", [
        JSON.stringify(sample),
      ]);
      expect(row?.ok).toBe(LocalizedText.safeParse(sample).success);
    },
  );
});

describe("app.is_locale_list", () => {
  it("accepts a non-empty list of core's locales, without repeats", async () => {
    const lists = [[...LOCALES], ["en"], [], ["en", "de"], ["en", "en"]];
    const rows = await query(
      URLS.app,
      "select app.is_locale_list(list::text[]) as ok from jsonb_array_elements_text($1::jsonb) as list",
      [JSON.stringify(lists.map((list) => `{${list.join(",")}}`))],
    );
    expect(rows.map((row: { ok: boolean }) => row.ok)).toEqual([true, true, false, false, false]);
  });
});
