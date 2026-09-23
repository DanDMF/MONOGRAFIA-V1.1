import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ENTITIES, ORIGINS, type EntityDef, type EntityName } from "../../../shared/entities";
import { ApiError, download, get, patch, post, del } from "../../api";
import { useProjectApi, useSession } from "../../session";
import { Dialog, ErrorAlert, Loading, PageHead, useAsync } from "../../components/ui";
import { EntityForm, initialValues, toPayload, type RefOptions } from "../../components/EntityForm";
import { fmtDate, fmtDateTime, fmtNumber } from "../../format";

export const ENTITY_ROUTES: { slug: string; entity: EntityName; intro?: string }[] = [
  { slug: "protocolo", entity: "protocol_version", intro: "Versões imutáveis: uma alteração ao método cria nova versão, sem reescrever a anterior." },
  { slug: "variaveis", entity: "variable", intro: "Dicionário de variáveis com definição operacional, unidade, instrumento e intervalo plausível." },
  { slug: "locais", entity: "location", intro: "Coordenadas e morada exata são privadas; o site público usa apenas a designação genérica." },
  { slug: "estruturas", entity: "structure", intro: "Área de implantação, área de cultivo e área útil são denominadores distintos: não multiplicar a área agregada pelos níveis." },
  { slug: "culturas", entity: "crop" },
  { slug: "ciclos", entity: "cycle", intro: "Para ciclos simultâneos na mesma estrutura, indique a fração da área usada." },
  { slug: "registos", entity: "field_event", intro: "Cada registo guarda a data do acontecimento, a data de introdução e a origem do dado." },
  { slug: "colheitas", entity: "harvest", intro: "Campos vazios significam “não registado” e nunca zero. Colheita não gera receita realizada." },
  { slug: "consumos", entity: "consumption", intro: "Leituras de contadores, consumos diretos ou estimativas (potência × horas), identificados." },
  { slug: "trabalho", entity: "labor_entry", intro: "Trabalho pago e valorização do trabalho do autor ficam separados." },
  { slug: "despesas", entity: "expense", intro: "Saída de caixa, consumo de material e depreciação são distintos. Uma fatura real pode substituir uma estimativa." },
  { slug: "reparticoes", entity: "allocation", intro: "Afetação de despesas a ciclos por critério explícito. A soma por despesa não pode exceder 100%." },
  { slug: "ativos", entity: "asset", intro: "Aquisição e depreciação nunca são somadas no mesmo resultado." },
  { slug: "vendas", entity: "sale", intro: "Não converter maços em kg sem fator medido ou pressuposto identificado." },
  { slug: "cambio", entity: "exchange_rate", intro: "Sem conversões silenciosas: cada taxa tem data e fonte." },
  { slug: "excertos", entity: "excerpt", intro: "Excerto literal, paráfrase e comentário do autor são separados. A página impressa é distinta da página do ficheiro PDF." },
  { slug: "comunicacoes", entity: "personal_communication", intro: "Citadas no texto e excluídas da lista de referências. Contactos nunca são publicados." },
];

type Row = Record<string, any>;

function refTarget(def: EntityDef, field: string): string | null {
  const f = def.fields[field];
  return f?.kind === "ref" ? (f.ref ?? null) : null;
}

function describe(def: EntityDef, r: Row) {
  return def.display.map((k) => {
    const f = def.fields[k];
    const v = r[k];
    if (f?.kind === "enum") return f.values?.[v] ?? v;
    if (f?.kind === "date") return fmtDate(v);
    if (f?.kind === "decimal") return fmtNumber(v, 4);
    return v;
  }).filter((x) => x !== null && x !== undefined && x !== "").join(" · ") || r.id.slice(0, 8);
}

export function EntityPage({ entity }: { entity: EntityName }) {
  const def = ENTITIES[entity];
  const base = useProjectApi();
  const { canWrite } = useSession();
  const route = ENTITY_ROUTES.find((r) => r.entity === entity);
  const [params, setParams] = useSearchParams();
  const [showArchived, setShowArchived] = useState(false);
  const [filter, setFilter] = useState("");
  const [refFilter, setRefFilter] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Row | "new" | null>(null);

  const list = useAsync(
    () => get<{ rows: Row[]; total: number }>(`${base}/e/${entity}?archived=${showArchived}`),
    [base, entity, showArchived],
  );
  // Opções dos campos de referência (e rótulos na tabela)
  const refs = useAsync(async () => {
    const out: RefOptions = {};
    for (const [k, f] of Object.entries(def.fields)) {
      if (f.kind !== "ref" || !f.ref) continue;
      if (f.ref === "reference") {
        const refsList = await get<Row[]>(`${base}/references`);
        out[k] = refsList.map((r) => ({
          id: r.id,
          label: `${r.contributors?.[0]?.family ?? r.contributors?.[0]?.literal ?? "s/ autor"} (${r.issued_year ?? "s.d."}) — ${r.title}`.slice(0, 120),
        }));
      } else {
        const td = ENTITIES[f.ref];
        const { rows } = await get<{ rows: Row[] }>(`${base}/e/${f.ref}`);
        out[k] = rows.map((r) => ({ id: r.id, label: describe(td, r) }));
      }
    }
    return out;
  }, [base, entity]);

  useEffect(() => {
    if (params.get("novo") === "1" && canWrite) {
      setEditing("new");
      params.delete("novo");
      setParams(params, { replace: true });
    }
  }, [params, setParams, canWrite]);

  const refLabel = (field: string, id: string | null) => (id ? (refs.data?.[field]?.find((o) => o.id === id)?.label ?? id.slice(0, 8)) : "—");

  const columns = useMemo(
    () =>
      Object.entries(def.fields)
        .filter(([, f]) => f.kind !== "longtext")
        .slice(0, 9),
    [def],
  );

  const rows = useMemo(() => {
    let r = list.data?.rows ?? [];
    for (const [k, v] of Object.entries(refFilter)) if (v) r = r.filter((x) => x[k] === v);
    if (filter.trim()) {
      const q = filter.toLowerCase();
      r = r.filter((x) => columns.some(([k, f]) => String(f.kind === "ref" ? refLabel(k, x[k]) : (x[k] ?? "")).toLowerCase().includes(q)));
    }
    if (sort) {
      const f = def.fields[sort.key];
      r = [...r].sort((a, b) => {
        const va = a[sort.key];
        const vb = b[sort.key];
        if (va === null || va === undefined) return 1;
        if (vb === null || vb === undefined) return -1;
        if (f?.kind === "decimal" || f?.kind === "int") return (Number(va) - Number(vb)) * sort.dir;
        return String(va).localeCompare(String(vb), "pt") * sort.dir;
      });
    }
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data, filter, sort, refFilter, refs.data]);

  const cell = (k: string, r: Row) => {
    const f = def.fields[k]!;
    const v = r[k];
    if (v === null || v === undefined || v === "") return <span className="empty">—</span>;
    switch (f.kind) {
      case "ref":
        return refLabel(k, v);
      case "enum":
        return f.values?.[v] ?? v;
      case "bool":
        return v ? "Sim" : "Não";
      case "date":
        return fmtDate(v);
      case "decimal":
        return k === "share" || k === "area_fraction" ? `${fmtNumber(Number(v) * 100, 2)}%` : fmtNumber(v, 4);
      default:
        return String(v);
    }
  };

  const refFilterFields = Object.entries(def.fields).filter(([, f]) => f.kind === "ref" && f.ref !== "reference").slice(0, 2);

  return (
    <>
      <PageHead title={def.labelPlural} intro={route?.intro}>
        {canWrite && (
          <button className="btn btn-primary" onClick={() => setEditing("new")}>
            + Novo registo
          </button>
        )}
        <button
          className="btn"
          onClick={() =>
            void download(`${base}/exports/csv/${entity}`, `${def.labelPlural}.csv`, "POST", {
              ids: selected.size ? [...selected] : rows.map((r) => r.id),
            }).catch((e) => alert(e.message))
          }
          disabled={!canWrite}
          title="CSV compatível com Excel PT (;), protegido contra fórmulas"
        >
          Exportar CSV ({selected.size || rows.length})
        </button>
      </PageHead>
      <div className="row" style={{ marginBottom: "0.75rem" }}>
        <input
          type="search"
          placeholder="Filtrar…"
          aria-label="Filtrar registos"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ maxWidth: 260 }}
        />
        {refFilterFields.map(([k, f]) => (
          <select
            key={k}
            aria-label={`Filtrar por ${f.label}`}
            style={{ maxWidth: 220 }}
            value={refFilter[k] ?? ""}
            onChange={(e) => setRefFilter({ ...refFilter, [k]: e.target.value })}
          >
            <option value="">{f.label}: todos</option>
            {(refs.data?.[k] ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        ))}
        <label className="check">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Mostrar arquivados
        </label>
        <span className="muted">
          {rows.length} de {list.data?.total ?? 0} registos
        </span>
      </div>
      <ErrorAlert error={list.error ?? refs.error} />
      {list.loading && !list.data ? (
        <Loading />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Selecionar todos"
                    checked={rows.length > 0 && selected.size === rows.length}
                    onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                  />
                </th>
                {columns.map(([k, f]) => (
                  <th key={k} className={f.kind === "decimal" || f.kind === "int" ? "num" : ""} aria-sort={sort?.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                    <button className="btn-link" style={{ color: "inherit", textDecoration: "none", fontWeight: 600 }} onClick={() => setSort({ key: k, dir: sort?.key === k && sort.dir === 1 ? -1 : 1 })}>
                      {f.label}
                      {f.unit ? ` (${f.unit})` : ""} {sort?.key === k ? (sort.dir === 1 ? "▲" : "▼") : ""}
                    </button>
                  </th>
                ))}
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 2} className="empty">
                    Sem registos. {canWrite ? "Use “+ Novo registo” para introduzir dados reais." : ""}
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label="Selecionar registo"
                      checked={selected.has(r.id)}
                      onChange={(e) => {
                        const s = new Set(selected);
                        if (e.target.checked) s.add(r.id);
                        else s.delete(r.id);
                        setSelected(s);
                      }}
                    />
                  </td>
                  {columns.map(([k, f], i) => (
                    <td key={k} className={f.kind === "decimal" || f.kind === "int" ? "num" : ""}>
                      {i === 0 ? (
                        <button className="btn-link" onClick={() => setEditing(r)}>
                          {cell(k, r)}
                        </button>
                      ) : (
                        cell(k, r)
                      )}
                    </td>
                  ))}
                  <td>
                    {r.archived_at ? <span className="badge">Arquivado</span> : r.origin ? <span className="badge">{ORIGINS[r.origin] ?? r.origin}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <EditDialog
          def={def}
          entity={entity}
          row={editing === "new" ? null : editing}
          refs={refs.data ?? {}}
          canWrite={canWrite}
          onClose={(changed) => {
            setEditing(null);
            if (changed) void list.reload();
          }}
          onDuplicate={(r) => setEditing({ ...r, id: undefined, __duplicate: true })}
        />
      )}
    </>
  );
}

function EditDialog({
  def,
  entity,
  row,
  refs,
  canWrite,
  onClose,
  onDuplicate,
}: {
  def: EntityDef;
  entity: EntityName;
  row: Row | null;
  refs: RefOptions;
  canWrite: boolean;
  onClose: (changed: boolean) => void;
  onDuplicate: (r: Row) => void;
}) {
  const base = useProjectApi();
  const isNew = !row || !row.id;
  const [values, setValues] = useState(() => initialValues(def, row && !row.__duplicate ? row : row ? { ...row } : null));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"form" | "history" | "impact">("form");
  const history = useAsync(async () => (!isNew && tab === "history" ? get<Row[]>(`${base}/e/${entity}/${row!.id}/history`) : []), [tab]);
  const impact = useAsync(async () => (!isNew && tab === "impact" ? get<Row>(`${base}/e/${entity}/${row!.id}/dependents`) : null), [tab]);
  const readOnly = !canWrite || (!isNew && def.immutable);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (isNew) await post(`${base}/e/${entity}`, toPayload(def, values));
      else await patch(`${base}/e/${entity}/${row!.id}`, { version: row!.version, ...toPayload(def, values, initialValues(def, row)) });
      onClose(true);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409 && e.details?.current ? `${e.message}` : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const archive = async (archived: boolean) => {
    if (!confirm(archived ? "Arquivar este registo? Deixa de entrar nos cálculos, mas o histórico mantém-se." : "Restaurar este registo?")) return;
    try {
      if (entity === "allocation") await del(`${base}/e/allocation/${row!.id}`);
      else await post(`${base}/e/${entity}/${row!.id}/archive`, { archived });
      onClose(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Dialog
      open
      title={isNew ? `Novo registo — ${def.label}` : `${def.label}: ${describe(def, row!)}`}
      onClose={() => onClose(false)}
      footer={
        <>
          {!isNew && canWrite && (
            <>
              <button className="btn btn-danger" onClick={() => void archive(!row!.archived_at)}>
                {entity === "allocation" ? "Remover repartição" : row!.archived_at ? "Restaurar" : "Arquivar"}
              </button>
              <button className="btn" onClick={() => onDuplicate(row!)} title="Duplica os valores do formulário; é criado um novo ID">
                Duplicar
              </button>
            </>
          )}
          <span className="spacer" />
          <button className="btn" onClick={() => onClose(false)}>
            Cancelar
          </button>
          {!readOnly && (
            <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>
              {busy ? "A gravar…" : "Gravar"}
            </button>
          )}
        </>
      }
    >
      {!isNew && (
        <div className="row" role="tablist" style={{ marginBottom: "0.75rem" }}>
          {(["form", "history", "impact"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={`btn btn-small ${tab === t ? "btn-primary" : ""}`} onClick={() => setTab(t)}>
              {t === "form" ? "Dados" : t === "history" ? "Histórico" : "Onde é utilizado"}
            </button>
          ))}
          <span className="muted mono">ID {row!.id}</span>
        </div>
      )}
      <ErrorAlert error={error} />
      {def.immutable && !isNew && <div className="alert warn">Registo imutável. Para alterar, crie uma nova versão.</div>}
      {tab === "form" && (
        <fieldset disabled={readOnly} style={{ border: "none", padding: 0, margin: 0 }}>
          <EntityForm def={def} values={values} setValues={setValues} refs={refs} />
        </fieldset>
      )}
      {tab === "history" &&
        (history.loading ? (
          <Loading />
        ) : (
          <ul className="stack" style={{ paddingLeft: "1rem" }}>
            {(history.data ?? []).map((h) => (
              <li key={h.id}>
                <strong>{h.action}</strong> · {fmtDateTime(h.created_at)} · {h.user_name ?? "sistema"}
                {h.before && h.after && (
                  <ul>
                    {Object.keys(def.fields)
                      .filter((k) => JSON.stringify(h.before[k]) !== JSON.stringify(h.after[k]))
                      .map((k) => (
                        <li key={k}>
                          {def.fields[k]!.label}: <del>{String(h.before[k] ?? "—")}</del> → <ins>{String(h.after[k] ?? "—")}</ins>
                        </li>
                      ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        ))}
      {tab === "impact" &&
        (impact.loading || !impact.data ? (
          <Loading />
        ) : (
          <div className="stack">
            <p>
              <strong>Ciclos afetados:</strong> {impact.data.cycles.length ? impact.data.cycles.map((c: Row) => c.code).join(", ") : "nenhum"}
            </p>
            <p>
              <strong>Indicadores recalculados automaticamente (rascunho):</strong>{" "}
              {impact.data.indicators.length ? impact.data.indicators.join(", ") : "nenhum"}
            </p>
            {impact.data.publications.length > 0 && (
              <div className="alert warn">
                Publicações com indicadores:{" "}
                {impact.data.publications.map((p: Row) => `${p.label}${p.possiblyOutdated ? " (possivelmente desatualizada)" : ""}`).join(", ")}. {impact.data.publications[0].note}
              </div>
            )}
          </div>
        ))}
    </Dialog>
  );
}
