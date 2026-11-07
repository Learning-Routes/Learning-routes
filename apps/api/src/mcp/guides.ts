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
- Los enlaces y los medios solo pueden ser https. Un medio se indica con su dirección; para guardarlo aquí, usa upload_asset.
- Los campos desconocidos se descartan.
- El precio se pone en la aplicación, nunca aquí.
- Si algo está mal, no se escribe nada y la respuesta da cada problema con su ruta, como modules[1].lessons[3].blocks[0].

Para reemplazar un borrador, pasa route_id y el draft_revision que leíste con get_route.

## Lo que el creador ya hizo llega tal cual

- Un curso escrito: upload_document, con sus palabras tal cual.
- Una creación interactiva, como un piano, un juego o un simulador en un solo archivo HTML: upload_creation, tal cual, hasta 2 MB. Nunca la reconstruyas, la acortes ni la reescribas, ni ofrezcas rehacerla.
- Aquí corre en su propia caja. No puede pedir datos a internet, guardar datos en el navegador, abrir ventanas ni mostrar alert, confirm o prompt. Puede cargar bibliotecas de cdnjs.cloudflare.com, cdn.jsdelivr.net y unpkg.com, y fuentes de Google Fonts. upload_creation dice qué no podrá hacer.
- Dale su forma con shape: wide (16:9), standard (4:3, la de siempre), square (1:1) o tall (3:4), según cómo esté diseñada.
- Cuando el estudiante la termina, la creación puede avisar con parent.postMessage({ type: "lr:done" }, "*"). La lección dice "Lo terminaste". Cualquier otro mensaje se ignora. Agrégalo solo si el creador lo pide: es la única línea que se puede sumar a su archivo.
- Imágenes, sonido y video: upload_asset, en base64 o desde una dirección https. Usa la dirección que devuelve en image_url, audio_url o video_url, o dentro de una creación.

# How to write a route

A route has modules, each module has lessons and each lesson has blocks. import_route takes the whole route in one document and writes all of it or nothing. It makes a draft nobody sees until someone publishes it with publish_route.

- Every text is by locale: {"en": "Hello"}. The title needs the locale in source_locale.
- Up to 30 modules, 300 lessons and 5000 blocks in a route.
- Links and media must be https. Media is given by its address; to keep it here, use upload_asset.
- Unknown fields are dropped.
- A price is set in the app, never here.
- If anything is wrong, nothing is written, and the answer names each problem with its path, like modules[1].lessons[3].blocks[0].

To replace a draft, pass route_id and the draft_revision you read with get_route.

## What the creator already made arrives as it is

- A written course: upload_document, with their words as they are.
- An interactive creation, like a piano, a game or a simulator in one HTML file: upload_creation, as it is, up to 2 MB. Never rebuild, shorten or rewrite it, and never offer to remake it.
- Here it runs in its own box. It cannot reach the internet, save data in the browser, open windows or show alert, confirm or prompt. It can load libraries from cdnjs.cloudflare.com, cdn.jsdelivr.net and unpkg.com, and fonts from Google Fonts. upload_creation says what it will not be able to do.
- Give it its shape: wide (16:9), standard (4:3, the default), square (1:1) or tall (3:4), from how it is laid out.
- When the student finishes it, the creation can say so with parent.postMessage({ type: "lr:done" }, "*"). The lesson then shows "Lo terminaste". Any other message is ignored. Add it only if the creator asks: it is the one line their file may gain.
- Images, sound and video: upload_asset, in base64 or from an https address. Use the address it returns in image_url, audio_url or video_url, or inside a creation.

# Example

\`\`\`json
${EXAMPLE}
\`\`\`

The full format is the JSON Schema at learning-routes://schemas/route-document.
`;

/** The same guide, for a client that reads tools and not resources. */
export const routeFormat = () => ({ guide: GUIDE, json_schema: routeDocumentJsonSchema() });

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
