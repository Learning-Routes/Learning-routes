// Vitest runs tests through Vite, which provides import.meta.glob. Declared here so
// core needs no Vite or Node typings.
interface ImportMeta {
  glob(
    pattern: string,
    options: { query: "?raw"; import: "default"; eager: true },
  ): Record<string, string>;
  glob(pattern: string | string[], options: { eager: true }): Record<string, unknown>;
}
