import { TUTOR_PATH } from "@learning-routes/core/studio/entries";
import { expect, it } from "vitest";
import { TUTOR_ASK } from "../app/player/tutor-path";

it("the tutor's panel asks where the tutor answers", () => {
  expect(TUTOR_ASK).toBe(TUTOR_PATH);
});
