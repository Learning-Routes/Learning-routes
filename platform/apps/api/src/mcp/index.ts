import { createMcpApp } from "./app";

const app = createMcpApp();

export default { fetch: app.fetch } satisfies ExportedHandler<Env>;
