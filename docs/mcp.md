# Conecta tu asistente / Connect your assistant

[Español](#español) · [English](#english)

## Español

Con el servidor MCP de Learning Routes, tu propio asistente puede ver tus rutas, crear borradores y publicar cuando se lo pidas. Lo que crea queda en borrador hasta que pides publicarlo.

**Dirección del servidor:** `https://app.learningroutes.com/mcp`

Necesitas tener un espacio para enseñar, como dueño, coeditor o asistente.

### Añadirlo

**Claude (web y Desktop)**

1. Abre Customize y luego Connectors.
2. Pulsa Add custom connector.
3. Pega la dirección del servidor.
4. En OAuth client, deja "Use Claude's published identity".
5. Pulsa Add y luego Connect.

**Claude Code**

1. Ejecuta `claude mcp add --transport http learning-routes https://app.learningroutes.com/mcp`.
2. Abre Claude Code y escribe `/mcp`.
3. Elige `learning-routes` y autentícate en el navegador.

**ChatGPT**

1. Abre chatgpt.com/plugins.
2. Pulsa el signo más y luego "Add custom MCP server".
3. Escribe un nombre y una descripción, y pega la dirección del servidor.
4. Elige OAuth como autenticación.
5. Marca "I understand and want to continue" y pulsa "Create as a plugin".
6. Instálalo y llámalo con `@` en tu mensaje.

En los tres casos, Learning Routes te pregunta si das permiso. Te muestra el nombre del cliente tal como se presenta y la dirección a la que va tu respuesta.

### Permisos

| Permiso | En pantalla | Qué permite |
|---|---|---|
| `routes:read` | Ver tus rutas | Leer tus espacios y borradores |
| `routes:write` | Crear y cambiar borradores | Crear rutas, importarlas y añadir contenido |
| `routes:publish` | Publicar rutas en tu página | Hacer pública una ruta |

Tu papel en cada espacio sigue mandando: un asistente no puede publicar aunque tenga el permiso. El precio se pone en la aplicación, nunca aquí.

### Desconectarlo

Abre **Enseñar**, luego **Conexiones**, y pulsa **Desconectar**. El acceso termina al momento.

### Tres cosas que puedes pedirle

- "Enséñame mis rutas y dime cuáles no he publicado."
- "Convierte estas notas en una ruta de tres módulos, en borrador." El asistente usa `import_route`.
- "Revisa el borrador de Pan de masa madre y publícalo."

## English

With the Learning Routes MCP server, your own assistant can see your routes, create drafts and publish when you ask it to. What it creates stays a draft until you ask to publish it.

**Server address:** `https://app.learningroutes.com/mcp`

You need a space to teach in, as its owner, a coeditor or an assistant.

### Adding it

**Claude (web and Desktop)**

1. Open Customize, then Connectors.
2. Choose Add custom connector.
3. Paste the server address.
4. Under OAuth client, keep "Use Claude's published identity".
5. Choose Add, then Connect.

**Claude Code**

1. Run `claude mcp add --transport http learning-routes https://app.learningroutes.com/mcp`.
2. Open Claude Code and type `/mcp`.
3. Choose `learning-routes` and authenticate in the browser.

**ChatGPT**

1. Open chatgpt.com/plugins.
2. Choose the plus sign, then "Add custom MCP server".
3. Enter a name and a description, and paste the server address.
4. Choose OAuth as the authentication.
5. Tick "I understand and want to continue" and choose "Create as a plugin".
6. Install it and call it with `@` in your message.

Each time, Learning Routes asks whether you allow it. It shows the client's name as the client gives it, and the address your answer goes to.

### Permissions

| Permission | On screen | What it allows |
|---|---|---|
| `routes:read` | Ver tus rutas | Reading your spaces and drafts |
| `routes:write` | Crear y cambiar borradores | Creating routes, importing them and adding content |
| `routes:publish` | Publicar rutas en tu página | Making a route public |

Your role in each space still decides: an assistant can't publish even with the permission. A price is set in the app, never here.

### Disconnecting it

Open **Enseñar**, then **Conexiones**, and choose **Desconectar**. Access ends at once.

### Three things to ask it

- "Show me my routes and tell me which I haven't published."
- "Turn these notes into a three-module route, as a draft." The assistant uses `import_route`.
- "Review the draft of Pan de masa madre and publish it."

## Testing locally

Claude on the web needs a public URL, so test it against production. From the repository root:

1. `docker compose up -d --wait`
2. `pnpm install`
3. `pnpm --filter @learning-routes/api db:migrate`
4. `pnpm --filter @learning-routes/api db:seed-storefront`
5. `pnpm --filter @learning-routes/web build`
6. `pnpm dev:mcp`, and leave it running. The app is at `http://localhost:4174`, and sign-in links are printed in this terminal.
7. Sign in at `http://localhost:4174/sign-in` with any address.
8. In another terminal: `pnpm --filter @learning-routes/api db:seed-storefront --teacher you@example.com`, with that address. It makes you a coeditor of a seeded space.

**With Claude Code**

1. `claude mcp add --transport http learning-routes-local http://localhost:4174/mcp`
2. Open Claude Code, type `/mcp`, choose `learning-routes-local` and authenticate.
3. Ask: "List my spaces."

**With MCP Inspector** (needs Node 22.19 or later)

The server has no dynamic registration, and a client metadata document needs a public address, so locally the Inspector uses a registered client.

1. `pnpm --filter @learning-routes/api db:seed-storefront --oauth-client inspector --oauth-redirect http://127.0.0.1:6274/oauth/callback`
2. `npx @modelcontextprotocol/inspector --server-url http://localhost:4174/mcp --transport http --protocol-era auto`
3. Open the address it prints, enter `inspector` as the OAuth client id, and connect.
