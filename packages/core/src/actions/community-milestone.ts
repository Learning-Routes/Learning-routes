import { DisplayName } from "../community/text";
import type { Snapshot } from "../content/snapshot";
import type { ProgressRecord, Repos } from "../repos/ports";
import type { Ctx } from "./define";

// A milestone (Platform STEP 17): when a learner finishes the last topic of a module, their
// route's community hears "finished module 2", if they turned sharing on in their profile. It is
// off until they do; row-level security refuses the row otherwise, too.

/** Posts the milestone when this finish completed its module. */
export async function milestoneAfter(
  ctx: Ctx,
  repos: Repos,
  place: { spaceId: string; routeId: string; snapshot: Snapshot },
  lessonId: string,
  records: ProgressRecord[],
) {
  const moduleId = place.snapshot.lessons.find((l) => l.id === lessonId)?.moduleId;
  const done = new Set(records.filter((r) => r.status === "completed").map((r) => r.lessonId));
  done.add(lessonId);
  const lessons = place.snapshot.lessons.filter((l) => l.moduleId === moduleId);
  if (!moduleId || lessons.length === 0 || lessons.some((l) => !done.has(l.id))) {
    return;
  }
  const profile = await repos.community.profile(ctx.actor.userId);
  if (!profile.sharesMilestones) {
    return;
  }
  // Modules in the order the route shows them: their position keys, compared as bytes.
  const order = [...place.snapshot.modules].sort((a, b) =>
    a.position < b.position ? -1 : a.position > b.position ? 1 : 0,
  );
  const name = DisplayName.safeParse(profile.displayName ?? ctx.actor.name ?? "");
  await repos.community.add(
    place.spaceId,
    {
      routeId: place.routeId,
      parentId: null,
      kind: "milestone",
      lessonId: null,
      moduleNumber: order.findIndex((m) => m.id === moduleId) + 1,
      body: null,
      authorId: ctx.actor.userId,
      authorName: name.success ? name.data : "",
      byCreator: false,
    },
    ctx.clock.now(),
  );
}
