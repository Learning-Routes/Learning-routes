import { Form, useLocation } from "react-router";

/**
 * Both buttons are always in the page and the stylesheet shows the one that fits the
 * current theme, so this works with no script and with no choice made. App only: a
 * storefront follows the system (Platform STEP 3 §2.4).
 */
export function ThemeToggle({ toDark, toLight }: { toDark: string; toLight: string }) {
  const { pathname, search } = useLocation();
  return (
    <Form className="theme-toggle" method="post" action="/theme" reloadDocument>
      <input type="hidden" name="next" value={`${pathname}${search}`} />
      <button
        className="theme-button theme-to-dark"
        type="submit"
        name="theme"
        value="dark"
        aria-label={toDark}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        </svg>
      </button>
      <button
        className="theme-button theme-to-light"
        type="submit"
        name="theme"
        value="light"
        aria-label={toLight}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      </button>
    </Form>
  );
}
