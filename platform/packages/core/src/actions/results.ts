import type { RepoResult } from "../repos/ports";
import { ActionError } from "./define";

/** A refusal, raised as the action's answer, with its code as the message. */
export function refused(code: ActionError["code"]): ActionError {
  return new ActionError(code, code.replaceAll("_", " "));
}

/** A repository's value, or its refusal raised as the action's answer. */
export function unwrap<T>(result: RepoResult<T>): T {
  if (!result.ok) {
    throw refused(result.error);
  }
  return result.value;
}
