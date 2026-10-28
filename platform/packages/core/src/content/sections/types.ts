/** One section as the v1 parser produced it: plain strings, v1 field names. */
export type Section = Record<string, unknown> & { type: string };
