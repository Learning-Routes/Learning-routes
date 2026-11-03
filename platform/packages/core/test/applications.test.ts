import { describe, expect, it } from "vitest";
import { CreatorApplication } from "../src/applications";

const VALID = { name: "Ana", email: "ana@example.com", teaches: "Guitarra", locale: "es" };

describe("an application to teach (Platform STEP 4 §6.3)", () => {
  it("takes a name, an address, what they teach and a language", () => {
    expect(CreatorApplication.parse(VALID)).toEqual(VALID);
  });

  it("takes an optional web link, and no other kind", () => {
    expect(CreatorApplication.safeParse({ ...VALID, link: "https://a.test/x" }).success).toBe(true);
    expect(CreatorApplication.safeParse({ ...VALID, link: null }).success).toBe(true);
    for (const link of ["javascript:alert(1)", "data:text/html,x", "a.test"]) {
      expect(CreatorApplication.safeParse({ ...VALID, link }).success, link).toBe(false);
    }
  });

  it("trims what it keeps, and refuses a field it does not know", () => {
    expect(CreatorApplication.parse({ ...VALID, name: "  Ana  " }).name).toBe("Ana");
    expect(CreatorApplication.safeParse({ ...VALID, status: "invited" }).success).toBe(false);
  });
});
