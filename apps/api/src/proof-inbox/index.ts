// A private inbox for the real-user proof (Platform STEP 10 §6). Email Routing sends mail for
// proof.email.learningroutes.com here; only our own sender's mail is kept, for an hour, in KV that
// only this Cloudflare account can read. It has no fetch handler, so nothing reads it from the web.

type Env = { INBOX: KVNamespace; SENDER_DOMAIN: string };

const MOST_BYTES = 200_000;
const KEEP_SECONDS = 3600;

const isFrom = (from: string, sender: string) => {
  const domain = from.toLowerCase().split("@").pop() ?? "";
  return domain === sender || domain.endsWith(`.${sender}`);
};

export default {
  async email(message: ForwardableEmailMessage, env: Env) {
    if (!(env.SENDER_DOMAIN && isFrom(message.from, env.SENDER_DOMAIN))) {
      message.setReject("not accepted here");
      return;
    }
    if (message.rawSize > MOST_BYTES) {
      message.setReject("too large");
      return;
    }
    const raw = await new Response(message.raw).text();
    await env.INBOX.put(`${message.to.toLowerCase()}:${Date.now()}`, raw, {
      expirationTtl: KEEP_SECONDS,
    });
  },
} satisfies ExportedHandler<Env>;
