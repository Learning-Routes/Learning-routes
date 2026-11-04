import { type PublicRead, withPublicRead } from "@learning-routes/public-read/reads";
import type { RouterContextProvider } from "react-router";
import { pageContext } from "../context";

// The storefront's only way into the database (Platform STEP 4 §1.3). A .server file, so
// neither it nor pg can reach the browser's build.
export function publicReads<T>(
  context: Readonly<RouterContextProvider>,
  fn: (reads: PublicRead) => Promise<T>,
): Promise<T> {
  const { runtime } = context.get(pageContext);
  return withPublicRead(runtime.env, runtime.ctx, fn);
}
