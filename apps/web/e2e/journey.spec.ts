import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { costOfUsage, type ModelId } from "@learning-routes/core/ai/models";
import type { StudioEvent } from "@learning-routes/core/studio/session";
import { expect, type Page, test } from "@playwright/test";
import { creatorHost, DEV } from "./screens";
import { invitationFor, makeOperator, newAddress, signInContext, stubTurnstile } from "./session";

// The whole journey (STEP 11-prep §A2): a creator invited by the admin builds a route with the
// assistant and publishes it, and a student opens it and completes a topic. The agent answers with
// the scripted provider: every other piece is real, from the gate and the ledger to action_log.

test.use({ locale: "es-ES" });

const AGENT_LOG = ".wrangler/e2e-agent.log";
const SCRIPT = JSON.parse(
  readFileSync(
    new URL("../../api/test/fixtures/studio-scripts/from-zero-fractions.json", import.meta.url),
    "utf8",
  ),
) as {
  opening: string;
  turns: { reply: { toolCalls?: { name: string; arguments: Record<string, unknown> }[] } }[];
};
const CALLS = SCRIPT.turns.flatMap((turn) => turn.reply.toolCalls ?? []);
const TITLE = "Fracciones desde cero";
const WHERE_FIRST = /Módulo 1, tema 1 de \d+/;
const LOG_LINE = /\{"message":"(studio model call|ledger added|studio skill loaded)"[^\n]*\}/g;

/** The agent's log lines written since `from`, by kind. */
function agentLines(from: number) {
  const lines = (readFileSync(AGENT_LOG, "utf8").slice(from).match(LOG_LINE) ?? []).map(
    (line) => JSON.parse(line) as Record<string, unknown>,
  );
  const of = (kind: string) => lines.filter((line) => line.message === kind);
  return {
    calls: of("studio model call") as {
      model: ModelId;
      microcents: number;
      promptTokens: number;
      cachedTokens: number;
      completionTokens: number;
      isCharged: boolean;
    }[],
    ledger: of("ledger added") as { day: string; microcents: number; total: number }[],
    skills: of("studio skill loaded").map((line) => line.skill),
  };
}

/** Every studio event the page received, once each, in order (a reload replays what it missed). */
function studioEvents(page: Page) {
  const bySeq = new Map<number, StudioEvent>();
  page.on("websocket", (socket) => {
    if (!socket.url().includes("/creador/asistente/conexion")) {
      return;
    }
    socket.on("framereceived", ({ payload }) => {
      const frame = JSON.parse(String(payload)) as { seq?: number; event: StudioEvent };
      if (frame.seq !== undefined) {
        bySeq.set(frame.seq, frame.event);
      }
    });
  });
  return () => [...bySeq.entries()].sort(([a], [b]) => a - b).map(([, event]) => event);
}

// A turn runs several model calls and real writes: a CI runner can take longer than the default.
const TURN = { timeout: 20_000 };

const option = (page: Page, label: string) => page.locator(".studio-option", { hasText: label });

test("a creator builds and publishes with the assistant, and a student completes a topic", async ({
  browser,
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  const logFrom = readFileSync(AGENT_LOG, "utf8").length;
  const email = newAddress("andres-profe");
  const slug = `andres-profe-${crypto.randomUUID().slice(0, 6)}`;
  const events = studioEvents(page);

  await test.step("1. the admin invites Andrés Profe", async () => {
    await stubTurnstile(page);
    await page.goto(`${DEV}/ser-creador`);
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    await page.getByLabel("Tu nombre").fill("Andrés Profe");
    await page.getByLabel("Tu correo").fill(email);
    await page.getByLabel("¿Qué enseñas?").fill("Matemáticas de secundaria");
    await page.getByRole("button", { name: "Enviar solicitud" }).click();
    await expect(page.getByText("Recibimos tu solicitud.")).toBeVisible();

    const admin = await browser.newContext({ locale: "es-ES" });
    const operator = newAddress("operador");
    await signInContext(admin, operator);
    makeOperator(operator);
    const adminPage = await admin.newPage();
    await adminPage.goto(`${DEV}/admin`);
    const row = adminPage.locator(".admin-item").filter({ hasText: email });
    await row.getByRole("button", { name: "Enviar invitación", exact: true }).click();
    await expect(row.getByRole("button", { name: "Reenviar invitación" })).toBeVisible();
    await admin.close();
  });

  await test.step("2. he accepts through the dev sender's link and lands at step 1", async () => {
    await page.goto(await invitationFor(email));
    await page.getByLabel("La dirección de tu página").fill(slug);
    await page.getByRole("button", { name: "Crear mi espacio" }).click();
    await expect(page).toHaveURL(`${DEV}/creador/asistente`);
    await expect(page.getByText("Paso 1 de 7: Conocerte")).toBeVisible();
    // Typed before hydration, the words are dropped and the send button sends the example instead.
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  });

  await test.step("3. he asks for his app and picks «Desde cero»", async () => {
    await page.locator("#studio-input").fill(SCRIPT.opening);
    await page.locator(".studio-send").click();
    await option(page, "Desde cero").click(TURN);
  });

  const list = page.getByRole("region", { name: "Tu ruta, en orden" });
  await test.step("4. the plan appears, and his change adds a topic", async () => {
    await expect(option(page, "Sí, constrúyela")).toBeVisible(TURN);
    await expect(page.locator(".studio-route-title")).toHaveText(TITLE);
    await expect(list).toContainText("Examen del módulo 2");
    // The conversation is still there after a reload.
    await page.reload();
    await expect(list).toContainText("Examen del módulo 2");
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    await page.locator("#studio-input").fill("agrega práctica de fracciones");
    await page.locator(".studio-send").click();
    await expect(list).toContainText("Práctica de fracciones", TURN);
  });

  await test.step("5. the build runs, and the preview opens a topic as a student sees it", async () => {
    await option(page, "Sí, constrúyela").click();
    await expect(option(page, "Se ve bien")).toBeVisible(TURN);
    // Two modules and five topics: seven stations, every one built.
    await expect(list.locator("li.is-built")).toHaveCount(7);
    await expect(page.locator(".studio-note-title")).toHaveText("Partes de una fracción");
    const preview = await context.newPage();
    // The preview address is absolute: the draft's own page on the platform.
    await preview.goto((await page.locator(".studio-note-link").getAttribute("href")) ?? "");
    await expect(
      preview.getByText("Una fracción nombra partes iguales de un entero."),
    ).toBeVisible();
    await preview.close();
  });

  await test.step("6. his page: the price in Enseñar", async () => {
    await option(page, "Se ve bien").click();
    await expect(option(page, "Listo, ya lo puse")).toBeVisible(TURN);
    // §3b: until step 6's confirm card lands, the price is set in Enseñar; then it is a card in the chat.
    const teach = await context.newPage();
    await teach.goto(`${DEV}/creador`);
    await teach.locator(".hub-price summary").click();
    await teach.getByLabel("Precio", { exact: true }).fill("12");
    await teach.getByRole("button", { name: "Guardar precio" }).click();
    await expect(teach.getByText("Precio guardado; el cobro se activa pronto.")).toBeVisible();
    await teach.close();
  });

  await test.step("7. the assistant asks to publish, and only his tap publishes", async () => {
    await option(page, "Listo, ya lo puse").click();
    await expect(page.locator(".studio-confirm")).toContainText("12", TURN);
    expect(events().some((event) => event.type === "published")).toBe(false);
    await page.getByRole("button", { name: "Sí, publícala" }).click();
    await expect(page.locator(".studio-toast")).toContainText(`Publicada en ${slug}.`, TURN);
  });

  await test.step("8. the public page shows the route, its first module free", async () => {
    await page.goto(creatorHost(slug));
    const route = page.locator(".creator-route", { hasText: TITLE });
    await expect(route).toBeVisible();
    await expect(route.getByText("El primer módulo es gratis")).toBeVisible();
    await route.click();
    await expect(page.getByText("El módulo 1 completo es gratis.")).toBeVisible();
  });

  await test.step("9. a student enrolls, gets the check wrong, then right, and is offered the next topic", async () => {
    const student = await browser.newContext({
      locale: "es-ES",
      viewport: testInfo.project.use.viewport,
    });
    await signInContext(student, newAddress("alumna"));
    const lesson = await student.newPage();
    await lesson.goto(`${creatorHost(slug)}/fracciones-desde-cero`);
    await lesson.getByRole("link", { name: "Empezar gratis" }).click();
    await lesson.getByRole("link", { name: "Seguir", exact: true }).first().click();
    await expect(lesson.getByText(WHERE_FIRST)).toBeVisible();
    const here = () => lesson.locator(".lesson-here").getAttribute("cx");
    const start = await here();
    const choice = (text: string) => lesson.locator(".lesson-option", { hasText: text });
    await choice("Cuántas partes tomas").click();
    await lesson.getByRole("button", { name: "Comprobar" }).click();
    await expect(lesson.locator(".lesson-option.is-wrong")).toHaveCount(1);
    await choice("En cuántas partes iguales se divide el entero").click();
    await lesson.getByRole("button", { name: "Comprobar" }).click();
    await expect(lesson.locator(".lesson-option.is-right")).toHaveCount(1);
    await expect(lesson.getByText("Tema hecho.")).toBeVisible();
    expect(await here()).not.toBe(start);
    await expect(lesson.getByRole("link", { name: "Siguiente tema" })).toBeVisible();
    await student.close();
  });

  await test.step("behind the screen: events, writes, model calls, skills and the words", async () => {
    const seen = events();
    // Built is a snapshot after every write, and "meet" emits no stepped: the conversation starts there.
    expect(seen.filter((event) => event.type === "stepped").map((event) => event.step)).toEqual([
      "content",
      "plan",
      "build",
      "review",
      "page",
      "publish",
    ]);
    const published = seen.findIndex((event) => event.type === "published");
    expect(published).toBeGreaterThan(seen.findIndex((event) => event.type === "confirming"));
    expect(seen.filter((event) => event.type === "published")).toHaveLength(1);
    const plan = seen.filter((event) => event.type === "planned").at(-1);
    expect(plan?.type === "planned" && plan.modules.flatMap((module) => module.lessons)).toEqual([
      { title: "Partes de una fracción" },
      { title: "Examen del módulo 1" },
      { title: "Sumar con el mismo denominador" },
      { title: "Práctica de fracciones", isNew: true },
      { title: "Examen del módulo 2" },
    ]);

    const facts = JSON.parse(
      execFileSync(
        "pnpm",
        ["--silent", "--filter", "@learning-routes/api", "db:journey-facts", "--email", email],
        {
          encoding: "utf8",
        },
      ),
    ) as {
      spaceId: string;
      writes: { action: string; via: string; spaceId: string }[];
      blocks: Record<string, unknown>[];
    };
    // Accepting the invitation and the price (in Enseñar, until §3b) are the creator's own writes;
    // every other is the assistant's. Each write is named, so a failure says which one.
    const OWN = ["invitation.accept", "route.set_price"];
    const own = facts.writes.filter((write) => OWN.includes(write.action));
    expect(own.map((write) => [write.action, write.via])).toEqual(
      OWN.map((action) => [action, "ui"]),
    );
    const writes = facts.writes.filter((write) => !OWN.includes(write.action));
    expect(writes.length).toBeGreaterThan(0);
    expect(
      writes.filter((write) => write.via !== "agent" || write.spaceId !== facts.spaceId),
    ).toEqual([]);
    // No invented content: what was published is the script's arguments, word for word.
    const written = CALLS.filter((call) => call.name === "add_blocks").flatMap(
      (call) => call.arguments.blocks as Record<string, unknown>[],
    );
    expect(facts.blocks).toEqual(expect.arrayContaining(written));
    expect(facts.blocks).toHaveLength(written.length);

    // One charged spend-book row per model turn, each at the table's price; the ledger rose by their sum.
    const { calls, ledger, skills } = agentLines(logFrom);
    expect(calls).toHaveLength(SCRIPT.turns.length);
    for (const call of calls) {
      expect(call.isCharged).toBe(true);
      expect(call.microcents).toBe(costOfUsage(call.model, call));
    }
    const sum = calls.reduce((total, call) => total + call.microcents, 0);
    expect(ledger.map((line) => line.microcents)).toEqual(calls.map((call) => call.microcents));
    expect(
      (ledger.at(-1)?.total ?? 0) - (ledger[0]?.total ?? 0) + (ledger[0]?.microcents ?? 0),
    ).toBe(sum);
    testInfo.annotations.push({
      type: "ledger",
      description: `${sum} microcents in ${calls.length} calls`,
    });

    // Each load is logged; the cap of four at once is the agent's own test (scripted-runs.test.ts).
    expect(skills).toEqual(
      CALLS.filter((call) => call.name === "load_skill").map((call) => call.arguments.name),
    );
  });
});

// A failed journey keeps the agent's own lines: what each call cost, and why one failed.
// biome-ignore lint/correctness/noEmptyPattern: Playwright reads fixtures from this pattern, and needs none here.
test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const lines = readFileSync(AGENT_LOG, "utf8").match(/\{"message":"[^\n]*\}/g) ?? [];
    await testInfo.attach("agent-log", {
      body: lines.slice(-200).join("\n"),
      contentType: "text/plain",
    });
  }
});

// STEP 11: learning progress is saved. Then this asserts the student's topic 1 is kept.
test.skip("the student's progress on topic 1 is saved", async ({ page }) => {
  await page.goto(`${DEV}/mis-rutas`);
  await expect(page.getByText("Vas en el tema 2 de 5.")).toBeVisible();
});
