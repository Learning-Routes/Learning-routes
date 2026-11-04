// Vitest runs tests through Vite, which provides import.meta.glob. Declared here so
// the API tests need no Vite typings.
interface ImportMeta {
  glob(
    pattern: string | string[],
    options: { query: "?raw"; import: "default"; eager: true },
  ): Record<string, string>;
}
