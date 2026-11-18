import type { CommunityNotification } from "@learning-routes/core/repos/community-ports";
import type { OwnEnrollment } from "@learning-routes/core/repos/ports";
import { createContext, type RouterContextProvider } from "react-router";
import { runApiAction } from "./app-api.server";

// What the app's frame shows on every page (Platform STEP 23): who is here, the routes they
// study and their unread notices. A page and the frame around it load at the same time, so each
// read happens once per request and both share the answer.

type Context = RouterContextProvider | Readonly<RouterContextProvider>;

export interface OwnList {
  enrollments: OwnEnrollment[];
  teaches: boolean;
  name: string;
}

export interface Notices {
  items: CommunityNotification[];
  unread: number;
}

// The pending reads live in this request's own context, never in the module: a Worker serves many
// requests from one module, and nothing of one person's may outlive their request.
const listRead = createContext<Promise<OwnList | null> | null>(null);
const noticesRead = createContext<Promise<Notices> | null>(null);

function once<T>(
  key: ReturnType<typeof createContext<Promise<T> | null>>,
  context: Context,
  read: () => Promise<T>,
) {
  let pending = context.get(key);
  if (!pending) {
    pending = read();
    context.set(key, pending);
  }
  return pending;
}

/** The signed-in person's routes; null when nobody is signed in. */
export function ownList(context: Context, request: Request): Promise<OwnList | null> {
  return once(listRead, context, async () => {
    if (!request.headers.get("cookie")) {
      return null;
    }
    const answer = await runApiAction<OwnList>(context, request, "enrollment.list", {});
    return answer.body?.output ?? null;
  });
}

const NO_NOTICES: Notices = { items: [], unread: 0 };

/** Their newest notices. A failure here never takes a page down: it reads as none. */
export function ownNotices(context: Context, request: Request): Promise<Notices> {
  return once(noticesRead, context, async () => {
    if (!request.headers.get("cookie")) {
      return NO_NOTICES;
    }
    const answer = await runApiAction<Notices>(context, request, "notification.list", {
      limit: 20,
    }).catch(() => null);
    return answer?.body?.output ?? NO_NOTICES;
  });
}
