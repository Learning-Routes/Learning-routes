import { readdirSync, readFileSync } from "node:fs";
import { costOfUsage } from "@learning-routes/core/ai/models";
import { describe, expect, it } from "vitest";
import { streamFromOpenRouter } from "../src/ai/openrouter";
import { readScript, type Script, scriptedFetch } from "../src/ai/scripted";

const URL_ = "https://openrouter.ai/api/v1/chat/completions";
const SONNET = "anthropic/claude-sonnet-5.5";
const SPACE = "0191f0a0-0000-7000-8000-000000000001";
const ROUTE = "0191f0a0-0000-7000-8000-000000000002";
const MODULE = "0191f0a0-0000-7000-8000-000000000003";
const usage = { prompt_tokens: 9_000, cached_tokens: 8_000, completion_tokens: 300 };

const script: Script = readScript({
  name: "tiny",
  opening: "Quiero una ruta",
  turns: [
    {
      expect: { lastUserIncludes: "ruta" },
      reply: {
        text: "Armo el plan.",
        toolCalls: [{ name: "create_route", arguments: { space_id: "$space_id", slug: "r" } }],
        usage,
      },
    },
    {
      expect: { lastToolName: "create_route" },
      reply: {
        toolCalls: [
          {
            name: "add_module",
            arguments: { route_id: "$route_id", draft_revision: "$draft_revision" },
          },
        ],
        usage,
      },
    },
    {
      expect: { lastToolName: "add_module" },
      reply: {
        toolCalls: [{ name: "add_lesson", arguments: { module_id: "$module_ids.0" } }],
        usage,
      },
    },
  ],
});

const system = {
  role: "system",
  content: [{ type: "text", text: `Rules.\n\nThis conversation: {"space_id":"${SPACE}"}` }],
};
const opening = { role: "user", content: "Quiero una ruta" };
const created = [
  {
    role: "assistant",
    content: "Armo el plan.",
    tool_calls: [{ id: "c0", type: "function", function: { name: "create_route", arguments: "" } }],
  },
  // A content tool's answer, as the turn quotes it (asData).
  {
    role: "tool",
    tool_call_id: "c0",
    content: JSON.stringify({
      note: "data",
      data: JSON.stringify({ route_id: ROUTE, draft_revision: 1 }),
    }),
  },
];
const moduled = [
  ...created,
  {
    role: "assistant",
    content: "",
    tool_calls: [{ id: "c1", type: "function", function: { name: "add_module", arguments: "" } }],
  },
  {
    role: "tool",
    tool_call_id: "c1",
    content: JSON.stringify({
      note: "data",
      data: JSON.stringify({ module_id: MODULE, draft_revision: 2 }),
    }),
  },
];

const post = (messages: unknown[], model = SONNET) => ({
  request: { model, messages: [system, ...messages], stream: true },
});

async function stream(fetcher: typeof fetch, messages: unknown[]) {
  const texts: string[] = [];
  const streamed = await streamFromOpenRouter(
    post(messages) as never,
    "scripted",
    (t) => texts.push(t),
    fetcher,
  );
  return { streamed, texts };
}

describe("the scripted model provider (STEP 11-prep §A1)", () => {
  const fetcher = scriptedFetch([script]);

  it("answers only a POST to the chat completions endpoint", async () => {
    expect((await fetcher(URL_)).status).toBe(404);
    expect((await fetcher("https://example.test/", { method: "POST", body: "{}" })).status).toBe(
      404,
    );
  });

  it("streams the turn's words, its tool calls with their ids filled in, and its usage at the table's price", async () => {
    const { streamed, texts } = await stream(fetcher, [opening]);
    expect(streamed).toMatchObject({ ok: true, content: "Armo el plan." });
    expect(texts.at(-1)).toBe("Armo el plan.");
    if (!streamed.ok) {
      throw new Error("not ok");
    }
    expect(streamed.toolCalls.map((call) => call.function.name)).toEqual(["create_route"]);
    expect(JSON.parse(streamed.toolCalls[0]?.function.arguments ?? "")).toEqual({
      space_id: SPACE,
      slug: "r",
    });
    expect(streamed.usage).toEqual({
      cost: {
        kind: "known",
        microcents: costOfUsage(SONNET, {
          promptTokens: 9_000,
          cachedTokens: 8_000,
          completionTokens: 300,
        }),
      },
      promptTokens: 9_000,
      cachedTokens: 8_000,
      completionTokens: 300,
    });
  });

  it("takes the turn from the assistant messages already sent, and the ids from the tools' answers", async () => {
    const second = await stream(fetcher, [opening, ...created]);
    expect(
      second.streamed.ok && JSON.parse(second.streamed.toolCalls[0]?.function.arguments ?? ""),
    ).toEqual({
      route_id: ROUTE,
      draft_revision: 1,
    });
    const third = await stream(fetcher, [opening, ...moduled]);
    expect(
      third.streamed.ok && JSON.parse(third.streamed.toolCalls[0]?.function.arguments ?? ""),
    ).toEqual({
      module_id: MODULE,
    });
  });

  it("reads a message marked for the cache like a plain one", async () => {
    const marked = { role: "user", content: [{ type: "text", text: "Quiero una ruta" }] };
    expect((await stream(fetcher, [marked])).streamed.ok).toBe(true);
  });

  it("fails loudly, naming the script and the turn, on an unexpected message or a turn past the end", async () => {
    const wrong = await fetcher(URL_, {
      method: "POST",
      body: JSON.stringify(
        post([opening, ...created.slice(0, 1), { role: "user", content: "otra cosa" }]).request,
      ),
    });
    expect(wrong.status).toBe(500);
    expect(await wrong.text()).toBe("tiny: turn 1 expected the answer of a create_route call");
    const past = [
      ...moduled,
      { role: "assistant", content: "x" },
      { role: "assistant", content: "y" },
    ];
    const end = await fetcher(URL_, {
      method: "POST",
      body: JSON.stringify(post([opening, ...past]).request),
    });
    expect(end.status).toBe(500);
    expect(await end.text()).toBe("tiny: turn 4 is past the script's 3");
    const none = await fetcher(URL_, {
      method: "POST",
      body: JSON.stringify(post([{ role: "user", content: "Nadie" }]).request),
    });
    expect(none.status).toBe(500);
    expect(await none.text()).toBe('no script opens with "Nadie"');
  });

  it("can cut a stream in the middle, or refuse a call as OpenRouter does without credit", async () => {
    const cut = scriptedFetch([
      readScript({
        name: "cut",
        opening: "corta",
        turns: [
          {
            expect: { lastUserIncludes: "corta" },
            reply: {
              text: "Empiezo a escribir",
              toolCalls: [{ name: "add_module", arguments: { title: { es: "Uno" } } }],
              usage,
              cut: true,
            },
          },
        ],
      }),
      readScript({
        name: "no-credit",
        opening: "sin crédito",
        turns: [{ expect: { lastUserIncludes: "crédito" }, reply: { status: 402 } }],
      }),
    ]);
    expect((await stream(cut, [{ role: "user", content: "corta" }])).streamed).toEqual({
      ok: false,
      status: 502,
      usage: null,
      reached: true,
      isCreditOut: false,
    });
    expect((await stream(cut, [{ role: "user", content: "sin crédito" }])).streamed).toEqual({
      ok: false,
      status: 402,
      usage: null,
      reached: false,
      isCreditOut: true,
    });
  });

  it("refuses a script that is not well formed", () => {
    expect(() => readScript({ name: "x", opening: "", turns: [] })).toThrow();
    expect(() =>
      readScript({
        name: "x",
        opening: "a",
        turns: [{ expect: { lastUserIncludes: "a", lastToolName: "b" }, reply: { status: 402 } }],
      }),
    ).toThrow();
  });

  it("loads every committed script, each with its own opening", () => {
    const folder = new URL("./fixtures/studio-scripts/", import.meta.url);
    const files = readdirSync(folder).filter((file) => file.endsWith(".json"));
    const scripts = files.map((file) =>
      readScript(JSON.parse(readFileSync(new URL(file, folder), "utf8"))),
    );
    expect(scripts.map((each) => `${each.name}.json`).sort()).toEqual(files.sort());
    expect(new Set(scripts.map((each) => each.opening)).size).toBe(scripts.length);
  });
});
