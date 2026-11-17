import { runAction } from "@learning-routes/core/actions/define";
import { ACTIONS } from "@learning-routes/core/actions/registry";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { pgRepos } from "../../src/db/repos/index";
import { pgTenancy } from "../../src/db/tenancy";
import { actAs, attempt, backendPid, blockedOrDone, newUser, rolledBack, URLS } from "./connect";
import { newEnrollment, newRoute, newSpace } from "./fixtures";

// A route's community on Postgres (Platform STEP 17), one test per rule, through the actions as
// lr_app under each person's row-level security, and as raw SQL where the second fence must
// hold on its own. Fictional people only.

const RLS_REFUSED = /row-level security/;
const ONLY_A_CREATOR = /only a creator/;
const PERMISSION_DENIED = /permission denied/;

interface World {
  db: pg.Client;
  space: string;
  route: string;
  owner: string;
  ana: string;
  beto: string;
  /** A learner of the same space, in another of its routes. */
  carla: string;
  /** Nobody in the space. */
  dani: string;
  operator: string;
}

async function world(db: pg.Client): Promise<World> {
  const space = await newSpace(db, "comunidad");
  const route = await newRoute(db, space, "ruta");
  const other = await newRoute(db, space, "otra");
  for (const routeId of [route, other]) {
    // Published, with the title a feed shows.
    await db.query(
      `insert into route_versions (space_id, route_id, version, snapshot, snapshot_format, content_hash, published_by_user_id)
       values ($1, $2, 1, '{"route": {"title": {"en": "A route"}}}', 1, repeat('0', 64), uuidv7())`,
      [space, routeId],
    );
    await db.query("update routes set latest_published_version = 1 where id = $1", [routeId]);
  }
  const [owner, ana, beto, carla, dani, operator] = [
    await newUser(db),
    await newUser(db),
    await newUser(db),
    await newUser(db),
    await newUser(db),
    await newUser(db),
  ];
  await db.query(
    `insert into memberships (space_id, user_id, role)
     values ($1, $2, 'owner'), ($1, $3, 'student'), ($1, $4, 'student'), ($1, $5, 'student')`,
    [space, owner, ana, beto, carla],
  );
  await newEnrollment(db, space, route, ana);
  await newEnrollment(db, space, route, beto);
  await newEnrollment(db, space, other, carla);
  await db.query("insert into platform_roles (user_id, is_operator) values ($1, true)", [operator]);
  return { db, space, route, owner, ana, beto, carla, dani, operator };
}

/** Runs an action as one person, as the Worker does: lr_app, their row-level security. */
async function as(w: World, userId: string, action: string, input: object, now = Date.now()) {
  await w.db.query("reset role");
  await actAs(w.db, userId);
  const orm = drizzle(w.db, { casing: "snake_case" });
  return runAction(ACTIONS, action, input, {
    actor: { via: "ui", userId, name: "Persona Inventada" },
    repos: pgRepos(orm),
    tenancy: pgTenancy(orm),
    clock: { now: () => now },
    ids: { newId: () => crypto.randomUUID() },
  });
}

const output = <T>(result: unknown) => (result as { output: T }).output;
const posted = async (w: World, userId: string, body = "¿Cómo se pide la cuenta?") =>
  output<{ id: string }>(
    await as(w, userId, "community.post", { routeId: w.route, kind: "question", body }),
  ).id;
const listed = async (w: World, userId: string) =>
  output<{ items: { id: string; isHidden: boolean; body: string | null; replies: unknown[] }[] }>(
    await as(w, userId, "community.list", { routeId: w.route }),
  ).items;

describe("a route's community, on Postgres", () => {
  it("is read by whoever is enrolled in the route and by its creators; anyone else hears not_found", () =>
    rolledBack(URLS.migrator, async (db) => {
      const w = await world(db);
      const id = await posted(w, w.ana);
      expect((await listed(w, w.beto)).map((post) => post.id)).toEqual([id]);
      expect((await listed(w, w.owner)).map((post) => post.id)).toEqual([id]);
      for (const outsider of [w.carla, w.dani]) {
        expect(await as(w, outsider, "community.list", { routeId: w.route })).toMatchObject({
          ok: false,
          code: "not_found",
        });
        // The second fence on its own: not one row.
        const { rows } = await db.query("select count(*)::int as n from community_posts");
        expect(rows[0]?.n).toBe(0);
      }
      // With no user set, nothing at all.
      await actAs(db, null);
      expect((await db.query("select count(*)::int as n from community_posts")).rows[0]?.n).toBe(0);
    }));

  it("is written in only by them: an outsider's post is not_found, and the database refuses it too", () =>
    rolledBack(URLS.migrator, async (db) => {
      const w = await world(db);
      expect(
        await as(w, w.carla, "community.post", { routeId: w.route, kind: "note", body: "hola" }),
      ).toMatchObject({ code: "not_found" });
      const refused = await attempt(
        db,
        `insert into community_posts (space_id, route_id, author_id, kind, body)
         values ($1, $2, $3, 'note', 'colada')`,
        [w.space, w.route, w.carla],
      );
      expect(refused).toMatch(RLS_REFUSED);
      // Nor as someone else.
      await as(w, w.ana, "profile.get", {});
      expect(
        await attempt(
          db,
          `insert into community_posts (space_id, route_id, author_id, kind, body)
           values ($1, $2, $3, 'note', 'suplantada')`,
          [w.space, w.route, w.beto],
        ),
      ).toMatch(RLS_REFUSED);
    }));

  it("lets only a creator hide; the author and the creators still see it, marked hidden", () =>
    rolledBack(URLS.migrator, async (db) => {
      const w = await world(db);
      const id = await posted(w, w.ana);
      expect(
        await as(w, w.beto, "community.hide", { routeId: w.route, postId: id, hidden: true }),
      ).toMatchObject({ code: "creator_required" });
      // Row-level security leaves Ana her own post to update: the trigger still says no.
      await as(w, w.ana, "profile.get", {});
      expect(
        await attempt(db, "update community_posts set hidden_at = now() where id = $1", [id]),
      ).toMatch(ONLY_A_CREATOR);
      expect(
        await as(w, w.owner, "community.hide", { routeId: w.route, postId: id, hidden: true }),
      ).toMatchObject({ ok: true });
      expect(await listed(w, w.ana)).toMatchObject([{ id, isHidden: true }]);
      expect(await listed(w, w.owner)).toMatchObject([{ id, isHidden: true }]);
      expect(await listed(w, w.beto)).toEqual([]);
    }));

  it("hides an item reported by three different people until it is reviewed", () =>
    rolledBack(URLS.migrator, async (db) => {
      const w = await world(db);
      const reporter = await newUser(db);
      await db.query(
        "insert into memberships (space_id, user_id, role) values ($1, $2, 'student')",
        [w.space, reporter],
      );
      await newEnrollment(db, w.space, w.route, reporter);
      const id = await posted(w, w.ana);
      const report = (who: string) =>
        as(w, who, "community.report", { routeId: w.route, postId: id, reason: "abuse" });
      expect(await report(w.beto)).toMatchObject({ ok: true });
      expect(await report(w.beto)).toMatchObject({ code: "conflict" });
      expect(await report(w.owner)).toMatchObject({ ok: true });
      expect(await listed(w, w.beto)).toHaveLength(1);
      expect(await report(reporter)).toMatchObject({ ok: true });
      expect(await listed(w, w.beto)).toEqual([]);
      expect(await listed(w, w.ana)).toMatchObject([{ id, isHidden: true }]);
      // The operator reviews it: restored, and the reports closed.
      const open = output<{ postId: string; reports: number }[]>(
        await as(w, w.operator, "community.reports", {}),
      );
      expect(open).toMatchObject([{ postId: id, reports: 3 }]);
      expect(
        await as(w, w.operator, "community.moderate", { postId: id, decision: "restore" }),
      ).toMatchObject({ ok: true });
      expect(await listed(w, w.beto)).toHaveLength(1);
      expect(output<unknown[]>(await as(w, w.operator, "community.reports", {}))).toEqual([]);
    }));

  it("a block: the blocked person's posts are gone for the blocker, and they cannot reply to them", () =>
    rolledBack(URLS.migrator, async (db) => {
      const w = await world(db);
      const own = await posted(w, w.beto, "De Beto");
      await posted(w, w.ana, "De Ana");
      expect(
        await as(w, w.beto, "community.block", { userId: w.ana, blocked: true }),
      ).toMatchObject({
        ok: true,
      });
      expect((await listed(w, w.beto)).map((post) => post.body)).toEqual(["De Beto"]);
      expect(
        await as(w, w.ana, "community.reply", { routeId: w.route, postId: own, body: "hola" }),
      ).toMatchObject({ code: "not_found" });
      expect(
        await attempt(
          db,
          `insert into community_posts (space_id, route_id, parent_id, author_id, body)
           values ($1, $2, $3, $4, 'colada')`,
          [w.space, w.route, own, w.ana],
        ),
      ).toMatch(RLS_REFUSED);
    }));

  it("takes ten posts an hour from one person, and says so with rate_limited", () =>
    rolledBack(URLS.migrator, async (db) => {
      const w = await world(db);
      for (let n = 0; n < 10; n += 1) {
        await posted(w, w.ana, `nota ${n}`);
      }
      expect(
        await as(w, w.ana, "community.post", { routeId: w.route, kind: "note", body: "otra" }),
      ).toMatchObject({ code: "rate_limited" });
      expect(
        await as(
          w,
          w.ana,
          "community.post",
          { routeId: w.route, kind: "note", body: "otra" },
          Date.now() + 3_600_001,
        ),
      ).toMatchObject({ ok: true });
    }));

  it("tells the author of a reply, an answer and a pin, and only them", () =>
    rolledBack(URLS.migrator, async (db) => {
      const w = await world(db);
      const id = await posted(w, w.ana);
      const reply = output<{ id: string }>(
        await as(w, w.beto, "community.reply", { routeId: w.route, postId: id, body: "Así." }),
      ).id;
      await as(w, w.owner, "community.pin", { routeId: w.route, postId: id, pinned: true });
      await as(w, w.owner, "community.answer", { routeId: w.route, replyId: reply, answer: true });
      const ana = output<{ items: { kind: string }[]; unread: number }>(
        await as(w, w.ana, "notification.list", {}),
      );
      expect(ana.items.map((n) => n.kind).sort()).toEqual(["pinned", "reply"]);
      expect(ana.unread).toBe(2);
      const beto = output<{ items: { kind: string }[] }>(
        await as(w, w.beto, "notification.list", {}),
      );
      expect(beto.items.map((n) => n.kind)).toEqual(["answer"]);
      await as(w, w.ana, "notification.read", {});
      expect(output<{ unread: number }>(await as(w, w.ana, "notification.list", {})).unread).toBe(
        0,
      );
      // Nobody writes a notification by hand.
      expect(
        await attempt(
          db,
          "insert into notifications (user_id, space_id, post_id, kind) values ($1, $2, $3, 'reply')",
          [w.beto, w.space, id],
        ),
      ).toMatch(PERMISSION_DENIED);
    }));

  it("a deleted post keeps its replies, and its text and name go", () =>
    rolledBack(URLS.migrator, async (db) => {
      const w = await world(db);
      const id = await posted(w, w.ana);
      await as(w, w.beto, "community.reply", { routeId: w.route, postId: id, body: "Así." });
      expect(
        await as(w, w.beto, "community.delete", { routeId: w.route, postId: id }),
      ).toMatchObject({
        code: "not_found",
      });
      expect(
        await as(w, w.ana, "community.delete", { routeId: w.route, postId: id }),
      ).toMatchObject({
        ok: true,
      });
      const [post] = await listed(w, w.beto);
      expect(post).toMatchObject({ body: null, authorName: "", isDeleted: true });
      expect(post?.replies).toHaveLength(1);
    }));

  it("a follower sees the creators' own posts in their feed; the count is public, never who", () =>
    rolledBack(URLS.migrator, async (db) => {
      const w = await world(db);
      await posted(w, w.owner, "Novedad del curso");
      await posted(w, w.ana, "De una alumna");
      expect(
        await as(w, w.dani, "community.follow", { spaceId: w.space, follow: true }),
      ).toMatchObject({
        ok: true,
      });
      const feed = output<{ items: { body: string; routeTitle: unknown }[] }>(
        await as(w, w.dani, "community.feed", {}),
      );
      expect(feed.items).toMatchObject([
        { body: "Novedad del curso", routeTitle: { en: "A route" } },
      ]);
      expect(
        await as(w, w.dani, "community.follow", { spaceId: crypto.randomUUID(), follow: true }),
      ).toMatchObject({ code: "not_found" });
      await db.query("reset role");
      await db.query("set local role lr_public");
      const { rows } = await db.query(
        "select followers from public_space_followers where space_id = $1",
        [w.space],
      );
      expect(rows).toEqual([{ followers: 1 }]);
      expect(await attempt(db, "select * from community_follows")).toMatch(PERMISSION_DENIED);
    }));

  it("a milestone is shared only once the learner turned sharing on", () =>
    rolledBack(URLS.migrator, async (db) => {
      const w = await world(db);
      const milestone = `insert into community_posts (space_id, route_id, author_id, kind, module_number)
                         values ($1, $2, $3, 'milestone', 1)`;
      await as(w, w.ana, "profile.get", {});
      expect(await attempt(db, milestone, [w.space, w.route, w.ana])).toMatch(RLS_REFUSED);
      await as(w, w.ana, "profile.update", { sharesMilestones: true });
      expect(await attempt(db, milestone, [w.space, w.route, w.ana])).toBeNull();
    }));

  it("the operator may ban someone from writing in any community", () =>
    rolledBack(URLS.migrator, async (db) => {
      const w = await world(db);
      const id = await posted(w, w.ana);
      expect(
        await as(w, w.owner, "community.moderate", { postId: id, decision: "ban" }),
      ).toMatchObject({
        code: "not_found",
      });
      expect(
        await as(w, w.operator, "community.moderate", { postId: id, decision: "ban" }),
      ).toMatchObject({
        ok: true,
      });
      expect(
        await as(w, w.ana, "community.post", { routeId: w.route, kind: "note", body: "otra" }),
      ).toMatchObject({ code: "forbidden" });
    }));
});

describe("two posts by one person at the same instant", () => {
  it("cannot both take the last place of the hour: the second waits, then hears rate_limited", async () => {
    const setup = new pg.Client({ connectionString: URLS.migrator });
    const one = new pg.Client({ connectionString: URLS.migrator });
    const two = new pg.Client({ connectionString: URLS.migrator });
    await Promise.all([setup.connect(), one.connect(), two.connect()]);
    try {
      const w = await world(setup);
      for (let n = 0; n < 9; n += 1) {
        await setup.query(
          `insert into community_posts (space_id, route_id, author_id, kind, body)
           values ($1, $2, $3, 'note', 'nota')`,
          [w.space, w.route, w.ana],
        );
      }
      const twoPid = await backendPid(two);
      const post = async (db: pg.Client) => {
        await db.query("begin");
        await actAs(db, w.ana);
        const orm = drizzle(db, { casing: "snake_case" });
        return runAction(
          ACTIONS,
          "community.post",
          { routeId: w.route, kind: "note", body: "la última" },
          {
            actor: { via: "ui", userId: w.ana, name: "Persona Inventada" },
            repos: pgRepos(orm),
            tenancy: pgTenancy(orm),
            clock: { now: () => Date.now() },
            ids: { newId: () => crypto.randomUUID() },
          },
        );
      };
      expect(await post(one)).toMatchObject({ ok: true });
      const second = post(two);
      await blockedOrDone(twoPid, second);
      await one.query("commit");
      expect(await second).toMatchObject({ code: "rate_limited" });
      await two.query("rollback");
      const { rows } = await setup.query(
        "select count(*)::integer as n from community_posts where author_id = $1",
        [w.ana],
      );
      expect(rows).toEqual([{ n: 10 }]);
    } finally {
      await Promise.all([setup.end(), one.end(), two.end()]);
    }
  });
});
