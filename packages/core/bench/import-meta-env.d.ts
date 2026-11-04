// Vitest exposes VITE_* variables on import.meta.env; declared here so core needs
// no Vite typings.
interface ImportMeta {
  readonly env: Record<string, string | undefined>;
}
