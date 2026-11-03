// How long the edge may keep a storefront page (Platform STEP 4 §1.4), and the tags
// that purge it. `catalog` is on any page that lists routes it cannot name in advance:
// a newly approved route has no tag on the page it is about to appear in.

const EDGE_CACHE = "public, s-maxage=300, stale-while-revalidate=60";

export function storefrontHeaders(tags: string[]) {
  return { "Cache-Control": EDGE_CACHE, "Cache-Tag": tags.join(",") };
}
