/** A page's enhancement script (ADR 0008): a module, so it never blocks the first paint. */
export function EnhancementScript({ page }: { page: "landing" | "stage" }) {
  // Under `react-router dev` Vite serves the source; the build makes the fixed address.
  const src = import.meta.env.DEV ? `/app/enhance/${page}.ts` : `/enhance/${page}.js`;
  return <script type="module" src={src} />;
}
