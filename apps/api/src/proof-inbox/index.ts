// A private inbox for the real-user proof (Platform STEP 10 §6). Email Routing sends the two test
// addresses at proof.email.learningroutes.com here; only our own sender's mail to them is kept, for
// a day, in KV that only this Cloudflare account can read. It has no fetch handler and logs nothing.

// Its own bindings (wrangler.inbox.jsonc), none of the API's, so not the generated Env.
interface InboxEnv {
  INBOX: KVNamespace;
  SENDER_DOMAIN: string;
  /** The addresses it serves, comma-separated; mail for any other is refused. */
  ADDRESSES: string;
}

const MOST_BYTES = 200_000;
const KEEP_SECONDS = 86_400;
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
    const to = message.to.toLowerCase();
    const served = env.ADDRESSES.toLowerCase()
      .split(",")
      .map((address) => address.trim());
    if (!(served.includes(to) && env.SENDER_DOMAIN && isOurs(message, env.SENDER_DOMAIN))) {
      message.setReject("not accepted here");
      return;
    }
    if (message.rawSize > MOST_BYTES) {
      message.setReject("too large");
      return;
    }
    const raw = await new Response(message.raw).text();
    const key = `${to}:${Date.now()}:${crypto.randomUUID()}`;
    await env.INBOX.put(key, raw, { expirationTtl: KEEP_SECONDS });
  },
} satisfies ExportedHandler<InboxEnv>;
