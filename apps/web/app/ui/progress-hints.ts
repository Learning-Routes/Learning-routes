import { useEffect } from "react";
import { useNavigation } from "react-router";

// Waiting, shown (Platform STEP 9 §6): a button says it is working while its request runs, and the
// header's route mark pulses when a page takes a moment to come. Without a script nothing waits
// silently either: the browser shows its own progress.

/** How long a page may take before the mark starts to pulse. */
const PATIENCE_MS = 250;

const isPlainClick = (event: MouseEvent) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

export function useProgressHints() {
  const navigation = useNavigation();
  useEffect(() => {
    let timer: number | undefined;
    const settle = () => {
      window.clearTimeout(timer);
      document.documentElement.classList.remove("navigating");
      for (const button of document.querySelectorAll("[data-submitting]")) {
        button.removeAttribute("aria-busy");
        button.removeAttribute("data-submitting");
      }
    };
    const submitted = (event: SubmitEvent) => {
      if (!event.defaultPrevented && event.submitter) {
        event.submitter.setAttribute("aria-busy", "true");
        event.submitter.setAttribute("data-submitting", "");
      }
    };
    const clicked = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (
        !(link instanceof HTMLAnchorElement) ||
        event.defaultPrevented ||
        !isPlainClick(event) ||
        link.target ||
        link.hasAttribute("download") ||
        (link.pathname === location.pathname && link.search === location.search)
      ) {
        return;
      }
      timer = window.setTimeout(
        () => document.documentElement.classList.add("navigating"),
        PATIENCE_MS,
      );
    };
    addEventListener("submit", submitted);
    addEventListener("click", clicked);
    // Coming back through the history cache shows the page as it was left.
    addEventListener("pageshow", settle);
    return () => {
      removeEventListener("submit", submitted);
      removeEventListener("click", clicked);
      removeEventListener("pageshow", settle);
    };
  }, []);
  // A form the app sends itself ends without a new page: its button is done when the app is idle.
  useEffect(() => {
    if (navigation.state === "idle") {
      for (const button of document.querySelectorAll("[data-submitting]")) {
        button.removeAttribute("aria-busy");
        button.removeAttribute("data-submitting");
      }
    }
  }, [navigation.state]);
}
