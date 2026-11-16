import { useEffect } from "react";

// The next page's code, fetched while this one sits idle (Platform STEP 15): Mis rutas and a
// topic's reading page warm the player, so opening a topic waits only on its data. Only the
// code: a data prefetch would ask the API for a lesson on every visit. The route's files come
// from React Router's own manifest in the page.

type Manifest = { routes: Record<string, { module: string; imports?: string[] } | undefined> };

/** The files a route needs, its module and what it imports, as the manifest names them. */
export function filesOf(manifest: Manifest | undefined, routeId: string): string[] {
  const route = manifest?.routes[routeId];
  return route ? [route.module, ...(route.imports ?? [])] : [];
}

export function usePreloadRoute(routeId: string) {
  useEffect(() => {
    const preload = () => {
      const manifest = (window as { __reactRouterManifest?: Manifest }).__reactRouterManifest;
      for (const href of filesOf(manifest, routeId)) {
        if (!document.head.querySelector(`link[href="${CSS.escape(href)}"]`)) {
          const link = document.createElement("link");
          link.rel = "modulepreload";
          link.href = href;
          document.head.appendChild(link);
        }
      }
    };
    const idle = window.requestIdleCallback?.(preload) ?? window.setTimeout(preload, 1);
    return () =>
      window.cancelIdleCallback ? window.cancelIdleCallback(idle) : window.clearTimeout(idle);
  }, [routeId]);
}
