// Asks for WebGL off the main thread: a device's first context can block for seconds. Without a
// real GPU the map would crawl and block the page, so that answers no, unless the page asks anyway.
const SOFTWARE = /swiftshader|llvmpipe|software/i;

function hasUsableWebGL(): boolean {
  const canvas = new OffscreenCanvas(1, 1);
  const options = { failIfMajorPerformanceCaveat: self.name !== "any-gpu" };
  const context = canvas.getContext("webgl2", options) ?? canvas.getContext("webgl", options);
  if (!context) {
    return false;
  }
  const info = context.getExtension("WEBGL_debug_renderer_info");
  const renderer = info ? String(context.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
  context.getExtension("WEBGL_lose_context")?.loseContext();
  return self.name === "any-gpu" || !SOFTWARE.test(renderer);
}

postMessage(hasUsableWebGL());
