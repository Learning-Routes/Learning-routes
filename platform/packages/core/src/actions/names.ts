// The registry's action names, with no zod and no server code, so browser code can
// import them at runtime. registry.ts checks that it registers exactly these.
export const ACTION_NAMES = ["review.submit"] as const;
export type ActionName = (typeof ACTION_NAMES)[number];
