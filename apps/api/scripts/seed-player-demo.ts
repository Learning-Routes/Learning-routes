// A route with every kind of beat the player shows (Platform STEP 12), for a local look at it:
//
//   pnpm db:seed-player-demo --space <slug> --student <email>
//
// LOCAL ONLY: it refuses any database but the local one. It publishes the route in the space, as
// the space's owner, and enrolls the student, who signs in once first. Running it again changes
// nothing. Every name and line here is invented.
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { Block } from "@learning-routes/core/blocks/schema";
import {
  contentHash,
  SNAPSHOT_FORMAT,
  snapshotOf,
  upcastSnapshot,
} from "@learning-routes/core/content/snapshot";
import type { RepoResult } from "@learning-routes/core/repos/ports";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { pgRepos } from "../src/db/repos/index";
import { newId } from "../src/ids";

const LOCAL = "postgres://lr_migrator:local-only-migrator@localhost:54318/learning_routes";
const LOCAL_HOST = /@localhost:54318\//;
const SLUG = "demo-del-reproductor";

const es = (text: string) => ({ es: text });

const QUESTIONS: Record<string, unknown>[] = [
  {
    type: "concept",
    title: es("Cómo funciona un freno de disco"),
    body: es(
      "Cuando pisas el pedal, el **líquido de frenos** empuja el pistón. El pistón aprieta las **pastillas** contra el **disco**, y la fricción convierte el movimiento en calor.",
    ),
  },
  {
    type: "check",
    question: es("¿Qué convierte el movimiento del auto en calor?"),
    options: [
      {
        label: es("El líquido de frenos"),
        correct: false,
        why: es("El líquido solo transmite la fuerza del pedal."),
      },
      { label: es("La fricción entre pastillas y disco"), correct: true },
      {
        label: es("El pedal"),
        correct: false,
        why: es("El pedal empieza todo, pero no frena por sí solo."),
      },
      { label: es("El rin de la llanta"), correct: false },
    ],
    explanation: es("Las pastillas rozan el disco: esa fricción frena la rueda y produce calor."),
  },
  {
    type: "order",
    prompt: es("Ordena lo que pasa al frenar"),
    items: [
      es("Pisas el pedal"),
      es("El líquido empuja el pistón"),
      es("Las pastillas aprietan el disco"),
      es("La rueda se detiene"),
    ],
    explanation: es("Del pie a la rueda: pedal, líquido, pistón, pastillas, disco."),
  },
  {
    type: "drag_drop",
    intro: es("Une cada pieza con lo que hace."),
    left_label: es("Pieza"),
    right_label: es("Qué hace"),
    pairs: [
      { term: es("Pastilla"), definition: es("Roza el disco") },
      { term: es("Pistón"), definition: es("Empuja la pastilla") },
      { term: es("Disco"), definition: es("Gira con la rueda") },
    ],
  },
  {
    type: "fill_blank",
    sentence: es("El ___ empuja las ___ contra el disco."),
    blanks: [es("pistón"), es("pastillas")],
    choices: [es("pistón"), es("pastillas"), es("pedal"), es("rin")],
  },
  {
    type: "true_false",
    prompt: es("¿Cierto o falso?"),
    statements: [
      { text: es("Las pastillas se gastan con el uso."), answer: true },
      {
        text: es("El disco no se calienta al frenar."),
        answer: false,
        why: es("Se calienta mucho: la fricción produce calor."),
      },
      { text: es("Sin líquido de frenos, el pedal se va al fondo."), answer: true },
    ],
  },
  {
    type: "estimate",
    prompt: es("¿A cuántos grados puede llegar un disco en una frenada fuerte?"),
    min: 0,
    max: 800,
    step: 10,
    unit: "°C",
    answer_min: 300,
    answer_max: 600,
    anchors: [
      { value: 100, label: es("Agua hirviendo") },
      { value: 230, label: es("Un horno") },
    ],
    explanation: es("En una frenada fuerte un disco pasa de 300 °C sin problema."),
  },
  {
    type: "hotspot",
    prompt: es("Toca la pinza del freno"),
    diagram: "disc_brake",
    spots: [
      { x: 0.7, y: 0.33, label: es("Pinza"), correct: true },
      { x: 0.45, y: 0.53, label: es("Buje"), correct: false },
      { x: 0.31, y: 0.2, label: es("Disco"), correct: false },
    ],
    explanation: es("La pinza abraza el disco y guarda el pistón y las pastillas."),
  },
  {
    type: "cards",
    title: es("Repaso rápido"),
    cards: [
      { front: es("Pastilla"), back: es("La pieza que roza el disco") },
      { front: es("Pinza"), back: es("Abraza el disco y guarda el pistón") },
    ],
  },
  {
    type: "scenario",
    title: es("En el taller"),
    situation: es(
      "Un cliente dice que su freno **chilla** cada vez que frena. ¿Qué revisas primero?",
    ),
    options: [
      {
        label: es("Las pastillas"),
        consequence: es("Bien: un chillido suele ser el aviso de desgaste."),
      },
      { label: es("El radio"), consequence: es("El radio no tiene nada que ver con los frenos.") },
    ],
  },
];

const PRACTICE: Record<string, unknown>[] = [
  {
    type: "worked_example",
    problem: es("Resuelve 3x − 5 = 10"),
    steps: [
      {
        label: es("Suma 5 a los dos lados"),
        work: "3x = 15",
        why: es("Así la x queda sola de un lado."),
      },
      { label: es("Divide entre 3"), work: "x = 5" },
      { label: es("Comprueba"), work: "3·5 − 5 = 10 ✓" },
    ],
  },
  {
    type: "speak",
    phrase: "Could you help me, please?",
    lang: "en-US",
    translation: es("¿Me podrías ayudar, por favor?"),
  },
  {
    type: "code_check",
    prompt: es("Escribe la función suma(a, b)"),
    language: "javascript",
    starter: "function suma(a, b) {\n  // tu código\n}\n",
    tests: [
      { call: "suma(2, 3)", expected: "5" },
      { call: "suma(-1, 1)", expected: "0" },
    ],
    hint: es("Devuelve a + b con return."),
  },
  {
    type: "open_answer",
    prompt: es("Explica con tus palabras por qué un freno se calienta"),
    rubric: [
      es("Menciona la fricción"),
      es("Dice qué piezas se rozan"),
      es("Habla de la energía del movimiento"),
    ],
    model_answer: es("Las pastillas rozan el disco; la fricción convierte el movimiento en calor."),
  },
];

const sim = (prompt: string, spec: Record<string, unknown>, explanation?: string) => ({
  type: "sim",
  prompt: es(prompt),
  sim: spec,
  ...(explanation ? { explanation: es(explanation) } : {}),
});

const SIMS: Record<string, unknown>[] = [
  sim(
    "Toca el acorde de Do mayor",
    { kind: "piano_chord", target: [0, 4, 7], low: 60, high: 76 },
    "Do mayor es Do, Mi y Sol.",
  ),
  sim("Pon el acorde de Mi menor", {
    kind: "guitar_chord",
    target: { "4": 2, "5": 2 },
    name: "Em",
  }),
  sim("Toma una foto bien expuesta del corredor sin que salga movido", {
    kind: "camera_exposure",
    scene_ev: 13,
    min_shutter: 250,
  }),
  sim("¿Cuánto ahorras al mes para tener $10 000 en 10 años al 6 %?", {
    kind: "compound_interest",
    rate: 0.06,
    years: 10,
    goal: 10000,
    min: 0,
    max: 150,
    step: 5,
    currency: "$",
  }),
  sim("Centra las cajas en las dos direcciones", {
    kind: "css_flex",
    target: { justify: "center", align: "center" },
  }),
  sim("Pinta tres cuartos de la pizza", { kind: "fraction_pie", parts: 4, target: 3 }),
  sim("Haz que pasen 2 amperios por el circuito", {
    kind: "ohm",
    target_amps: 2,
    v: [0, 24],
    r: [1, 100],
    tolerance: 0.1,
  }),
  sim("Balancea la formación del agua", {
    kind: "equation_balance",
    terms: [
      { formula: "H₂", side: "left", atoms: { H: 2 } },
      { formula: "O₂", side: "left", atoms: { O: 2 } },
      { formula: "H₂O", side: "right", atoms: { H: 2, O: 1 } },
    ],
    max: 6,
  }),
  sim("Las blancas dan mate en una", {
    kind: "chess_mate_in_one",
    fen: "6k1/5ppp/8/8/8/8/8/R5K1",
    solution: "a1a8",
    movable: ["a1", "g1"],
  }),
  sim("Elige el color complementario", { kind: "color_wheel", base: 0, relation: "complement" }),
  sim("Pide un café en inglés", {
    kind: "roleplay",
    lang: "en-US",
    partner: "Barista",
    turns: [
      {
        line: "Hi! What can I get you?",
        choices: [
          {
            text: "A coffee, please.",
            score: 2,
            note: es("Natural y amable."),
            reply: "Sure! Small or large?",
          },
          {
            text: "Give coffee.",
            score: 0,
            note: es("Suena brusco: falta «please»."),
            reply: "Okay… small or large?",
          },
        ],
      },
      {
        line: "Small or large?",
        choices: [
          { text: "Small, thanks.", score: 2, note: es("Perfecto."), reply: "Coming right up!" },
          {
            text: "Is small.",
            score: 1,
            note: es("Se entiende, pero no es natural."),
            reply: "Got it.",
          },
        ],
      },
    ],
  }),
  sim("Haz 15 compresiones a buen ritmo", {
    kind: "cpr_rhythm",
    min_bpm: 100,
    max_bpm: 120,
    count: 15,
  }),
  sim("Arma un ritmo básico", {
    kind: "step_sequencer",
    bpm: 96,
    rows: [
      { name: "Bombo", sound: "kick", steps: [0, 8] },
      { name: "Caja", sound: "snare", steps: [4, 12] },
      { name: "Hi-hat", sound: "hat", steps: [0, 2, 4, 6, 8, 10, 12, 14] },
    ],
  }),
];

const LESSONS = [
  { title: "Preguntas", blocks: QUESTIONS },
  { title: "Práctica", blocks: PRACTICE },
  { title: "Simuladores", blocks: SIMS },
];

function must<T>(result: RepoResult<T>, step: string): T {
  if (!result.ok) {
    throw new Error(`the demo could not ${step}: ${result.error}`);
  }
  return result.value;
}

/** Positions that sort in order: 1, 2, … then letters. */
const POSITIONS = "123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

async function ids(db: pg.Client, space: string, student: string) {
  const owner = await db.query(
    `select s.id as space_id, m.user_id from spaces s join memberships m on m.space_id = s.id
     where s.slug = $1 and m.role = 'owner' limit 1`,
    [space],
  );
  const learner = await db.query(`select id from "user" where lower(email) = lower($1)`, [student]);
  if (!owner.rows[0] || !learner.rows[0]) {
    throw new Error("no such space with an owner, or the student has not signed in yet");
  }
  return {
    spaceId: owner.rows[0].space_id as string,
    ownerId: owner.rows[0].user_id as string,
    studentId: learner.rows[0].id as string,
  };
}

async function build(repos: ReturnType<typeof pgRepos>, spaceId: string, routeId: string) {
  const moduleId = newId();
  must(
    await repos.routeDrafts.addModule(spaceId, routeId, 0, {
      id: moduleId,
      position: "V",
      title: es("El reproductor"),
    }),
    "add its module",
  );
  let revision = 1;
  for (const [l, lesson] of LESSONS.entries()) {
    const lessonId = newId();
    must(
      await repos.routeDrafts.addLesson(spaceId, routeId, revision++, {
        id: lessonId,
        moduleId,
        position: POSITIONS[l] as string,
        title: es(lesson.title),
      }),
      "add a lesson",
    );
    for (const [b, data] of lesson.blocks.entries()) {
      const id = newId();
      const { type, id: _, ...rest } = Block.parse({ id, ...data });
      must(
        await repos.routeDrafts.addBlock(spaceId, routeId, revision++, {
          id,
          lessonId,
          position: POSITIONS[b] as string,
          kind: type,
          data: rest,
        }),
        `add a ${type}`,
      );
    }
  }
}

/** Creates and publishes the demo route as the space's owner; its id. */
async function publish(repos: ReturnType<typeof pgRepos>, spaceId: string, ownerId: string) {
  const routeId = newId();
  must(
    await repos.routeDrafts.create(spaceId, {
      id: routeId,
      slug: SLUG,
      title: es("Demo del reproductor"),
      description: null,
      sourceLocale: "es",
      access: "open",
      pricing: "free",
      topic: "otros",
      level: "inicial",
      priceMinor: null,
      currency: null,
    }),
    "create the route",
  );
  await build(repos, spaceId, routeId);
  const snapshot = snapshotOf(must(await repos.routeDrafts.get(spaceId, routeId), "read it back"));
  // As route.publish does: never store a version that reading it back would refuse.
  upcastSnapshot(SNAPSHOT_FORMAT, snapshot);
  must(
    await repos.routeVersions.append(spaceId, {
      routeId,
      version: 1,
      snapshot,
      contentHash: await contentHash(snapshot),
      publishedByUserId: ownerId,
    }),
    "publish it",
  );
  must(await repos.routeDrafts.markPublished(spaceId, routeId, 1), "mark it published");
  return routeId;
}

export async function seedPlayerDemo(db: pg.Client, space: string, student: string) {
  const { spaceId, ownerId, studentId } = await ids(db, space, student);
  // The draft's functions act for the current user: first the owner, then the student.
  await db.query("select set_config('app.user_id', $1, true)", [ownerId]);
  const repos = pgRepos(drizzle(db, { casing: "snake_case" }));
  const existing = (await repos.routeDrafts.list(spaceId)).find((r) => r.slug === SLUG);
  const routeId = existing?.id ?? (await publish(repos, spaceId, ownerId));
  await db.query("select set_config('app.user_id', $1, true)", [studentId]);
  const enrolled = await repos.enrollments.enroll(routeId);
  return enrolled.ok ? enrolled.value.enrollmentId : null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: { space: { type: "string" }, student: { type: "string" } },
  });
  const url = process.env.DATABASE_URL_MIGRATOR ?? LOCAL;
  if (!LOCAL_HOST.test(url)) {
    throw new Error("the player demo is for the local database only");
  }
  if (!(values.space && values.student)) {
    throw new Error("usage: pnpm db:seed-player-demo --space <slug> --student <email>");
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("begin");
    const enrollmentId = await seedPlayerDemo(client, values.space, values.student);
    await client.query("commit");
    console.log(
      JSON.stringify({
        message: "seeded",
        route: SLUG,
        enrollmentId,
        open: enrollmentId ? `/mis-rutas/${enrollmentId}/tema/1` : null,
      }),
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}
