import { expect, it } from "vitest";
import { repositoryContract } from "./contract";
import { memoryRepos, memoryState } from "./memory";

repositoryContract("in memory", async (test) => {
  const spaceId = crypto.randomUUID();
  const ownerId = crypto.randomUUID();
  const state = memoryState();
  state.spaces.set(spaceId, {
    id: spaceId,
    slug: "space",
    name: { en: "Space" },
    defaultLocale: "en",
    locales: ["en"],
  });
  state.members.set(`${spaceId}:${ownerId}`, { spaceId, userId: ownerId, role: "owner" });
  await test({
    spaceId,
    ownerId,
    learnerId: crypto.randomUUID(),
    actAs: async (userId) => memoryRepos(state, userId),
  });
});

it("refuses a transaction that would commit over another that committed after it began", async () => {
  const state = memoryState();
  const repos = memoryRepos(state, crypto.randomUUID());
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const slow = repos.transaction(async () => {
    await held;
  });
  await repos.transaction(async () => undefined);
  release();
  await expect(slow).rejects.toThrow("overlapping");
});
