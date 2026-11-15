// One short example of each block the player brings (Platform STEP 12), in the guide a model reads
// before writing a route. A test imports every one, so the guide cannot teach a block that fails.

export const PLAYER_BLOCK_EXAMPLES: Record<string, unknown>[] = [
  {
    type: "order",
    prompt: { es: "Ordena el cambio de pastillas" },
    items: [{ es: "Asegura la moto" }, { es: "Quita los tornillos" }, { es: "Pon las nuevas" }],
  },
  {
    type: "true_false",
    statements: [
      { text: { es: "La luz baja da sombras suaves." }, answer: true },
      {
        text: { es: "El zoom digital no pierde calidad." },
        answer: false,
        why: { es: "Recorta la foto." },
      },
    ],
  },
  {
    type: "estimate",
    prompt: { es: "¿Qué pH tiene el vinagre?" },
    min: 0,
    max: 14,
    step: 0.1,
    answer_min: 2.4,
    answer_max: 3.4,
    anchors: [{ value: 7, label: { es: "Agua" } }],
  },
  {
    type: "hotspot",
    prompt: { es: "¿Cuál pieza se gasta?" },
    diagram: "brake",
    spots: [
      { x: 0.3, y: 0.5, label: { es: "Disco" }, correct: false },
      { x: 0.62, y: 0.4, label: { es: "Pastilla" }, correct: true },
    ],
  },
  {
    type: "worked_example",
    problem: { es: "Resuelve 2x + 7 = 19" },
    steps: [
      { label: { es: "Quita 7" }, work: "2x = 12", why: { es: "Lo mismo a los dos lados." } },
      { label: { es: "Divide entre 2" }, work: "x = 6", why: { es: "El 2 multiplica a la x." } },
    ],
  },
  {
    type: "speak",
    phrase: "Could we push the deadline to Thursday?",
    lang: "en-US",
    translation: { es: "¿Podemos mover la entrega al jueves?" },
  },
  {
    type: "code_check",
    language: "javascript",
    starter: "function promedio(notas) {\n  return 0;\n}",
    tests: [{ call: "promedio([8, 10])", expected: "9" }],
  },
  {
    type: "open_answer",
    prompt: { es: "¿Por qué conviene un fondo de emergencia antes de invertir?" },
    rubric: [
      { es: "Nombra un imprevisto real" },
      { es: "Explica el riesgo de vender con pérdida" },
    ],
  },
  {
    type: "sim",
    prompt: { es: "Haz que pasen 2 A por el foco" },
    setup: { kind: "ohm", target_amps: 2, v: [0, 12], r: [1, 12], tolerance: 0.05 },
  },
];

/** Each sim kind's setup, in one line: what the guide lists after the example. */
export const SIM_SETUPS = `- piano_chord: { target: [0, 4, 7], low: 60, high: 76 }  (pitch classes 0-11; MIDI keys)
- guitar_chord: { target: { "5": 2, "4": 2 } }  (string 1-6: fret 0-5; open strings left out)
- camera_exposure: { scene_ev: 13, min_shutter_denominator: 250 }
- compound_interest: { rate: 6, years: 10, goal: 20000, min: 50, max: 300, step: 10 }  (rate in % a year)
- css_flex: { target: { justify: "between", align: "center" } }  (justify: start, center, end, between; align: start, center, end)
- fraction_pie: { parts: 8, target: 3 }
- ohm: { target_amps: 2, v: [0, 12], r: [1, 12], tolerance: 0.05 }
- equation_balance: { terms: [{ formula: "H2", atoms: { H: 2 }, side: "left" }, { formula: "O2", atoms: { O: 2 }, side: "left" }, { formula: "H2O", atoms: { H: 2, O: 1 }, side: "right" }], max: 6 }
- chess_mate_in_one: { fen: "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1", solution: "a1a8" }  (rook, queen, bishop, knight or king)
- color_wheel: { base: 8, relation: "complement" }  (complement, analogous or triad; hues 0-11)
- roleplay: { lang: "en", turns: [{ line: "Tell me about yourself.", choices: [{ text: "…", score: 2, note: { es: "Natural" }, reply: "…" }, …] }] }  (2-4 choices, score 0-2)
- cpr_rhythm: { min_bpm: 100, max_bpm: 120, count: 15 }  (practice only, never graded)
- step_sequencer: { bpm: 90, rows: [{ name: { es: "Bombo" }, steps: [0, 8] }] }  (steps 0-15; practice only)`;
