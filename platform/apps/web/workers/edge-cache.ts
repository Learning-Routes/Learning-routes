// The storefront's edge cache (Platform STEP 4 §1.4): the Cache API, keyed by the bare
// URL, so no cookie or header can split or poison a page. A route opts in by sending
// s-maxage. Workers Cache, the wrangler setting, is not used: its key leaves out the
// host, creators' hosts share this Worker, and no zone purge reaches it.

const IS_EDGE_CACHEABLE = /\bs-maxage=/;

interface EdgeCache {
  match(key: Request): Promise<Response | undefined>;
  put(key: Request, response: Response): Promise<void>;
}

function isCacheable(response: Response): boolean {
  return (
    response.status === 200 &&
    IS_EDGE_CACHEABLE.test(response.headers.get("cache-control") ?? "") &&
    !response.headers.has("set-cookie")
  );
}

export async function servedFromEdge(
  request: Request,
  ctx: { waitUntil(promise: Promise<unknown>): void },
  cache: EdgeCache,
  render: (request: Request) => Promise<Response>,
): Promise<Response> {
  if (request.method !== "GET") {
    return render(request);
  }
  const key = new Request(request.url);
  const hit = await cache.match(key).catch(() => undefined);
  if (hit) {
    return hit;
  }
  const response = await render(request);
  if (isCacheable(response)) {
    ctx.waitUntil(cache.put(key, response.clone()).catch(() => undefined));
  }
  return response;
}
