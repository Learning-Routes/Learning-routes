// Sending sign-in links (Platform STEP 2 §5.3). A port: the API picks a sender per
// environment. Email delivery is a later STEP, so outside development a sign-in
// link is not sent at all.

export interface MagicLinkMessage {
  email: string;
  /** The app page that asks "Sign in as …?" and posts the token back. */
  url: string;
}

export interface EmailSender {
  sendMagicLink(message: MagicLinkMessage): Promise<void>;
}

/** Development only: the link goes to the Worker's log, where wrangler dev shows it. */
const logSender: EmailSender = {
  async sendMagicLink({ url }) {
    console.log(JSON.stringify({ message: "sign-in link (development only)", url }));
  },
};

const noSender: EmailSender = {
  sendMagicLink() {
    return Promise.reject(new Error("email delivery is not set up yet"));
  },
};

export function emailSenderFor(env: Pick<Env, "EMAIL_DELIVERY">): EmailSender {
  return env.EMAIL_DELIVERY === "log" ? logSender : noSender;
}
