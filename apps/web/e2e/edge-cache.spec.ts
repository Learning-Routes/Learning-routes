import { expect, test } from "@playwright/test";
import { DEV } from "./screens";

// The edge cache on a repeated catalog load (Platform STEP 4 §7.2). The STEP's report asks
// for the hit rate: this prints it, and holds it.

const LOADS = 20;

test("a repeated catalog load is served from the edge cache", async ({ request }) => {
  const url = `${DEV}/es/explorar?carga=${crypto.randomUUID()}`;
  let hits = 0;
  for (let load = 0; load < LOADS; load++) {
    const response = await request.get(url);
    expect(response.status()).toBe(200);
    if (response.headers()["cf-cache-status"] === "HIT") {
      hits += 1;
    }
    // cache.put runs after the response: give the first one its moment.
    if (load === 0) {
      await new Promise((done) => setTimeout(done, 200));
    }
  }
  console.log(`edge cache: ${hits} hits in ${LOADS} loads of one catalog URL`);
  expect(hits).toBe(LOADS - 1);
});
