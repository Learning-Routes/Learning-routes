import { afterEach, describe, expect, it } from "vitest";
import { fetchAsset } from "../../src/mcp/fetch-asset";
import { query, URLS } from "../db/connect";
import { oauthHarness } from "./oauth-harness";

// upload_creation and upload_asset (Platform STEP 9 §2): what the creator made arrives byte for
// byte, in R2 after the commit, and publishing puts its creations where students can run them.

const oauth = oauthHarness();
afterEach(() => oauth.settle());

const PIANO = `<!doctype html><title>Piano</title>
<button onclick="new AudioContext()">Do</button>
<script>fetch("https://example.com/notes")</script>`;
const ASSET_URL = /^https:\/\/content\.example\.test\/a\/[0-9a-f-]{36}\/[0-9a-f]{64}\.png$/;
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

async function teacherWithRoute() {
  const person = await oauth.signIn();
  const slug = `cr-${crypto.randomUUID().slice(0, 8)}`;
  await query(
    URLS.migrator,
    `insert into spaces (slug, name, default_locale, locales) values ($1, '{"es":"E"}', 'es', '{es}')`,
    [slug],
  );
  await query(
    URLS.migrator,
    `insert into memberships (space_id, user_id, role)
     select s.id, u.id, 'owner' from spaces s, "user" u where s.slug = $1 and u.email = $2`,
    [slug, person.email],
  );
  const token = (await oauth.connect(person.cookie)).access_token;
  const made = await oauth.tool(token, "upload_document", {
    document: "# Prueba\n\n## Módulo\n\n### Tema\n\nHola.",
  });
  const { route_id, draft_revision } = made.structuredContent as {
    route_id: string;
    draft_revision: number;
  };
  const read = await oauth.tool(token, "get_route", { route_id });
  const lesson = (read.structuredContent as { lessons: { id: string }[] }).lessons[0];
  return { token, routeId: route_id, revision: draft_revision, lessonId: String(lesson?.id) };
}

describe("upload_creation", () => {
  it("stores the file exactly as given, adds the block, and says what it cannot do here", async () => {
    const { token, routeId, revision, lessonId } = await teacherWithRoute();
    const answer = await oauth.tool(token, "upload_creation", {
      route_id: routeId,
      draft_revision: revision,
      lesson_id: lessonId,
      title: { es: "Piano" },
      html: PIANO,
    });
    const output = answer.structuredContent as {
      block_id: string;
      draft_revision: number;
      already_uploaded: boolean;
      cannot_do_here: string[];
      preview_url: string;
    };
    expect(output.already_uploaded).toBe(false);
    expect(output.preview_url).toContain(`/creador/rutas/${routeId}/vista-previa`);
    expect(output.cannot_do_here.join(" ")).toContain("internet");
    const [key, stored] = [...oauth.objects].find(([name]) => name.startsWith("draft/")) ?? [];
    expect(key).toMatch(new RegExp(`/${routeId}/[0-9a-f]{64}\\.html$`));
    expect(new TextDecoder().decode(stored?.bytes)).toBe(PIANO);

    const again = await oauth.tool(token, "upload_creation", {
      route_id: routeId,
      draft_revision: output.draft_revision,
      lesson_id: lessonId,
      title: { es: "Piano" },
      html: PIANO,
    });
    expect((again.structuredContent as { already_uploaded: boolean }).already_uploaded).toBe(true);

    const published = await oauth.tool(token, "publish_route", {
      route_id: routeId,
      draft_revision: output.draft_revision,
    });
    expect(published.isError).toBeFalsy();
    expect(oauth.objects.has(`pub/${String(key).slice("draft/".length)}`)).toBe(true);
  });

  it("refuses an interactive block written by hand", async () => {
    const { token, routeId, revision, lessonId } = await teacherWithRoute();
    const answer = await oauth.tool(token, "add_blocks", {
      route_id: routeId,
      draft_revision: revision,
      lesson_id: lessonId,
      blocks: [{ type: "interactive", creation: "a".repeat(64) }],
    });
    expect(answer.isError).toBe(true);
  });
});

describe("upload_asset", () => {
  it("keeps a file by its bytes, and answers with its address on the content host", async () => {
    const { token } = await teacherWithRoute();
    const answer = await oauth.tool(token, "upload_asset", {
      data_base64: btoa(String.fromCharCode(...PNG)),
    });
    const output = answer.structuredContent as { url: string; content_type: string };
    expect(output.content_type).toBe("image/png");
    expect(output.url).toMatch(ASSET_URL);
    const key = output.url.replace("https://content.example.test/", "");
    expect(oauth.objects.get(key)?.contentType).toBe("image/png");
  });

  it("refuses what is not an image, a sound or a video", async () => {
    const { token } = await teacherWithRoute();
    const answer = await oauth.tool(token, "upload_asset", {
      data_base64: btoa("<html><script>alert(1)</script>"),
    });
    expect(answer.isError).toBe(true);
  });
});

describe("upload_asset from an address", () => {
  it("fetches nothing for someone who cannot edit the space", async () => {
    const { token } = await teacherWithRoute();
    const answer = await oauth.tool(token, "upload_asset", {
      space_id: crypto.randomUUID(),
      source_url: "https://example.com/a.png",
    });
    expect(answer.isError).toBe(true);
    expect(JSON.stringify(answer)).toContain("not_found");
  });
});

describe("fetchAsset", () => {
  const answering =
    (...responses: Response[]): typeof fetch =>
    async () =>
      responses.shift() ?? new Response(null, { status: 500 });

  it("takes https only, follows a few redirects, and stops at the size limit", async () => {
    expect(await fetchAsset("http://example.com/a.png")).toMatchObject({ ok: false });
    const moved = new Response(null, { status: 302, headers: { location: "/b.png" } });
    expect(
      await fetchAsset("https://example.com/a.png", answering(moved, new Response(PNG))),
    ).toMatchObject({ ok: true });
    const toPlain = new Response(null, { status: 302, headers: { location: "http://x.test/" } });
    expect(await fetchAsset("https://example.com/a.png", answering(toPlain))).toMatchObject({
      ok: false,
    });
    const loop = () => new Response(null, { status: 302, headers: { location: "/again" } });
    expect(
      await fetchAsset("https://example.com/", answering(loop(), loop(), loop(), loop(), loop())),
    ).toMatchObject({ ok: false, why: "source_url redirects too many times" });
    const huge = new Response(new Uint8Array(26 * 1024 * 1024));
    expect(await fetchAsset("https://example.com/big", answering(huge))).toMatchObject({
      ok: false,
    });
    expect(
      await fetchAsset("https://example.com/gone", answering(new Response(null, { status: 404 }))),
    ).toMatchObject({ ok: false, why: "source_url answered 404" });
  });
});
