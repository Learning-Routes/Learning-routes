import { afterEach, describe, expect, it } from "vitest";
import { query, URLS } from "../db/connect";
import { oauthHarness } from "./oauth-harness";

// upload_document (Platform STEP 8 §2): a creator's own document arrives intact, and the same one
// twice is one route.

const oauth = oauthHarness();
afterEach(() => oauth.settle());

const COURSE = `# Curso de prueba

## Módulo

### Tema

Un **texto** tal cual.

¿Sí?

- Sí ✅
- No
`;

async function teacher() {
  const person = await oauth.signIn();
  const slug = `up-${crypto.randomUUID().slice(0, 8)}`;
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
  return (await oauth.connect(person.cookie)).access_token;
}

describe("upload_document", () => {
  it("makes a draft from the creator's words, and gives the preview link", async () => {
    const token = await teacher();
    const made = await oauth.tool(token, "upload_document", { document: COURSE });
    const output = made.structuredContent as {
      route_id: string;
      counts: { lessons: number };
      preview_url: string;
      report: { kind: string }[];
    };
    expect(output.counts.lessons).toBe(1);
    expect(output.preview_url).toContain(`/creador/rutas/${output.route_id}/vista-previa`);
    expect(output.report.length).toBeGreaterThan(0);
    const read = await oauth.tool(token, "get_route", { route_id: output.route_id });
    expect(JSON.stringify(read.structuredContent)).toContain("Un **texto** tal cual.");
    expect((read.structuredContent as { route: { pricing: string } }).route.pricing).toBe("free");
  });

  it("is the same route when the same document comes twice", async () => {
    const token = await teacher();
    const first = await oauth.tool(token, "upload_document", { document: COURSE });
    const second = await oauth.tool(token, "upload_document", { document: COURSE });
    const [a, b] = [first.structuredContent, second.structuredContent] as {
      route_id: string;
      already_uploaded: boolean;
    }[];
    expect(b?.route_id).toBe(a?.route_id);
    expect(b?.already_uploaded).toBe(true);
    expect(a?.already_uploaded).toBe(false);
  });

  it("asks for a title rather than making one up", async () => {
    const token = await teacher();
    const made = await oauth.tool(token, "upload_document", { document: "Solo texto." });
    expect(made.isError).toBe(true);
    expect(JSON.stringify(made)).toContain("title");
  });
});
