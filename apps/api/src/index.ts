import { createApp } from "./app";
import { emailSenderFor } from "./auth/email";
import { type PurgeMessage, purgeBatch } from "./cache/purge";

const app = createApp({ emailSender: emailSenderFor });

export default {
  fetch: app.fetch,
  queue: (batch, env) => purgeBatch(batch, env),
} satisfies ExportedHandler<Env, PurgeMessage>;
