// The tokens' dark block keys on html[data-theme="dark"]; set it from the system
// preference before the first paint. A file, not inline, so the strict CSP allows it.
document.documentElement.dataset.theme = matchMedia("(prefers-color-scheme: dark)").matches
  ? "dark"
  : "light";
