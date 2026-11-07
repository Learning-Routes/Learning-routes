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
// The content host (wrangler.jsonc's CONTENT_ORIGIN), answered here so no test reaches it.
const CONTENT = "https://lrusercontent.com";
const SIGNED_DRAFT = /^https:\/\/lrusercontent\.com\/d\/.+\?e=\d+&s=/;
const CREATION =
  "<!doctype html><button onclick=\"parent.postMessage({type:'lr:done'},'*')\">Listo</button>";

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
  const routeId = imported.structuredContent?.route_id;

  // A creation, kept as it is, plays in the draft's preview (Platform STEP 9 §3).
  const draft = (await client.callTool({
    name: "get_route",
    arguments: { route_id: routeId },
  })) as Called;
  const lessons = draft.structuredContent?.lessons as { id: string }[];
  const uploaded = (await client.callTool({
    name: "upload_creation",
    arguments: {
      route_id: routeId,
      draft_revision: draft.structuredContent?.draft_revision,
      lesson_id: lessons[0]?.id,
      title: { es: `Botón ${slug}` },
      description: { es: "Pulsa Listo cuando acabes." },
      alt_text: { es: "Un botón que dice Listo." },
      shape: "wide",
      html: CREATION,
    },
  })) as Called;
  expect(uploaded.isError).toBeFalsy();
  await page.route(`${CONTENT}/**`, (route) =>
    route.fulfill({
      contentType: "text/html",
      headers: { "content-security-policy": "sandbox allow-scripts" },
      body: CREATION,
    }),
  );
  await page.goto(`${DEV}/creador/rutas/${routeId}/vista-previa`);
  const frame = page.locator(".lesson-creation-frame");
  await expect(frame).toHaveAttribute("src", SIGNED_DRAFT);
  await expect(frame).toHaveAttribute("sandbox", "allow-scripts");
  await expect(page.getByText("Un botón que dice Listo.")).toBeVisible();
  // The page's own message is not the frame's, so it changes nothing.
  await page.evaluate(() => window.postMessage({ type: "lr:done" }, "*"));
  await page
    .frameLocator(".lesson-creation-frame")
    .getByRole("button", { name: "Listo" })
    .waitFor();
  await expect(page.getByText("Lo terminaste.")).toHaveCount(0);
  // The section settles in on arrival; a click inside the frame lands where it rests.
  await page
    .locator(".lesson-creation")
    .evaluate((section) => Promise.all(section.getAnimations().map((each) => each.finished)));
  await page.frameLocator(".lesson-creation-frame").getByRole("button", { name: "Listo" }).click();
  await expect(page.getByText("Lo terminaste.")).toBeVisible();

  const published = (await client.callTool({
    name: "publish_route",
    arguments: {
      route_id: routeId,
      draft_revision: uploaded.structuredContent?.draft_revision,
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
  await expect(page.getByText(HOSTILE_TITLE).first()).toBeVisible();
  expect(await page.evaluate(() => "__pwned" in window)).toBe(false);

  // The creator's hub: the creation's card, a new version in its block, then out of the draft.
  await page.goto(`${DEV}/creador`);
  const card = page.locator(".hub-creation", { hasText: `Botón ${slug}` });
  await expect(card.getByText("En el tema «Qué necesitas»")).toBeVisible();
  await card.locator("summary", { hasText: "Reemplazar" }).click();
  await card.locator('input[type="file"]').setInputFiles({
    name: "boton.html",
    mimeType: "text/html",
    buffer: Buffer.from(`${CREATION}<p>v2</p>`),
  });
  await card.getByRole("button", { name: "Reemplazar" }).click();
  await expect(page.getByText("Creación reemplazada. Revísala en la vista previa.")).toBeVisible();
  const replaced = page.locator(".hub-creation", { hasText: `Botón ${slug}` });
  await replaced.locator("summary", { hasText: "Quitar" }).click();
  await replaced.getByRole("button", { name: "Quitar del borrador" }).click();
  await expect(page.getByText("Creación quitada del borrador.")).toBeVisible();
  await expect(page.locator(".hub-creation", { hasText: `Botón ${slug}` })).toHaveCount(0);

  await page.goto(`${DEV}/creador/conexiones`);
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
