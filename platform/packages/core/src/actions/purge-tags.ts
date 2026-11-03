// Which cached public pages an action makes stale (Platform STEP 4 §1.4). The API
// queues these after the commit. Data in, tags out: core calls nothing.

interface RouteOutput {
  spaceId: string;
  routeId: string;
}

export function purgeTagsAfter(action: string, output: unknown): string[] {
  if (action === "route.publish") {
    const { spaceId, routeId } = output as RouteOutput;
    return [`route:${routeId}`, `space:${spaceId}`];
  }
  return [];
}
