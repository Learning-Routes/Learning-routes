// A private inbox for the real-user proof (Platform STEP 10 §6). Email Routing sends mail for
// proof.email.learningroutes.com here; only our own sender's mail is kept, for an hour, in KV that
// only this Cloudflare account can read. It has no fetch handler, so nothing reads it from the web.

// Its own bindings (wrangler.inbox.jsonc), none of the API's, so not the generated Env.
interface InboxEnv {
  INBOX: KVNamespace;
  SENDER_DOMAIN: string;
}

const MOST_BYTES = 200_000;
const KEEP_SECONDS = 3600;
const HEADER_ADDRESS = /([^<\s]+@[^>\s]+)>?\s*$/;

const domainOf = (address: string) => address.toLowerCase().split("@").pop() ?? "";

// The envelope (our bounce subdomain) can be set by anyone; the From header is what DMARC holds
// to our domain's p=reject, so it must be exactly ours, never a subdomain.
const isOurs = (message: ForwardableEmailMessage, sender: string) => {
  const envelope = domainOf(message.from);
  const header = domainOf(HEADER_ADDRESS.exec(message.headers.get("from") ?? "")?.[1] ?? "");
  return (envelope === sender || envelope.endsWith(`.${sender}`)) && header === sender;
};

export default {
  async email(message: ForwardableEmailMessage, env: InboxEnv) {
    if (!(env.SENDER_DOMAIN && isOurs(message, env.SENDER_DOMAIN))) {
      message.setReject("not accepted here");
      return;
    }
    if (message.rawSize > MOST_BYTES) {
      message.setReject("too large");
      return;
    }
    const raw = await new Response(message.raw).text();
    const key = `${message.to.toLowerCase()}:${Date.now()}:${crypto.randomUUID()}`;
    await env.INBOX.put(key, raw, { expirationTtl: KEEP_SECONDS });
  },
} satisfies ExportedHandler<InboxEnv>;
