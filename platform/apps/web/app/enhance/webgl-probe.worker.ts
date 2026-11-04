import { probe } from "./three-gate";

// Asks for WebGL off the main thread: a device's first context can block for seconds. With no
// context it answers null, not no: some browsers have WebGL, only not in a worker.
const anyGpu = self.name === "any-gpu";
const canvas = new OffscreenCanvas(1, 1);
const options = { failIfMajorPerformanceCaveat: !anyGpu };
const context = canvas.getContext("webgl2", options) ?? canvas.getContext("webgl", options);
postMessage(context ? probe(context, anyGpu) : null);
