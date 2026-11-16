// The code runner (Platform STEP 12): a fixed page the player frames to run a code beat's tests. The
// creator wrote the starter and the learner the code, so neither runs in the app: here it runs in a
// worker inside an opaque, sandboxed origin with no network, and a worker that takes too long is
// stopped. The page answers only the window that framed it, and only with the tests' results.

const TIME_LIMIT_MS = 3000;

// The worker's body: the learner's code, then each test's call, compared as JSON.
const WORKER = `
self.onmessage = (event) => {
  const { code, tests } = event.data;
  const show = (value) => {
    if (value === undefined) return "undefined";
    try { return JSON.stringify(value); } catch { return String(value); }
  };
  const same = (got, expected) => {
    try { return JSON.stringify(got) === JSON.stringify(JSON.parse(expected)); }
    catch { return String(got) === expected; }
  };
  const results = tests.map((test) => {
    try {
      const got = new Function(code + "\\n;return (" + test.call + ");")();
      return { call: test.call, expected: test.expected, got: show(got), pass: same(got, test.expected) };
    } catch (error) {
      return { call: test.call, expected: test.expected, got: String(error), pass: false };
    }
  });
  self.postMessage(results);
};
`;

const PAGE = `<!doctype html><meta charset="utf-8"><title>runner</title><script>
const source = URL.createObjectURL(new Blob([${JSON.stringify(WORKER)}], { type: "text/javascript" }));
addEventListener("message", (event) => {
  if (event.source !== parent || !event.data || event.data.type !== "run") return;
  const tests = Array.isArray(event.data.tests) ? event.data.tests.slice(0, 6) : [];
  const code = String(event.data.code || "").slice(0, 8000);
  const worker = new Worker(source);
  const answer = (results) => { worker.terminate(); clearTimeout(timer); parent.postMessage({ type: "results", results }, "*"); };
  const timer = setTimeout(() => answer(tests.map((t) => ({ call: t.call, expected: t.expected, got: "timeout", pass: false }))), ${TIME_LIMIT_MS});
  worker.onmessage = (e) => answer(e.data);
  worker.onerror = (e) => { e.preventDefault(); answer(tests.map((t) => ({ call: t.call, expected: t.expected, got: String(e.message), pass: false }))); };
  worker.postMessage({ code, tests });
});
</script>`;

/** The runner page, under the creations' policy: framed only by the app, in its own box. */
export function runner(request: Request, policy: string): Response {
  return new Response(request.method === "HEAD" ? null : PAGE, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": policy,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Strict-Transport-Security": "max-age=86400",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
