import { routeDocumentJsonSchema } from "@learning-routes/core/content/route-document";
import type { McpServer } from "@modelcontextprotocol/server";

// What a model reads before writing a route (Platform STEP 5 §4), in Spanish and English. The
// example is invented. The JSON Schema comes from core's rules, so it cannot drift from them.

const EXAMPLE = `{
  "slug": "pan-de-masa-madre",
  "title": { "es": "Pan de masa madre" },
  "description": { "es": "De la primera masa madre al primer pan." },
  "source_locale": "es",
  "topic": "otros",
  "level": "inicial",
  "modules": [
    {
      "title": { "es": "La masa madre" },
      "lessons": [
        {
          "title": { "es": "Qué necesitas" },
          "blocks": [
            { "type": "concept", "body": { "es": "Solo harina, agua y una semana." } },
            {
              "type": "check",
              "question": { "es": "¿Qué alimenta la masa madre?" },
              "options": [
                { "label": { "es": "La harina" }, "correct": true },
                { "label": { "es": "La sal" }, "correct": false }
              ]
            }
          ]
        }
      ]
    }
  ]
}`;

const GUIDE = `# Cómo escribir una ruta

Una ruta tiene módulos, cada módulo tiene lecciones y cada lección tiene bloques. import_route recibe la ruta entera en un solo documento y escribe todo o nada. Crea un borrador que nadie ve hasta que alguien lo publica con publish_route.

- Cada texto va por idioma: {"es": "Hola"}. El título necesita el idioma de source_locale.
- Hasta 30 módulos, 300 lecciones y 5000 bloques por ruta.
- Los enlaces y los medios solo pueden ser https. Los medios se indican con su dirección y aquí nadie los descarga.
- Los campos desconocidos se descartan.
- El precio se pone en la aplicación, nunca aquí.
- Si algo está mal, no se escribe nada y la respuesta da cada problema con su ruta, como modules[1].lessons[3].blocks[0].

Para reemplazar un borrador, pasa route_id y el draft_revision que leíste con get_route.

# How to write a route

A route has modules, each module has lessons and each lesson has blocks. import_route takes the whole route in one document and writes all of it or nothing. It makes a draft nobody sees until someone publishes it with publish_route.

- Every text is by locale: {"en": "Hello"}. The title needs the locale in source_locale.
- Up to 30 modules, 300 lessons and 5000 blocks in a route.
- Links and media must be https. Media is given by its address, and nothing here downloads it.
- Unknown fields are dropped.
- A price is set in the app, never here.
- If anything is wrong, nothing is written, and the answer names each problem with its path, like modules[1].lessons[3].blocks[0].

To replace a draft, pass route_id and the draft_revision you read with get_route.

# Example

\`\`\`json
${EXAMPLE}
\`\`\`

The full format is the JSON Schema at learning-routes://schemas/route-document.
`;

export function registerGuides(server: McpServer) {
  server.registerResource(
    "route-format",
    "learning-routes://guides/route-format",
    {
      title: "How to write a route",
      description: "The route document's format, in Spanish and English, with an example.",
      mimeType: "text/markdown",
    },
    (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: GUIDE }] }),
  );
  server.registerResource(
    "route-document-schema",
    "learning-routes://schemas/route-document",
    {
      title: "The route document's JSON Schema",
      description: "JSON Schema 2020-12 for import_route's document.",
      mimeType: "application/schema+json",
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/schema+json",
          text: JSON.stringify(routeDocumentJsonSchema()),
        },
      ],
    }),
  );
}
