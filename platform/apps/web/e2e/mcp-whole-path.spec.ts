import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { expect, test } from "@playwright/test";
import { creatorHost, DEV } from "./screens";
import {
  authorizeUrl,
  makeTeacher,
  newAddress,
  OAUTH_CLIENT_ID,
  OAUTH_REDIRECT,
  PKCE_VERIFIER,
  seedOAuthClient,
  signInContext,
} from "./session";

// The whole path (Platform STEP 5 §6): a real SDK client and a person in a browser. Sign in,
// say yes, list the spaces, import a route, publish it, see it on the creator's host, start
// it, disconnect, and the next call is refused. The route's title tries to be a script.

test.use({ locale: "es-ES" });

const HOSTILE_TITLE = "<script>window.__pwned = 1</script>Pan de masa madre";
const PROTOCOL = "2026-07-28";

type Called = { structuredContent?: Record<string, unknown>; isError?: boolean };

test("an assistant imports and publishes a route, until it is disconnected", async ({
  page,
  context,
  request,
}) => {
  seedOAuthClient();
  const email = newAddress("ensena");
  await signInContext(context, email);
  makeTeacher(email);
  await page.route(`${OAUTH_REDIRECT}**`, (route) =>
    route.fulfill({ contentType: "text/plain", body: "ok" }),
  );
  await page.goto(authorizeUrl("routes:read routes:write routes:publish offline_access"));
  await page.getByRole("button", { name: "Permitir", exact: true }).click();
  await page.waitForURL(`${OAUTH_REDIRECT}**`);
  const code = new URL(page.url()).searchParams.get("code") ?? "";
  const tokens = await request.post(`${DEV}/api/auth/oauth2/token`, {
    form: {
      grant_type: "authorization_code",
      code,
      client_id: OAUTH_CLIENT_ID,
      redirect_uri: OAUTH_REDIRECT,
      code_verifier: PKCE_VERIFIER,
      resource: `${DEV}/mcp`,
    },
  });
  expect(tokens.status()).toBe(200);
  const { access_token: token } = await tokens.json();

  const client = new Client(
    { name: "prueba", version: "1.0.0" },
    { versionNegotiation: { pin: PROTOCOL } },
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${DEV}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    }),
  );
  // The SDK checks each structuredContent against the outputSchema listed here.
  const { tools } = await client.listTools();
  expect(tools.map((tool) => tool.name)).toContain("import_route");

  const listed = (await client.callTool({ name: "list_spaces", arguments: {} })) as Called;
  const { spaces } = listed.structuredContent as {
    spaces: { space_id: string; slug: string }[];
  };
  const space = spaces.find((entry) => entry.slug === "mariana-ortega");
  expect(space).toBeDefined();

  const slug = `pan-${crypto.randomUUID().slice(0, 8)}`;
  const imported = (await client.callTool({
    name: "import_route",
    arguments: {
      space_id: space?.space_id,
      document: {
        slug,
        title: { es: HOSTILE_TITLE },
        source_locale: "es",
        modules: [
          {
            title: { es: "La masa madre" },
            lessons: [
              {
                title: { es: "Qué necesitas" },
                blocks: [{ type: "concept", body: { es: "Harina, agua y una semana." } }],
              },
            ],
          },
        ],
      },
    },
  })) as Called;
  expect(imported.isError).toBeFalsy();
  const published = (await client.callTool({
    name: "publish_route",
    arguments: {
      route_id: imported.structuredContent?.route_id,
      draft_revision: imported.structuredContent?.draft_revision,
    },
  })) as Called;
  expect(published.isError).toBeFalsy();
  const address = `${creatorHost("mariana-ortega")}/${slug}`;
  expect(published.structuredContent?.public_url).toBe(address);

  // The title is words on the page, and nothing ran.
  expect((await page.goto(address))?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(HOSTILE_TITLE);
  expect(await page.evaluate(() => "__pwned" in window)).toBe(false);

  await page.getByRole("link", { name: "Empezar gratis" }).click();
  await page.getByRole("heading", { name: "Mis rutas" }).waitFor();
  await expect(page.getByText(HOSTILE_TITLE)).toBeVisible();
  expect(await page.evaluate(() => "__pwned" in window)).toBe(false);

  await page.goto(`${DEV}/ensenar/conexiones`);
  await expect(page.getByText("Último uso:")).toBeVisible();
  await page.getByRole("button", { name: "Desconectar: Cliente de prueba" }).click();
  await expect(page.getByText("Desconectado.")).toBeVisible();

  const after = await request.post(`${DEV}/mcp`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": PROTOCOL,
      "mcp-method": "tools/list",
    },
    data: {
      jsonrpc: "2.0",
      id: 9,
      method: "tools/list",
      params: {
        _meta: {
          "io.modelcontextprotocol/protocolVersion": PROTOCOL,
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    },
  });
  expect(after.status()).toBe(401);
  expect(after.headers()["www-authenticate"]).toContain("resource_metadata=");
  await expect(client.callTool({ name: "list_spaces", arguments: {} })).rejects.toThrow();
  await client.close();
});
