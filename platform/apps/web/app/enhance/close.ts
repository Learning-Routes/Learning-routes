// The closing sheet (STEP 41 §2.3), with a new job: the field searches the catalog. An idea
// fills the field; focusing the field makes the figure's lines flow; asking draws the first
// module with the words on its chip, then the form goes where it was going anyway.
const DRAW_MS = 900;

export function enhanceClose(root: Element, reduceMotion: boolean) {
  const form = root.querySelector<HTMLFormElement>(".lp-ask");
  const field = root.querySelector<HTMLInputElement>(".lp-ask input");
  const figure = root.querySelector(".lp-plan");
  const chip = root.querySelector(".lp-c1 b");
  if (!(form && field && figure && chip)) {
    return;
  }
  for (const idea of root.querySelectorAll<HTMLAnchorElement>(".lp-ideas a")) {
    idea.addEventListener("click", (event) => {
      // A modified click still opens the search, in another tab.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      field.value = new URL(idea.href).searchParams.get("q") ?? "";
      field.focus();
    });
  }
  field.addEventListener("focus", () => figure.classList.add("lp-wait"));
  field.addEventListener("blur", () => figure.classList.remove("lp-wait"));
  const chipWords = chip.textContent;
  let timer = 0;
  let isDrawing = false;
  form.addEventListener("submit", (event) => {
    const words = field.value.trim();
    if (reduceMotion || !words) {
      return;
    }
    if (isDrawing) {
      // The drawing's own submit, or a second Enter: it goes now, and only once.
      clearTimeout(timer);
      return;
    }
    event.preventDefault();
    isDrawing = true;
    chip.textContent = words.charAt(0).toUpperCase() + words.slice(1);
    figure.classList.add("lp-drawn");
    timer = window.setTimeout(() => form.requestSubmit(), DRAW_MS);
  });
  // Back from the results, the sheet is fresh and a new search draws again.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      clearTimeout(timer);
      isDrawing = false;
      chip.textContent = chipWords;
      figure.classList.remove("lp-drawn");
    }
  });
}
