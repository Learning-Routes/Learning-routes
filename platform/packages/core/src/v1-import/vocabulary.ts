// v1's words and the glossary's (FOUNDATIONS.md §4b). v1's names stay in v1's
// data (its stored rows, its lesson syntax, the golden fixtures); this map is
// where the import turns them into the glossary's, and nothing past it uses them.

const TYPES: Record<string, string> = { flashcards: "cards" };
const FIELDS: Record<string, string> = { aftermath: "trailing_content" };

/** New: a v1 block type in the glossary's words; other types are the same in both. */
export function fromV1Type(type: string): string {
  return Object.hasOwn(TYPES, type) ? (TYPES[type] as string) : type;
}

/** New: one v1 section with its type and fields in the glossary's words. */
export function fromV1Section(section: unknown): unknown {
  if (section === null || typeof section !== "object" || Array.isArray(section)) {
    return section;
  }
  const renamed = Object.entries(section).map(([key, value]) => {
    const name = Object.hasOwn(FIELDS, key) ? (FIELDS[key] as string) : key;
    return [name, key === "type" && typeof value === "string" ? fromV1Type(value) : value];
  });
  return Object.fromEntries(renamed);
}
