import { useEffect, useState } from "react";
import { download, get, post } from "../../api";
import { useProjectApi, useSession } from "../../session";
import { Badge, ErrorAlert, PageHead, useAsync } from "../../components/ui";
import { fmtDateTime } from "../../format";

const SHEETS = ["LEIA_ME", "Metadados", "Dicionario", "Locais", "Estruturas", "Culturas", "Ciclos", "Registos_Campo", "Colheitas", "Consumos", "Trabalho", "Ativos", "Despesas", "Reparticoes", "Vendas", "Taxas_Cambio", "Indicadores", "Formulas", "Referencias"];
const JOB: Record<string, string> = { pending: "Pendente", running: "A processar", succeeded: "Concluída", failed: "Falhou", cancelled: "Cancelada" };

function AcademicDocument({ onQueued }: { onQueued: () => void }) {
  const base = useProjectApi();
  const pubs = useAsync(() => get<any[]>(`${base}/publications`), [base]);
  const [source, setSource] = useState<"draft" | "publication">("draft");
  const [pubNumber, setPubNumber] = useState<number | null>(null);
  const [format, setFormat] = useState<"docx" | "pdf">("docx");
  const [titlePage, setTitlePage] = useState(true);
  const [toc, setToc] = useState(true);
  const [numberHeadings, setNumberHeadings] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const active = (pubs.data ?? []).filter((p) => !p.withdrawn_at);
  return (
    <section className="card stack">
      <h2>Documento académico (Word / PDF)</h2>
      <p className="muted">
        Perfil APA 7 de estudante: A4, margens 2,54 cm, espaçamento duplo, recuo 1,27 cm, títulos APA de nível 1–5, citações e bibliografia do escopo. O sumário é um
        campo do Word (atualizar campos ao abrir); no PDF é preenchido automaticamente. O perfil institucional pode alterar estas regras quando for configurado.
      </p>
      <ErrorAlert error={error} />
      <div className="row">
        <label className="check">
          <input type="radio" checked={source === "draft"} onChange={() => setSource("draft")} /> Rascunho atual (secções com texto)
        </label>
        <label className="check">
          <input type="radio" checked={source === "publication"} onChange={() => setSource("publication")} disabled={!active.length} /> Versão publicada
        </label>
        {source === "publication" && (
          <select aria-label="Versão publicada" value={pubNumber ?? ""} onChange={(e) => setPubNumber(Number(e.target.value) || null)} style={{ maxWidth: 200 }}>
            <option value="">— escolher —</option>
            {active.map((p) => (
              <option key={p.id} value={p.number}>
                {p.label}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="row">
        <label className="check">
          <input type="radio" checked={format === "docx"} onChange={() => setFormat("docx")} /> Word (.docx)
        </label>
        <label className="check">
          <input type="radio" checked={format === "pdf"} onChange={() => setFormat("pdf")} /> PDF (requer LibreOffice no servidor)
        </label>
      </div>
      <div className="row">
        <label className="check">
          <input type="checkbox" checked={titlePage} onChange={(e) => setTitlePage(e.target.checked)} /> Página de título
        </label>
        <label className="check">
          <input type="checkbox" checked={toc} onChange={(e) => setToc(e.target.checked)} /> Índice
        </label>
        <label className="check">
          <input type="checkbox" checked={numberHeadings} onChange={(e) => setNumberHeadings(e.target.checked)} /> Numerar capítulos (opção institucional)
        </label>
      </div>
      <div>
        <button
          className="btn btn-primary"
          disabled={source === "publication" && !pubNumber}
          onClick={() =>
            void post(
              `${base}/exports/document`,
              { source, publicationNumber: pubNumber ?? undefined, format, titlePage, toc, numberHeadings },
              { "Idempotency-Key": crypto.randomUUID() },
            ).then(onQueued, (e) => setError(e.message))
          }
        >
          Gerar {format.toUpperCase()}
        </button>
      </div>
    </section>
  );
}

export function ExportsPage() {
  const base = useProjectApi();
  const { canWrite } = useSession();
  const cycles = useAsync(() => get<{ rows: any[] }>(`${base}/e/cycle`), [base]);
  const jobs = useAsync(() => get<any[]>(`${base}/jobs`), [base]);
  const [scope, setScope] = useState<"all" | "cycles">("all");
  const [cycleIds, setCycleIds] = useState<string[]>([]);
  const [sheets, setSheets] = useState<string[]>(SHEETS);
  const [mode, setMode] = useState<"values" | "formulas" | "both">("both");
  const [includePrivate, setIncludePrivate] = useState(false);
  const [template, setTemplate] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const options = () => ({ ...(scope === "cycles" && !template ? { cycleIds } : {}), sheets, mode, includePrivate, template });

  useEffect(() => setPreview(null), [scope, cycleIds, sheets, mode, includePrivate, template]);
  useEffect(() => {
    if (!(jobs.data ?? []).some((j) => j.status === "pending" || j.status === "running")) return;
    const t = setTimeout(() => void jobs.reload(), 1500);
    return () => clearTimeout(t);
  }, [jobs.data]);

  return (
    <>
      <PageHead title="Exportações" intro="Ficheiros .xlsx reais: números como números, datas como datas, IDs como texto, células vazias = não registado. Fórmulas reais do Excel recalculam os indicadores a partir das folhas." />
      <ErrorAlert error={error} />
      <div className="grid grid-2">
        <section className="card stack">
          <h2>1. Escopo</h2>
          <label className="check">
            <input type="radio" checked={!template && scope === "all"} onChange={() => { setTemplate(false); setScope("all"); }} /> Toda a investigação autorizada
          </label>
          <label className="check">
            <input type="radio" checked={!template && scope === "cycles"} onChange={() => { setTemplate(false); setScope("cycles"); }} /> Ciclos selecionados
          </label>
          {scope === "cycles" && !template && (
            <div className="row">
              {(cycles.data?.rows ?? []).map((c) => (
                <label key={c.id} className="check">
                  <input type="checkbox" checked={cycleIds.includes(c.id)} onChange={(e) => setCycleIds(e.target.checked ? [...cycleIds, c.id] : cycleIds.filter((x) => x !== c.id))} /> {c.code}
                </label>
              ))}
            </div>
          )}
          <label className="check">
            <input type="radio" checked={template} onChange={() => setTemplate(true)} /> Modelo vazio para recolha offline
          </label>
          <h2>2. Conteúdo</h2>
          <label className="check">
            <input type="radio" checked={mode === "values"} onChange={() => setMode("values")} /> Valores para análise
          </label>
          <label className="check">
            <input type="radio" checked={mode === "formulas"} onChange={() => setMode("formulas")} /> Resultados com fórmulas
          </label>
          <label className="check">
            <input type="radio" checked={mode === "both"} onChange={() => setMode("both")} /> Ambos (valor do sistema + fórmula + diferença)
          </label>
          <label className="check">
            <input type="checkbox" checked={includePrivate} onChange={(e) => setIncludePrivate(e.target.checked)} /> Incluir campos privados (fornecedores, coordenadas, contactos)
          </label>
          <details>
            <summary>Folhas ({sheets.length})</summary>
            <div className="row" style={{ marginTop: 6 }}>
              {SHEETS.map((s) => (
                <label key={s} className="check">
                  <input type="checkbox" checked={sheets.includes(s)} onChange={(e) => setSheets(e.target.checked ? SHEETS.filter((x) => x === s || sheets.includes(x)) : sheets.filter((x) => x !== s))} /> {s}
                </label>
              ))}
            </div>
          </details>
        </section>
        <section className="card stack">
          <h2>3. Rever e gerar</h2>
          <button className="btn" disabled={!canWrite || (scope === "cycles" && !template && !cycleIds.length)} onClick={() => void post(`${base}/exports/xlsx/preview`, options()).then(setPreview, (e) => setError(e.message))}>
            Ver escopo antes de gerar
          </button>
          {preview && (
            <>
              <p>
                <strong>{preview.scope}</strong> · dados privados {preview.includePrivate ? "incluídos" : "excluídos"} · cálculo {preview.formulaVersion}
              </p>
              <table className="data">
                <tbody>
                  {preview.sheets.map((s: any) => (
                    <tr key={s.name}>
                      <td>{s.name}</td>
                      <td className="num">{s.rows} linha(s)</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                className="btn btn-primary"
                onClick={() =>
                  void post(`${base}/exports/xlsx`, options(), { "Idempotency-Key": crypto.randomUUID() }).then(() => jobs.reload(), (e) => setError(e.message))
                }
              >
                Gerar XLSX
              </button>
            </>
          )}
        </section>
      </div>
      <AcademicDocument onQueued={() => void jobs.reload()} />
      <section className="card">
        <h2>Exportações recentes</h2>
        <p className="muted">Geradas em segundo plano; downloads autenticados, válidos durante 7 dias.</p>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Estado</th>
                <th>Resultado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(jobs.data ?? []).map((j) => (
                <tr key={j.id}>
                  <td>{fmtDateTime(j.created_at)}</td>
                  <td>
                    <Badge status={j.status} label={JOB[j.status] ?? j.status} />
                    {j.error && <div className="error">{j.error}</div>}
                  </td>
                  <td>{j.result ? `${j.result.fileName} · ${j.result.summary.scope}` : "—"}</td>
                  <td>
                    {j.result?.fileId && (
                      <button className="btn btn-small" onClick={() => void download(`${base}/files/${j.result.fileId}`, j.result.fileName).catch((e) => setError(e.message))}>
                        Descarregar
                      </button>
                    )}
                    {(j.status === "pending" || j.status === "running") && (
                      <button className="btn btn-small" onClick={() => void post(`${base}/jobs/${j.id}/cancel`).then(() => jobs.reload())}>
                        Cancelar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
