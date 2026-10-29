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
