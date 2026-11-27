import { createContext } from "react";

/**
 * The origins whose files are ours: the app, the public pages and the content host. A lesson
 * plays a video kept on one of them in place; one kept anywhere else stays a link, so nothing of
 * a third party loads unasked. The pages that show lessons say which they are.
 */
export const OwnHosts = createContext<readonly string[]>([]);

export const ownHostsOf = (page: {
  appOrigin: string;
  platformOrigin: string;
  contentOrigin: string;
}): string[] => [page.appOrigin, page.platformOrigin, page.contentOrigin].filter(Boolean);
