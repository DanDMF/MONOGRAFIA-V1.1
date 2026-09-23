// Formatação de apresentação (a base guarda tipos normalizados; arredondamento só aqui).
export const fmtNumber = (v: string | number | null | undefined, digits = 2) => {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-PT", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
};
export const fmtDate = (v: string | null | undefined) => {
  if (!v) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split("-");
    return `${d}/${m}/${y}`;
  }
  return new Date(v).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" });
};
export const fmtDateTime = (v: string | null | undefined) => (v ? new Date(v).toLocaleString("pt-PT", { dateStyle: "medium", timeStyle: "short" }) : "—");
