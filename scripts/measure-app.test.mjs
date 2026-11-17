import assert from "node:assert/strict";
import { test } from "node:test";
import { median, phasesOf } from "./measure-app.mjs";

test("reads each phase's duration, adding a name that comes twice", () => {
  assert.deepEqual(phasesOf("api-lesson.play;dur=12.5, page;dur=40, api-lesson.play;dur=1.5"), {
    "api-lesson.play": 14,
    page: 40,
  });
  assert.deepEqual(phasesOf("cache;desc=hit, total;dur=3"), { total: 3 });
  assert.deepEqual(phasesOf(null), {});
});

test("takes the middle value, or the mean of the two middle ones", () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});
