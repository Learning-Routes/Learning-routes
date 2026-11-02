import { describe, expect, it } from "vitest";
import { UserProfile } from "../src/domain";
import { isTimeZone } from "../src/time-zone";

// A learner's day (FSRS limits, streaks) is counted in their time zone, so it
// must be one the runtime knows (Platform STEP 2 review, item 17). core checks
// it; the database no longer scans pg_timezone_names in a CHECK.
describe("time zones", () => {
  it("accepts the IANA names the runtime knows, and UTC", () => {
    for (const zone of ["UTC", "America/Mexico_City", "Europe/Madrid", "Asia/Kolkata"]) {
      expect(isTimeZone(zone)).toBe(true);
    }
  });

  it("refuses anything else", () => {
    for (const zone of ["Mars/Olympus", "", "GMT+25", "not a zone"]) {
      expect(isTimeZone(zone)).toBe(false);
    }
  });

  it("is what a user profile's time zone must be", () => {
    const profile = {
      userId: "0190f3a0-0000-7000-8000-000000000001",
      displayName: null,
      uiLocale: null,
    };
    expect(UserProfile.safeParse({ ...profile, timeZone: "Europe/Madrid" }).success).toBe(true);
    expect(UserProfile.safeParse({ ...profile, timeZone: "Mars/Olympus" }).success).toBe(false);
  });
});
