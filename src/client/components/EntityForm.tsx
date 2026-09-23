import { useState } from "react";
import type { EntityDef, FieldDef } from "../../shared/entities";

export type RefOptions = Record<string, { id: string; label: string }[]>;

/** Valor de formulário: string para tudo exceto bool; "" = ausente (enviado como null, nunca zero). */
export function initialValues(def: EntityDef, row?: Record<string, unknown> | null) {
  const v: Record<string, unknown> = {};
  for (const [k, f] of Object.entries(def.fields)) {
    const cur = row?.[k];
    if (f.kind === "bool") v[k] = cur ?? f.default ?? false;
    else v[k] = cur === null || cur === undefined ? (row ? "" : f.default !== undefined ? String(f.default) : "") : String(cur);
  }
  return v;
}

export function toPayload(def: EntityDef, values: Record<string, unknown>, onlyChanged?: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, f] of Object.entries(def.fields)) {
    let v = values[k];
    if (f.kind !== "bool" && typeof v === "string" && v.trim() === "") v = null;
    if (f.kind === "decimal" && typeof v === "string") v = v.replace(",", ".");
    if (onlyChanged && JSON.stringify(onlyChanged[k] ?? (f.kind === "bool" ? false : "")) === JSON.stringify(values[k])) continue;
    out[k] = v;
  }
  return out;
}

function FieldInput({ name, f, value, onChange, refs }: { name: string; f: FieldDef; value: unknown; onChange: (v: unknown) => void; refs: RefOptions }) {
  const id = `f-${name}`;
  const common = { id, name, "aria-describedby": f.description ? `${id}-hint` : undefined };
  let input;
  switch (f.kind) {
    case "longtext":
      input = <textarea {...common} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "bool":
      return (
        <div className="field">
          <label className="check">
            <input type="checkbox" {...common} checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {f.label}
          </label>
          {f.description && <span className="hint" id={`${id}-hint`}>{f.description}</span>}
        </div>
      );
    case "enum":
      input = (
        <select {...common} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} required={f.required}>
          {!f.required && <option value="">— não indicado —</option>}
          {Object.entries(f.values ?? {}).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      );
      break;
    case "ref":
      input = (
        <select {...common} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} required={f.required}>
          <option value="">{f.required ? "— escolher —" : "— nenhum —"}</option>
          {(refs[name] ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case "date":
      input = <input type="date" {...common} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} required={f.required} />;
      break;
    case "int":
      input = <input type="number" step="1" min={f.min} max={f.max} inputMode="numeric" {...common} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} required={f.required} />;
      break;
    case "decimal":
      input = (
        <input
          type="text"
          inputMode="decimal"
          pattern="-?[0-9]+([.,][0-9]+)?"
          {...common}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          required={f.required}
          placeholder={f.required ? "" : "vazio = não registado"}
        />
      );
      break;
    default:
      input = <input type="text" {...common} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} required={f.required} />;
  }
  return (
    <div className={`field ${f.kind === "longtext" ? "wide" : ""}`}>
      <label htmlFor={id}>
        {f.label}
        {f.unit ? ` (${f.unit})` : ""}
        {f.required ? " *" : ""}
        {f.private ? " · privado" : ""}
      </label>
      {input}
      {f.description && (
        <span className="hint" id={`${id}-hint`}>
          {f.description}
        </span>
      )}
    </div>
  );
}

export function EntityForm({
  def,
  values,
  setValues,
  refs,
}: {
  def: EntityDef;
  values: Record<string, unknown>;
  setValues: (v: Record<string, unknown>) => void;
  refs: RefOptions;
}) {
  return (
    <div className="form-grid">
      {Object.entries(def.fields).map(([k, f]) => (
        <FieldInput key={k} name={k} f={f} value={values[k]} refs={refs} onChange={(v) => setValues({ ...values, [k]: v })} />
      ))}
    </div>
  );
}

export function useFormState(def: EntityDef, row?: Record<string, unknown> | null) {
  return useState(() => initialValues(def, row));
}
