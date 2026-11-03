const XML_SPECIAL = /[<>&'"]/g;
const ESCAPED: Record<string, string> = {
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  "'": "&apos;",
  '"': "&quot;",
};

export function sitemapXml(urls: string[]): string {
  const entries = urls
    .map((url) => `<url><loc>${url.replace(XML_SPECIAL, (c) => ESCAPED[c] ?? c)}</loc></url>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`;
}
