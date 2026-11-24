import type { StudioEvent } from "@learning-routes/core/studio/session";

type Preview = NonNullable<Extract<StudioEvent, { type: "previewed" }>["preview"]>;

export const SHORT_PREVIEW: Preview = {
  station: 1,
  title: "¿Qué es una variable?",
  format: "concepto y pregunta",
  body: "Una variable es una caja con nombre: guarda un número que todavía no conocemos.",
  question: { prompt: "Si 2 + x = 9, ¿qué guarda x?", options: ["5", "7", "11"], answer: 1 },
};

/** What an agent really writes: a long title, code, and options that are whole sentences. */
export const LONG_PREVIEW: Preview = {
  station: 1,
  title: "Tu primer programa en Python: variables, texto y la función print() paso a paso",
  format: "concepto, ejemplo guiado y pregunta de opción múltiple",
  body: 'En Python una variable se crea al asignarle un valor con `=`. Si escribes `nombre = "Lucía"` y luego `print(nombre)`, el programa muestra Lucía en la pantalla. El nombre de la variable no lleva comillas; el texto sí. Cuando olvidas las comillas, Python busca una variable con ese nombre y, si no existe, se detiene con un `NameError`.',
  question: {
    prompt: '¿Qué muestra el programa `saludo = "Hola"` seguido de `print(saludo + " mundo")`?',
    options: [
      "Muestra la palabra saludo seguida de mundo, porque print() escribe el nombre de la variable",
      "Muestra Hola mundo, porque une el texto guardado en la variable con el segundo texto",
      "Se detiene con un NameError, porque a la variable saludo le faltan las comillas",
      "No muestra nada hasta que el programa llama a otra función para escribir en la pantalla",
    ],
    answer: 1,
  },
};
