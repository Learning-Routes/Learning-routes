import { FLEX_ALIGN, FLEX_JUSTIFY } from "@learning-routes/core/blocks/sim-numbers";
import { useEffect, useState } from "react";
import { obj } from "../shared";
import type { SimProps } from "./index";

// Flexbox: pick justify-content and align-items, see the boxes move, read the CSS you wrote.

function Choice({
  name,
  values,
  value,
  onChange,
}: {
  name: string;
  values: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <fieldset className="s-segment">
      <legend className="p-label">{name}</legend>
      <div>
        {values.map((v) => (
          <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>
            {v}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function Flex({ setState, result }: SimProps) {
  const [justify, setJustify] = useState<string>("flex-start");
  const [align, setAlign] = useState<string>("flex-start");
  const target = obj(obj(result?.solution).target);

  useEffect(() => {
    setState({ justify, align });
  }, [justify, align, setState]);

  return (
    <div className="s-flex">
      <div className="s-flex-stage">
        {target.justify ? (
          <div
            className="s-flex-box s-flex-ghost"
            style={{ justifyContent: String(target.justify), alignItems: String(target.align) }}
            aria-hidden="true"
          >
            <i />
            <i />
            <i />
          </div>
        ) : null}
        <div className="s-flex-box" style={{ justifyContent: justify, alignItems: align }}>
          <i />
          <i />
          <i />
        </div>
      </div>
      <pre className="s-css">
        <code>
          {".box {\n  display: flex;\n  justify-content: "}
          <b>{justify}</b>
          {";\n  align-items: "}
          <b>{align}</b>
          {";\n}"}
        </code>
      </pre>
      <Choice name="justify-content" values={FLEX_JUSTIFY} value={justify} onChange={setJustify} />
      <Choice name="align-items" values={FLEX_ALIGN} value={align} onChange={setAlign} />
    </div>
  );
}
