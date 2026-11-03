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
  if (
    action === "catalog.decide" ||
    action === "catalog.withdraw" ||
    action === "catalog.feature"
  ) {
    const { spaceId, routeId } = output as RouteOutput;
    // `catalog`: the pages that list routes, which a newly approved one is not yet on.
    return [`route:${routeId}`, `space:${spaceId}`, "catalog"];
  }
  if (action === "space.update") {
    return [`space:${(output as { spaceId: string }).spaceId}`];
  }
  return [];
}
