// The closing sheet (STEP 41 §2.3), with a new job: the field searches the catalog. An idea
// fills the field; focusing the field makes the figure's lines flow; asking draws the first
// module with the words on its chip, then the form goes where it was going anyway.
const DRAW_MS = 900;

export function enhanceClose(root: Element, signal: AbortSignal, reduceMotion: boolean) {
  const form = root.querySelector<HTMLFormElement>(".lp-ask");
  const field = root.querySelector<HTMLInputElement>(".lp-ask input");
  const figure = root.querySelector(".lp-plan");
  const chip = root.querySelector(".lp-c1 b");
  if (!(form && field && figure && chip)) {
    return;
  }
  for (const idea of root.querySelectorAll<HTMLAnchorElement>(".lp-ideas a")) {
    idea.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        field.value = idea.textContent?.trim() ?? "";
        field.focus();
      },
      { signal },
    );
  }
  field.addEventListener("focus", () => figure.classList.add("lp-wait"), { signal });
  field.addEventListener("blur", () => figure.classList.remove("lp-wait"), { signal });
  let hasDrawn = false;
  form.addEventListener(
    "submit",
    (event) => {
      const words = field.value.trim();
      if (hasDrawn || !words || reduceMotion) {
        hasDrawn = false; // back from the results, a new search draws again
        return;
      }
      event.preventDefault();
      chip.textContent = words.charAt(0).toUpperCase() + words.slice(1);
      figure.classList.add("lp-drawn");
      hasDrawn = true;
      setTimeout(() => form.requestSubmit(), DRAW_MS);
    },
    { signal },
  );
}
