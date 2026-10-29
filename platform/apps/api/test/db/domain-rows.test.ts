import { Block } from "@learning-routes/core/blocks/schema";
import {
  Enrollment,
  Lesson,
  Membership,
  Module,
  Progress,
  ReviewCard,
  Route,
  Space,
} from "@learning-routes/core/domain";
import { drizzle } from "drizzle-orm/node-postgres";
import { describe, expect, it } from "vitest";
import { blocks, lessons, modules, routes } from "../../src/db/schema/content";
import { cards, enrollments, progress } from "../../src/db/schema/learning";
import { memberships, spaces } from "../../src/db/schema/tenancy";
import { newUser, rolledBack, URLS } from "./connect";
import { newVersion } from "./fixtures";

// The tables against core/domain.ts (Platform STEP 2 §2.18): one object per domain
// schema, parsed by core, mapped to its table's row and inserted through Drizzle.
// A domain value the database refuses, or a column the types do not allow, fails.
// The mappings below are the whole difference between the two shapes.

const ids = {
  space: "0190f3a0-0000-7000-8000-000000000101",
  route: "0190f3a0-0000-7000-8000-000000000102",
  module: "0190f3a0-0000-7000-8000-000000000103",
  lesson: "0190f3a0-0000-7000-8000-000000000104",
  block: "0190f3a0-0000-7000-8000-000000000105",
  enrollment: "0190f3a0-0000-7000-8000-000000000106",
};
const NOW = "2026-10-28T12:00:00.000Z";

describe("every table holds what core's domain schemas allow", () => {
  it("inserts one row per domain schema", async () => {
    await rolledBack(URLS.migrator, async (client) => {
      const db = drizzle(client, { casing: "snake_case" });
      const userId = await newUser(client);

      const space = Space.parse({
        id: ids.space,
        slug: "domain-rows",
        name: { en: "English Unlimited", es: "Inglés Ilimitado" },
        defaultLocale: "en",
        locales: ["en", "es"],
        createdAt: NOW,
      });
      await db.insert(spaces).values({ ...space, createdAt: new Date(space.createdAt) });

      const membership = Membership.parse({
        scope: "space",
        spaceId: ids.space,
        userId,
        role: "owner",
      });
      if (membership.scope === "space") {
        await db.insert(memberships).values(membership);
      }

      const route = Route.parse({
        id: ids.route,
        spaceId: ids.space,
        slug: "first-route",
        title: { en: "First route" },
        description: { en: "A route", es: "Una ruta" },
        sourceLocale: "en",
        access: "closed",
        pricing: "paid",
        version: 1,
        forkedFrom: null,
        createdAt: NOW,
        updatedAt: NOW,
      });
      await db.insert(routes).values({
        id: route.id,
        spaceId: route.spaceId,
        slug: route.slug,
        title: route.title,
        description: route.description,
        sourceLocale: route.sourceLocale,
        access: route.access,
        pricing: route.pricing,
        latestPublishedVersion: route.version,
        createdAt: new Date(route.createdAt),
        updatedAt: new Date(route.updatedAt),
      });

      const module = Module.parse({
        id: ids.module,
        routeId: ids.route,
        position: 0,
        title: { en: "M" },
      });
      // A domain position is an index; the table keeps core's fractional key for it.
      await db.insert(modules).values({ ...module, spaceId: ids.space, position: "V" });

      const block = Block.parse({
        id: ids.block,
        type: "concept",
        title: { en: "Idea" },
        body: { en: "Text" },
      });
      const lesson = Lesson.parse({
        id: ids.lesson,
        routeId: ids.route,
        moduleId: ids.module,
        position: 0,
        title: { en: "L" },
        prerequisites: [],
        blocks: [block],
      });
      await db.insert(lessons).values({
        id: lesson.id,
        spaceId: ids.space,
        routeId: lesson.routeId,
        moduleId: lesson.moduleId,
        position: "V",
        title: lesson.title,
      });
      const { id: blockId, type, ...data } = block;
      await db.insert(blocks).values({
        id: blockId,
        spaceId: ids.space,
        lessonId: lesson.id,
        position: "V",
        kind: type,
        data,
      });

      await newVersion(client, ids.space, ids.route, 1);
      const enrollment = Enrollment.parse({
        id: ids.enrollment,
        routeId: ids.route,
        routeVersion: 1,
        studentId: userId,
        offerId: null,
        source: "grant",
        status: "active",
        createdAt: NOW,
      });
      await db.insert(enrollments).values({
        id: enrollment.id,
        spaceId: ids.space,
        routeId: enrollment.routeId,
        userId: enrollment.studentId,
        pinnedVersion: enrollment.routeVersion,
        status: enrollment.status,
        createdAt: new Date(enrollment.createdAt),
      });

      const card = ReviewCard.parse({
        state: "review",
        reps: 3,
        lapses: 1,
        stability: 4.5,
        difficulty: 6.2,
        lastReviewAt: NOW,
        nextReviewAt: "2026-11-02T12:00:00.000Z",
      });
      const lessonProgress = Progress.parse({
        studentId: userId,
        routeId: ids.route,
        lessonId: ids.lesson,
        status: "completed",
        completedAt: NOW,
        blocks: [
          {
            blockId: ids.block,
            attempts: 2,
            correct: true,
            score: 100,
            releasedAt: null,
            completedAt: NOW,
          },
        ],
        review: card,
      });
      await db.insert(progress).values({
        enrollmentId: ids.enrollment,
        lessonId: lessonProgress.lessonId,
        spaceId: ids.space,
        userId: lessonProgress.studentId,
        status: lessonProgress.status,
        completedAt: lessonProgress.completedAt ? new Date(lessonProgress.completedAt) : null,
        blocks: lessonProgress.blocks,
      });
      await db.insert(cards).values({
        userId,
        spaceId: ids.space,
        itemId: ids.block,
        state: card.state,
        reps: card.reps,
        lapses: card.lapses,
        stability: card.stability,
        difficulty: card.difficulty,
        lastReviewAt: card.lastReviewAt ? new Date(card.lastReviewAt) : null,
        dueAt: card.nextReviewAt ? new Date(card.nextReviewAt) : null,
      });

      const counts = await client.query(
        `select (select count(*) from spaces where id = $1)::int + (select count(*) from blocks where space_id = $1)::int
              + (select count(*) from progress where space_id = $1)::int + (select count(*) from cards where space_id = $1)::int as n`,
        [ids.space],
      );
      expect(counts.rows[0]?.n).toBe(4);
    });
  });
});
