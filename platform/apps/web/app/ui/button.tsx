import type { ComponentProps, ReactNode } from "react";

type Shared = {
  /** How much the action stands out: one primary per view. */
  emphasis?: "primary" | "secondary" | "quiet";
  size?: "regular" | "small";
  children: ReactNode;
};
type AsButton = Shared & { loading?: boolean; loadingLabel?: string } & ComponentProps<"button">;
type AsLink = Shared & { href: string } & ComponentProps<"a">;

const classes = (emphasis: string, size: string, extra = "") =>
  `button button-${emphasis} button-${size} ${extra}`.trim();

/** A link that looks like an action: use it when the action is going somewhere. */
export function ButtonLink({
  emphasis = "primary",
  size = "regular",
  className,
  children,
  ...link
}: AsLink) {
  return (
    <a {...link} className={classes(emphasis, size, className)}>
      {children}
    </a>
  );
}

export function Button({
  emphasis = "primary",
  size = "regular",
  loading = false,
  loadingLabel,
  disabled,
  type = "button",
  className,
  children,
  ...button
}: AsButton) {
  return (
    <button
      {...button}
      type={type}
      className={classes(emphasis, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {/* The label keeps its place while loading, so the button never changes size. */}
      <span className="button-label">{children}</span>
      {loading ? (
        <span className="button-spinner" role="status" aria-label={loadingLabel}>
          <span className="spinner" />
        </span>
      ) : null}
    </button>
  );
}
