// pg-connection-string in the web Worker's build (vite.config.ts): pg parses a connection string
// only when given one, and the storefront connects with Hyperdrive's own fields
// (public-read/reads.ts). Should one ever be passed, it fails loudly instead of connecting elsewhere.
/** @type {(text: string) => never} */
function parse() {
  throw new Error("The web Worker connects with Hyperdrive's fields, not a connection string.");
}
module.exports = { parse };
