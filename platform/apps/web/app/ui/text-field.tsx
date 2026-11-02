import { type ComponentProps, useId } from "react";

type Props = ComponentProps<"input"> & {
  label: string;
  /** What the field wants, shown under it until there is an error. */
  hint?: string;
  error?: string;
};

export function TextField({ label, hint, error, type = "text", className, ...input }: Props) {
  const id = useId();
  const note = error ?? hint;
  return (
    <div className={`field ${className ?? ""}`.trim()} data-invalid={error ? "true" : undefined}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        {...input}
        id={id}
        type={type}
        className="field-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? `${id}-note` : undefined}
      />
      {/* The line is always there, so an error appearing moves nothing under it. */}
      <p id={`${id}-note`} className={error ? "field-error" : "field-hint"}>
        {note ?? " "}
      </p>
    </div>
  );
}
