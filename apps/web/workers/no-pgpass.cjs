// pgpass in the web Worker's build (vite.config.ts): pg asks it for a password only when the
// connection has none. Hyperdrive's connection string always carries one, and a Worker has no
// ~/.pgpass to read, so this answers as pgpass does when it finds nothing.
module.exports = (_params, done) => done();
