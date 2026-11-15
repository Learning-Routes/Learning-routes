import { describe, expect, it } from "vitest";
import { parseLesson } from "../../src/content/parser";
import type { Locale } from "../../src/localized-text";
import { importV1Block } from "../../src/v1-import/import";

// Platform STEP 12 PR 1: the player's fences, written in English or in Spanish. Each one parses to
// a section that crosses the v1 import into a valid stored block.

async function blockOf(markdown: string, locale: Locale) {
  const [section] = parseLesson(markdown, { locale });
  return importV1Block(section, { routeId: "r", lessonId: "l", position: 0, locale });
}

describe(":::order", () => {
  it("reads the steps in their order, in English", async () => {
    const block = await blockOf(
      ":::order Put the brake pad change in order\n1. Secure the bike\n2. Remove the bolts\n3. Fit the new pads\nExplanation: Bolts before pads.\n:::",
      "en",
    );
    expect(block).toMatchObject({
      type: "order",
      prompt: { en: "Put the brake pad change in order" },
      items: [{ en: "Secure the bike" }, { en: "Remove the bolts" }, { en: "Fit the new pads" }],
      explanation: { en: "Bolts before pads." },
    });
  });

  it("and in Spanish", async () => {
    const block = await blockOf(
      ":::order Ordena el cambio de pastillas\n- Asegura la moto\n- Quita los tornillos\nExplicación: Primero los tornillos.\n:::",
      "es",
    );
    expect(block).toMatchObject({
      prompt: { es: "Ordena el cambio de pastillas" },
      items: [{ es: "Asegura la moto" }, { es: "Quita los tornillos" }],
      explanation: { es: "Primero los tornillos." },
    });
  });
});

describe(":::true_false", () => {
  it("reads each statement with its answer and why, in English", async () => {
    const block = await blockOf(
      ":::true_false\nTRUE: Water boils at 100 °C at sea level.\nFALSE: Iron floats.\nWhy: It is denser than water.\n:::",
      "en",
    );
    expect(block).toMatchObject({
      type: "true_false",
      statements: [
        { text: { en: "Water boils at 100 °C at sea level." }, answer: true },
        { text: { en: "Iron floats." }, answer: false, why: { en: "It is denser than water." } },
      ],
    });
  });

  it("and in Spanish", async () => {
    const block = await blockOf(
      ":::true_false\nCIERTO: La luz baja da menos sombras.\nFALSO: El zoom digital no pierde calidad.\nPor qué: Recorta la foto.\n:::",
      "es",
    );
    expect(block).toMatchObject({
      statements: [
        { text: { es: "La luz baja da menos sombras." }, answer: true },
        {
          text: { es: "El zoom digital no pierde calidad." },
          answer: false,
          why: { es: "Recorta la foto." },
        },
      ],
    });
  });
});

describe(":::estimate", () => {
  it("reads the scale, the answer range and the anchors, in English", async () => {
    const block = await blockOf(
      ":::estimate What pH does vinegar have?\nScale: 0 to 14\nStep: 0.1\nUnit: pH\nAnswer: 2.4 to 3.4\nAnchor: 7 = Water\nExplanation: Acetic acid.\n:::",
      "en",
    );
    expect(block).toMatchObject({
      type: "estimate",
      prompt: { en: "What pH does vinegar have?" },
      min: 0,
      max: 14,
      step: 0.1,
      unit: { en: "pH" },
      answer_min: 2.4,
      answer_max: 3.4,
      anchors: [{ value: 7, label: { en: "Water" } }],
    });
  });

  it("and in Spanish, with decimal commas", async () => {
    const block = await blockOf(
      ":::estimate ¿Qué pH tiene el vinagre?\nEscala: 0 a 14\nPaso: 0,1\nRespuesta: 2,4 a 3,4\nReferencia: 2 = Limón\n:::",
      "es",
    );
    expect(block).toMatchObject({ min: 0, max: 14, step: 0.1, answer_min: 2.4, answer_max: 3.4 });
    expect(block).toMatchObject({ anchors: [{ value: 2, label: { es: "Limón" } }] });
  });
});

describe(":::hotspot", () => {
  it("reads the spots, the right ones ticked, in English", async () => {
    const block = await blockOf(
      ":::hotspot Which part wears out?\nDiagram: brake\n- [ ] Disc @ 30% 50%\n- [x] Pad @ 62% 40%\n:::",
      "en",
    );
    expect(block).toMatchObject({
      type: "hotspot",
      diagram: "brake",
      spots: [
        { x: 0.3, y: 0.5, label: { en: "Disc" }, correct: false },
        { x: 0.62, y: 0.4, label: { en: "Pad" }, correct: true },
      ],
    });
  });

  it("and in Spanish, on an image", async () => {
    const block = await blockOf(
      ":::hotspot ¿Cuál pieza se gasta?\nImagen: https://example.com/freno.png\n- [x] Pastilla @ 62% 40%\n- [ ] Pistón @ 80% 70%\n:::",
      "es",
    );
    expect(block).toMatchObject({ image_url: "https://example.com/freno.png" });
    expect(block).toMatchObject({
      spots: [{ label: { es: "Pastilla" }, correct: true }, { correct: false }],
    });
  });
});

describe(":::worked_example", () => {
  it("reads each step as label | work | why, in English", async () => {
    const block = await blockOf(
      ":::worked_example Solve 2x + 7 = 19\n1. Take 7 from both sides | 2x = 12 | What you do to one side, do to the other.\n2. Divide by 2 | x = 6 | The 2 multiplies x.\n:::",
      "en",
    );
    expect(block).toMatchObject({
      type: "worked_example",
      problem: { en: "Solve 2x + 7 = 19" },
      steps: [
        {
          label: { en: "Take 7 from both sides" },
          work: "2x = 12",
          why: { en: "What you do to one side, do to the other." },
        },
        { label: { en: "Divide by 2" }, work: "x = 6" },
      ],
    });
  });

  it("and in Spanish", async () => {
    const block = await blockOf(
      ":::worked_example Resuelve 2x + 7 = 19\n1. Quita 7 de los dos lados | 2x = 12 | Lo que haces a un lado, al otro.\n:::",
      "es",
    );
    expect(block).toMatchObject({
      steps: [{ label: { es: "Quita 7 de los dos lados" }, work: "2x = 12" }],
    });
  });
});

describe(":::speak", () => {
  it("reads the phrase, its language and translation, in English", async () => {
    const block = await blockOf(
      ":::speak Could we push the deadline to Thursday?\nLanguage: en-US\nTranslation: Can we move it?\n:::",
      "en",
    );
    expect(block).toMatchObject({
      type: "speak",
      phrase: "Could we push the deadline to Thursday?",
      lang: "en-US",
      translation: { en: "Can we move it?" },
    });
  });

  it("and in Spanish", async () => {
    const block = await blockOf(
      ":::speak Could we push the deadline?\nIdioma: en\nTraducción: ¿Podemos mover la entrega?\n:::",
      "es",
    );
    expect(block).toMatchObject({
      phrase: "Could we push the deadline?",
      lang: "en",
      translation: { es: "¿Podemos mover la entrega?" },
    });
  });
});

describe(":::code_check", () => {
  it("reads the starter code, the tests and the hint, in English", async () => {
    const block = await blockOf(
      ":::code_check\n```javascript\nfunction average(xs) {\n  return 0;\n}\n```\nTest: average([]) => 0\nTest: average([8, 10]) => 9\nHint: What if it is empty?\n:::",
      "en",
    );
    expect(block).toMatchObject({
      type: "code_check",
      language: "javascript",
      starter: "function average(xs) {\n  return 0;\n}",
      tests: [
        { call: "average([])", expected: "0" },
        { call: "average([8, 10])", expected: "9" },
      ],
      hint: { en: "What if it is empty?" },
    });
  });

  it("and in Spanish", async () => {
    const block = await blockOf(
      ":::code_check\n```js\nconst f = (x) => x;\n```\nPrueba: f(2) => 2\nPista: Devuelve lo mismo.\n:::",
      "es",
    );
    expect(block).toMatchObject({
      language: "javascript",
      tests: [{ call: "f(2)", expected: "2" }],
      hint: { es: "Devuelve lo mismo." },
    });
  });
});

describe(":::open_answer", () => {
  it("reads the rubric and the model answer, in English", async () => {
    const block = await blockOf(
      ":::open_answer Why build an emergency fund before investing?\n- Names a real surprise\n- Explains the risk of selling at a loss\nModel answer: So you never sell at a loss.\n:::",
      "en",
    );
    expect(block).toMatchObject({
      type: "open_answer",
      prompt: { en: "Why build an emergency fund before investing?" },
      rubric: [{ en: "Names a real surprise" }, { en: "Explains the risk of selling at a loss" }],
      model_answer: { en: "So you never sell at a loss." },
    });
  });

  it("and in Spanish", async () => {
    const block = await blockOf(
      ":::open_answer ¿Por qué un fondo de emergencia?\n- Nombra un imprevisto real\nRespuesta modelo: Para no vender en mal momento.\n:::",
      "es",
    );
    expect(block).toMatchObject({
      rubric: [{ es: "Nombra un imprevisto real" }],
      model_answer: { es: "Para no vender en mal momento." },
    });
  });
});

describe(":::sim", () => {
  it("reads the kind and its setup, in English", async () => {
    const block = await blockOf(
      ':::sim Make 2 A flow through the bulb\nKind: ohm\nExplanation: I = V / R.\n```json\n{ "target_amps": 2, "v": [0, 12], "r": [1, 12], "tolerance": 0.05 }\n```\n:::',
      "en",
    );
    expect(block).toMatchObject({
      type: "sim",
      prompt: { en: "Make 2 A flow through the bulb" },
      explanation: { en: "I = V / R." },
      setup: { kind: "ohm", target_amps: 2, v: [0, 12], r: [1, 12], tolerance: 0.05 },
    });
  });

  it("and in Spanish", async () => {
    const block = await blockOf(
      ':::sim Colorea 3/8 de la pizza\nTipo: fraction_pie\n```json\n{ "parts": 8, "target": 3 }\n```\n:::',
      "es",
    );
    expect(block).toMatchObject({
      prompt: { es: "Colorea 3/8 de la pizza" },
      setup: { kind: "fraction_pie", parts: 8, target: 3 },
    });
  });

  it("never throws on a setup that is not JSON: the block is refused at import instead", async () => {
    const [section] = parseLesson(":::sim Toca\nKind: ohm\n```json\n{ not json\n```\n:::", {
      locale: "en",
    });
    expect(section).toMatchObject({ type: "sim", setup: { kind: "ohm" } });
    await expect(
      blockOf(":::sim Toca\nKind: ohm\n```json\n{ not json\n```\n:::", "en"),
    ).rejects.toThrow();
  });
});
