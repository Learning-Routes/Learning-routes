import { runAction } from "@learning-routes/core/actions/define";
import { ACTIONS } from "@learning-routes/core/actions/registry";
import { newBlockId } from "@learning-routes/core/ids";
import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { describe, expect, it } from "vitest";
import { pgRepos } from "../../src/db/repos/index";
import { pgTenancy } from "../../src/db/tenancy";
import { actAs, newUser, rolledBack, URLS } from "./connect";
import { newSpace } from "./fixtures";

// The first actions on real data (Platform STEP 2 §6), end to end on Postgres as
// lr_app, each actor under their own row-level security: the policies let every
// step of the happy path through.

function as(db: pg.Client, userId: string) {
  return async (name: string, input: unknown) => {
    await db.query("reset role");
    await actAs(db, userId);
    const orm = drizzle(db, { casing: "snake_case" });
    const result = await runAction(ACTIONS, name, input, {
      actor: { via: "ui", userId },
      repos: pgRepos(orm),
      tenancy: pgTenancy(orm),
      clock: { now: () => Date.UTC(2026, 9, 28, 12) },
      ids: { newId: () => newBlockId(Date.now(), crypto.getRandomValues(new Uint8Array(10))) },
    });
    if (!result.ok) {
      throw new Error(`${name}: ${JSON.stringify(result)}`);
    }
    return result.output as Record<string, unknown> & { revision: number; id: string };
  };
}

describe("the first actions, end to end on Postgres", () => {
  it("an owner builds and publishes a route; a newcomer enrolls, upgrades and reviews", async () => {
    await rolledBack(URLS.migrator, async (db) => {
      const ownerId = await newUser(db);
      const learnerId = await newUser(db);
      const spaceId = await newSpace(db, "end-to-end");
      await db.query("insert into memberships (space_id, user_id, role) values ($1, $2, 'owner')", [
        spaceId,
        ownerId,
      ]);
      const owner = as(db, ownerId);
      const learner = as(db, learnerId);

      expect(await owner("space.get", { spaceId })).toMatchObject({ id: spaceId });
      const { routeId } = (await owner("route.create", {
        spaceId,
        slug: "greetings",
        title: { en: "Greetings" },
        sourceLocale: "en",
        access: "open",
        pricing: "free",
      })) as unknown as { routeId: string };
      const module = await owner("module.add", {
        routeId,
        expectedRevision: 0,
        title: { en: "Hello" },
      });
      const lesson = await owner("lesson.add", {
        routeId,
        moduleId: module.id,
        expectedRevision: 1,
        title: { en: "Hi" },
      });
      const block = await owner("block.add", {
        routeId,
        lessonId: lesson.id,
        expectedRevision: 2,
        block: { type: "concept", title: { en: "Hi" }, body: { en: "Say hi." } },
      });
      expect(
        await owner("route.publish", { routeId, expectedRevision: block.revision }),
      ).toMatchObject({ version: 1 });
      expect(await owner("route.list", { spaceId })).toEqual([
        expect.objectContaining({ slug: "greetings", latestPublishedVersion: 1 }),
      ]);

      const { enrollmentId } = (await learner("enrollment.create", { routeId })) as unknown as {
        enrollmentId: string;
      };
      await owner("lesson.add", {
        routeId,
        moduleId: module.id,
        expectedRevision: 3,
        title: { en: "Bye" },
      });
      expect(await owner("route.publish", { routeId, expectedRevision: 4 })).toMatchObject({
        version: 2,
      });
      expect(await learner("enrollment.upgrade", { enrollmentId })).toEqual({ pinnedVersion: 2 });
      expect(
        await learner("review.submit", {
          enrollmentId,
          reviewId: crypto.randomUUID(),
          itemId: block.id,
          rating: 3,
          at: Date.UTC(2026, 9, 28, 12),
          elapsedMs: 1_500,
        }),
      ).toMatchObject({ duplicate: false });
      expect(
        await owner("membership.add", {
          spaceId,
          userId: await newUserAsMigrator(db),
          role: "coeditor",
        }),
      ).toMatchObject({
        role: "coeditor",
      });

      await db.query("reset role");
      const { rows } = await db.query(
        "select action, outcome from action_log where space_id = $1 order by at, action",
        [spaceId],
      );
      expect(rows.map((row) => row.action).sort()).toEqual(
        [
          "block.add",
          "enrollment.create",
          "enrollment.upgrade",
          "lesson.add",
          "lesson.add",
          "membership.add",
          "module.add",
          "review.submit",
          "route.create",
          "route.list",
          "route.publish",
          "route.publish",
          "space.get",
        ].sort(),
      );
      expect(rows.every((row) => row.outcome === "ok")).toBe(true);
    });
  });
});

async function newUserAsMigrator(db: pg.Client) {
  await db.query("reset role");
  return newUser(db);
}
