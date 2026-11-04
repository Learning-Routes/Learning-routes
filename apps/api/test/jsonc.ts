import ts from "typescript";

/** Parses JSONC as wrangler does: comments anywhere, trailing commas allowed. */
export function parseJsonc(text: string): unknown {
  const { config, error } = ts.parseConfigFileTextToJson("wrangler.jsonc", text);
  if (error) {
    throw new Error(ts.flattenDiagnosticMessageText(error.messageText, "\n"));
  }
  return config;
}
