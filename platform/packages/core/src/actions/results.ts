import type { RepoResult } from "../repos/ports";
import { ActionError } from "./define";

/** A repository's value, or its refusal raised as the action's answer. */
export function unwrap<T>(result: RepoResult<T>): T {
  if (!result.ok) {
    throw new ActionError(result.error, result.error.replace("_", " "));
  }
  return result.value;
}
