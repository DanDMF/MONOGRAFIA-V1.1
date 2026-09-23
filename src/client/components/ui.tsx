import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError } from "../api";

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const d = await fn();
      if (my === seq.current) setData(d);
    } catch (e) {
      if (my === seq.current) setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      if (my === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, loading, reload, setData };
}

export function ErrorAlert({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return (
    <div className="alert error" role="alert">
      {error}
    </div>
  );
}

export function Loading({ what = "a carregar" }: { what?: string }) {
  return (
    <p className="muted" role="status" aria-live="polite">
      {what.charAt(0).toUpperCase() + what.slice(1)}…
    </p>
  );
}

export function PageHead({ title, intro, children }: { title: string; intro?: ReactNode; children?: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · VRBAN`;
  }, [title]);
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {intro && <p>{intro}</p>}
      </div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}

export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="dlg-title">
      {open && (
        <>
          <div className="dlg-head">
            <h2 id="dlg-title">{title}</h2>
            <button type="button" className="btn btn-small" onClick={onClose} aria-label="Fechar">
              ✕
            </button>
          </div>
          <div className="dlg-body">{children}</div>
          {footer && <div className="dlg-foot">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

const STATUS_CLASS: Record<string, string> = {
  ok: "ok",
  ready: "ok",
  published: "ok",
  succeeded: "ok",
  checked_at_source: "ok",
  partial: "warn",
  drafting: "earth",
  in_review: "earth",
  needs_source: "warn",
  unverified: "warn",
  insufficient_data: "warn",
  zero_denominator: "warn",
  mixed_currency: "warn",
  non_positive: "warn",
  running: "earth",
  pending: "earth",
  failed: "danger",
  cancelled: "",
};

export function Badge({ status, label }: { status: string; label: string }) {
  return <span className={`badge ${STATUS_CLASS[status] ?? ""}`}>{label}</span>;
}

export const INDICATOR_STATUS: Record<string, string> = {
  ok: "Calculado",
  partial: "Parcial (dados incompletos)",
  insufficient_data: "Dados insuficientes",
  zero_denominator: "Denominador zero",
  mixed_currency: "Moedas mistas",
  non_positive: "Margem não positiva",
  not_applicable: "Não aplicável",
};

export function Field({ label, hint, error, children, id }: { label: string; hint?: string; error?: string; children: ReactNode; id?: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
      {error && <span className="error">{error}</span>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted">{children}</p>;
}
