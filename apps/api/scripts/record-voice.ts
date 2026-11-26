// Records the phrases a published route says aloud (core's voice.ts) and puts each recording in
// the voice bucket under the hash of what it says. A phrase already recorded is skipped, so a run
// costs only what is new; a route recorded twice costs nothing the second time.
//
//   pnpm voice:record <space-slug>/<route-slug>            what it would record, and how many characters
//   ELEVENLABS_API_KEY=… ELEVENLABS_VOICE_ID=… pnpm voice:record <space-slug>/<route-slug> --apply
//   … --apply --again                                      record again what is already there
//
// The key is read from the environment, never an argument, so it stays out of shell history.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Voiced, voicedPhrases, voicePath } from "@learning-routes/core/voice";
import pg from "pg";

const LOCAL = "postgres://lr_migrator:local-only-migrator@localhost:54318/learning_routes";
const BUCKET = "learning-routes-voice";
const MODEL = "eleven_multilingual_v2";

async function phrasesOf(name: string): Promise<Voiced[]> {
  const [spaceSlug = "", routeSlug = ""] = name.split("/");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL_MIGRATOR ?? LOCAL });
  await client.connect();
  try {
    await client.query("set default_transaction_read_only = on");
    const { rows } = await client.query<{ blocks: Parameters<typeof voicedPhrases>[0] }>(
      `select version.snapshot -> 'blocks' as blocks
         from routes
         join spaces on spaces.id = routes.space_id
         join route_versions as version
           on version.route_id = routes.id and version.version = routes.latest_published_version
        where spaces.slug = $1 and routes.slug = $2 and routes.archived_at is null`,
      [spaceSlug, routeSlug],
    );
    const blocks = rows[0]?.blocks;
    if (blocks === undefined) {
      throw new Error(`no published route named ${name}`);
    }
    return voicedPhrases(blocks);
  } finally {
    await client.end();
  }
}

async function recorded(origin: string, path: string): Promise<boolean> {
  const answer = await fetch(`${origin}${path}`, { method: "HEAD" });
  return answer.ok;
}

async function record(phrase: Voiced, key: string, voiceId: string): Promise<Uint8Array> {
  const answer = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        text: phrase.text,
        model_id: MODEL,
        language_code: phrase.lang.slice(0, 2).toLowerCase(),
      }),
    },
  );
  if (!answer.ok) {
    throw new Error(`the voice service answered ${answer.status} for "${phrase.text}"`);
  }
  return new Uint8Array(await answer.arrayBuffer());
}

const words = process.argv.slice(2);
const name = words.find((word) => !word.startsWith("--")) ?? "";
if (!name.includes("/")) {
  throw new Error("usage: voice:record <space-slug>/<route-slug> [--apply] [--again]");
}
const origin = process.env.VOICE_ORIGIN ?? "https://learningroutes.com";
const phrases = await phrasesOf(name);
const todo: { phrase: Voiced; path: string }[] = [];
for (const phrase of phrases) {
  const path = await voicePath(phrase.lang, phrase.text);
  if (words.includes("--again") || !(await recorded(origin, path))) {
    todo.push({ phrase, path });
  }
}
const characters = todo.reduce((sum, { phrase }) => sum + phrase.text.length, 0);
const summary = { route: name, phrases: phrases.length, to_record: todo.length, characters };
if (!words.includes("--apply")) {
  console.log(JSON.stringify({ message: "rehearsal", ...summary }));
} else {
  const key = process.env.ELEVENLABS_API_KEY ?? "";
  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? "";
  if (key === "" || voiceId === "") {
    throw new Error("set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID");
  }
  const folder = mkdtempSync(join(tmpdir(), "voice-"));
  try {
    for (const { phrase, path } of todo) {
      const file = join(folder, path.replace("/voz/", ""));
      writeFileSync(file, await record(phrase, key, voiceId));
      execFileSync(
        "pnpm",
        [
          "exec",
          "wrangler",
          "r2",
          "object",
          "put",
          `${BUCKET}/${path.replace("/voz/", "")}`,
          "--file",
          file,
          "--content-type",
          "audio/mpeg",
          "--remote",
        ],
        { stdio: "ignore" },
      );
      console.log(JSON.stringify({ recorded: phrase.text }));
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ message: "recorded", ...summary }));
}
