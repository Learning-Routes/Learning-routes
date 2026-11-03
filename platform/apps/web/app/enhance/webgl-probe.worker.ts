// Asks for WebGL off the main thread: a device's first context can block for seconds. Without a
// real GPU the map would crawl and block the page, so that answers no, unless the page asks anyway.
const canvas = new OffscreenCanvas(1, 1);
const options = { failIfMajorPerformanceCaveat: self.name !== "any-gpu" };
const context = canvas.getContext("webgl2", options) ?? canvas.getContext("webgl", options);
context?.getExtension("WEBGL_lose_context")?.loseContext();
postMessage(context !== null);
