// Models write a check's right answer first out of habit, so a student who always picks the first
// option would pass. The assistant's add_blocks mixes each check's options before they are saved:
// the same question always gets the same order. Only what the assistant writes, never a creator's
// document (upload_document, import_route).

/** FNV-1a: a stable number for a text. */
function hashOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  }
  return hash;
}

function mixed(block: unknown): unknown {
  const { type, question, options } = (block ?? {}) as Record<string, unknown>;
  if (type !== "check" || !Array.isArray(options)) {
    return block;
  }
  const key = (option: unknown) => hashOf(JSON.stringify(question) + JSON.stringify(option));
  return { ...(block as object), options: [...options].sort((a, b) => key(a) - key(b)) };
}

/** A content tool's input as it is saved: add_blocks with each check's options mixed. */
export function writtenByAgent(tool: string, input: unknown): unknown {
  const blocks = (input as { blocks?: unknown } | null)?.blocks;
  if (tool !== "add_blocks" || !Array.isArray(blocks)) {
    return input;
  }
  return { ...(input as object), blocks: blocks.map(mixed) };
}
