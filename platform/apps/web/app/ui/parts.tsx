import type { ComponentProps, ReactNode } from "react";

// The small pieces of the design system (Platform STEP 3 §2.3).

export function TextLink({ className, ...link }: ComponentProps<"a">) {
  return <a {...link} className={`text-link ${className ?? ""}`.trim()} />;
}

/** A sheet with thickness, lit from above, like the sheets of the route map. */
export function Card({ className, ...card }: ComponentProps<"div">) {
  return <div {...card} className={`card ${className ?? ""}`.trim()} />;
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "accent";
  children: ReactNode;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Notice({
  tone,
  title,
  children,
}: {
  tone: "success" | "info" | "error";
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className={`notice notice-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <p className="notice-title">{title}</p>
      {children ? <div className="notice-body">{children}</div> : null}
    </div>
  );
}

/** An empty screen says what belongs here and offers the next step. */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <svg className="empty-state-mark" viewBox="0 0 64 24" aria-hidden="true">
        <path d="M6 12h52" />
        <circle cx="6" cy="12" r="5" />
        <circle cx="32" cy="12" r="5" />
        <circle cx="58" cy="12" r="5" />
      </svg>
      <p className="empty-state-title">{title}</p>
      {children ? <p className="empty-state-body">{children}</p> : null}
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}
