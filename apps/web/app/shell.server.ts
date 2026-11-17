import type { CommunityNotification } from "@learning-routes/core/repos/community-ports";
import type { OwnEnrollment } from "@learning-routes/core/repos/ports";
import type { RouterContextProvider } from "react-router";
import { runApiAction } from "./app-api.server";

// What the app's frame shows on every page (Platform STEP 23): who is here, the routes they
// study and their unread notices. A page and the frame around it load at the same time, so each
// read happens once per request and both share the answer.

type Context = Readonly<RouterContextProvider>;

export interface OwnList {
  enrollments: OwnEnrollment[];
  teaches: boolean;
  name: string;
}

export interface Notices {
  items: CommunityNotification[];
  unread: number;
}

const lists = new WeakMap<object, Promise<OwnList | null>>();
const notices = new WeakMap<object, Promise<Notices>>();

function once<T>(memo: WeakMap<object, Promise<T>>, context: Context, read: () => Promise<T>) {
  let pending = memo.get(context);
  if (!pending) {
    pending = read();
    memo.set(context, pending);
  }
  return pending;
}

/** The signed-in person's routes; null when nobody is signed in. */
export function ownList(context: Context, request: Request): Promise<OwnList | null> {
  return once(lists, context, async () => {
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
  return once(notices, context, async () => {
    if (!request.headers.get("cookie")) {
      return NO_NOTICES;
    }
    const answer = await runApiAction<Notices>(context, request, "notification.list", {
      limit: 20,
    }).catch(() => null);
    return answer?.body?.output ?? NO_NOTICES;
  });
}
