import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, download, get, post, put } from "../../api";
import { useProjectApi, useSession } from "../../session";
import { Badge, Dialog, ErrorAlert, Loading, PageHead, useAsync } from "../../components/ui";

const TYPES: Record<string, string> = {
  article: "Artigo",
  book: "Livro",
  chapter: "Capítulo",
  report: "Relatório",
  thesis: "Dissertação/tese",
  webpage: "Página web",
  dataset: "Conjunto de dados",
  software: "Software",
  preprint: "Preprint",
  presentation: "Apresentação",
  video: "Vídeo",
  image: "Imagem",
  legal: "Documento normativo",
  other: "Outro",
};
const VERIF: Record<string, string> = { unverified: "Por confirmar", author_confirmed: "Confirmada pelo autor", checked_at_source: "Conferida na fonte" };
const READ: Record<string, string> = { to_read: "Por ler", reading: "A ler", read: "Lida", skimmed: "Consultada" };

type Contributor = { role: string; family?: string | null; given?: string | null; particle?: string | null; suffix?: string | null; literal?: string | null; abbreviation?: string | null };
type Ref = Record<string, any> & { id: string; contributors: Contributor[] };

const authorLine = (r: Ref) => {
  const a = r.contributors.filter((c) => c.role === "author");
  if (!a.length) return "Sem autor";
  const n = (c: Contributor) => c.literal ?? [c.particle, c.family].filter(Boolean).join(" ");
  return a.length > 2 ? `${n(a[0]!)} et al.` : a.map(n).join(" & ");
};

export function LibraryPage() {
  const base = useProjectApi();
  const { canWrite } = useSession();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Ref | "new" | null>(null);
  const list = useAsync(() => get<Ref[]>(`${base}/references${search ? `?search=${encodeURIComponent(search)}` : ""}`), [base, search]);
  const dups = useAsync(() => get<{ reason: string; ids: string[] }[]>(`${base}/references-duplicates`), [base, list.data]);
  const navigate = useNavigate();
  return (
    <>
      <PageHead title="Biblioteca bibliográfica" intro="Biblioteca consultada. As referências citadas no texto formam a lista final automaticamente (APA 7, CSL).">
        {canWrite && (
          <>
            <button className="btn btn-primary" onClick={() => setEditing("new")}>
              + Nova fonte
            </button>
            <Link className="btn" to="/app/bibliografia/importar">
              Importar
            </Link>
          </>
        )}
        <select
          aria-label="Exportar bibliografia"
          className="btn"
          value=""
          onChange={(e) => {
            const [format, scope] = e.target.value.split(":");
            if (!format) return;
            const ext = format === "bibtex" ? "bib" : format === "ris" ? "ris" : "json";
            void download(`${base}/references-export?format=${format}&scope=${scope}`, `referencias-${scope}.${ext}`).catch((err) => alert(err.message));
          }}
          style={{ width: "auto" }}
        >
          <option value="">Exportar…</option>
          <option value="bibtex:library">BibTeX — biblioteca</option>
          <option value="bibtex:cited">BibTeX — só citadas</option>
          <option value="ris:library">RIS — biblioteca</option>
          <option value="ris:cited">RIS — só citadas</option>
          <option value="csl-json:library">CSL-JSON — biblioteca</option>
          <option value="csl-json:cited">CSL-JSON — só citadas</option>
        </select>
      </PageHead>
      <input type="search" aria-label="Pesquisar por autor, título, tema ou ano" placeholder="Pesquisar autor, título, tema ou ano…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 420, marginBottom: "0.75rem" }} />
      {dups.data && dups.data.length > 0 && (
        <div className="alert warn">
          {dups.data.length} possível(is) duplicado(s):{" "}
          {dups.data.map((g, i) => (
            <span key={i}>
              {g.reason} ({g.ids.map((id) => list.data?.find((r) => r.id === id)?.title?.slice(0, 40) ?? id.slice(0, 8)).join(" / ")})
              {canWrite && <MergeButton ids={g.ids} onDone={() => void list.reload()} />}
              {i < dups.data!.length - 1 ? "; " : ""}
            </span>
          ))}
        </div>
      )}
      <ErrorAlert error={list.error} />
      {list.loading && !list.data ? (
        <Loading />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Autores</th>
                <th>Ano</th>
                <th>Título</th>
                <th>Tipo</th>
                <th className="num">Citações</th>
                <th>Verificação</th>
                <th>Leitura</th>
              </tr>
            </thead>
            <tbody>
              {(list.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="empty">
                    Biblioteca vazia. Adicione apenas fontes reais; exemplos do Guia APA nunca entram aqui.
                  </td>
                </tr>
              )}
              {(list.data ?? []).map((r) => (
                <tr key={r.id} onClick={() => navigate(`/app/bibliografia/${r.id}`)} style={{ cursor: "pointer" }}>
                  <td>{authorLine(r)}</td>
                  <td>{r.no_date ? "s.d." : (r.issued_year ?? "—")}</td>
                  <td>
                    <Link to={`/app/bibliografia/${r.id}`}>{r.title}</Link>
                  </td>
                  <td>{TYPES[r.type]}</td>
                  <td className="num">{r.citation_count}</td>
                  <td>
                    <Badge status={r.verification_status} label={VERIF[r.verification_status]!} />
                  </td>
                  <td>{READ[r.read_status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <ReferenceDialog
          reference={editing === "new" ? null : editing}
          onClose={(id) => {
            setEditing(null);
            if (id) navigate(`/app/bibliografia/${id}`);
          }}
        />
      )}
    </>
  );
}

function MergeButton({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const base = useProjectApi();
  const [preview, setPreview] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [keep, drop] = ids as [string, string];
  return (
    <>
      <button className="btn btn-small" style={{ marginLeft: 6 }} onClick={() => void post(`${base}/references-merge`, { keepId: keep, dropId: drop }).then(setPreview, (e) => setError(e.message))}>
        Rever fusão
      </button>
      {error && <span className="error"> {error}</span>}
      {preview && (
        <Dialog
          open
          title="Fundir referências duplicadas"
          onClose={() => setPreview(null)}
          footer={
            <>
              <button className="btn" onClick={() => setPreview(null)}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={() =>
                  void post(`${base}/references-merge`, { keepId: keep, dropId: drop, confirm: true }).then(() => {
                    setPreview(null);
                    onDone();
                  })
                }
              >
                Fundir e preservar citações
              </button>
            </>
          }
        >
          <p>
            Manter: <strong>{preview.keep.title}</strong> ({preview.keep.issued_year ?? "s.d."})
          </p>
          <p>
            Arquivar e redirecionar: <strong>{preview.drop.title}</strong> ({preview.drop.issued_year ?? "s.d."})
          </p>
          <p>
            Serão transferidas {preview.citationsToMove} citação(ões) e {preview.excerptsToMove} excerto(s). A referência arquivada não é apagada.
          </p>
        </Dialog>
      )}
    </>
  );
}

const TEXT_FIELDS: [string, string, string?][] = [
  ["title", "Título (grafia original)"],
  ["container_title", "Revista / livro / site"],
  ["volume", "Volume"],
  ["issue", "Número"],
  ["pages", "Páginas"],
  ["article_number", "Número de artigo"],
  ["edition", "Edição"],
  ["publisher", "Editora"],
  ["institution", "Instituição"],
  ["genre", "Descrição (ex.: Dissertação de mestrado)"],
  ["archive", "Repositório/base"],
  ["report_number", "Número do relatório"],
  ["version_label", "Versão"],
  ["medium", "Tipo/meio (ex.: Conjunto de dados)"],
  ["doi", "DOI", "Formato 10.xxxx/…; exportado como https://doi.org/…"],
  ["url", "URL"],
  ["isbn", "ISBN"],
  ["language", "Idioma"],
  ["license", "Licença"],
  ["metadata_source", "Origem dos metadados"],
];

export function ReferenceDialog({ reference, onClose }: { reference: Ref | null; onClose: (id?: string) => void }) {
  const base = useProjectApi();
  const [v, setV] = useState<Record<string, any>>(() =>
    reference
      ? { ...reference, tags: (reference.tags ?? []).join(", ") }
      : { type: "article", title: "", read_status: "to_read", verification_status: "unverified", metadata_source: "manual", tags: "" },
  );
  const [contrib, setContrib] = useState<Contributor[]>(reference?.contributors?.length ? reference.contributors : [{ role: "author", family: "", given: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, val: unknown) => setV({ ...v, [k]: val });
  const save = async () => {
    setBusy(true);
    setError(null);
    const payload: Record<string, unknown> = {};
    for (const [k] of TEXT_FIELDS) payload[k] = v[k] ?? null;
    Object.assign(payload, {
      type: v.type,
      issued_year: v.no_date ? null : v.issued_year || null,
      issued_month: v.issued_month || null,
      issued_day: v.issued_day || null,
      no_date: !!v.no_date,
      accessed_date: v.accessed_date || null,
      show_accessed: !!v.show_accessed,
      thesis_published: v.type === "thesis" ? v.thesis_published !== false : null,
      tags: String(v.tags ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      notes: v.notes ?? null,
      read_status: v.read_status,
      verification_status: v.verification_status,
      contributors: contrib
        .filter((c) => (c.family ?? "").trim() || (c.literal ?? "").trim())
        .map((c) => ({ role: c.role, family: c.family || null, given: c.given || null, particle: c.particle || null, suffix: c.suffix || null, literal: c.literal || null, abbreviation: c.abbreviation || null })),
    });
    try {
      const r = reference ? await put<Ref>(`${base}/references/${reference.id}`, { ...payload, version: reference.version }) : await post<Ref>(`${base}/references`, payload);
      onClose(r.id);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409 ? "Esta referência foi alterada noutra sessão. Feche e reabra para ver a versão atual." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const upd = (i: number, k: keyof Contributor, val: string) => setContrib(contrib.map((c, j) => (j === i ? { ...c, [k]: val } : c)));
  const moveC = (i: number, d: number) => {
    const a = [...contrib];
    const j = i + d;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j]!, a[i]!];
    setContrib(a);
  };
  return (
    <Dialog
      open
      title={reference ? "Editar fonte" : "Nova fonte"}
      onClose={() => onClose()}
      footer={
        <>
          <button className="btn" onClick={() => onClose()}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={busy || !v.title} onClick={() => void save()}>
            {busy ? "A gravar…" : "Gravar"}
          </button>
        </>
      }
    >
      <ErrorAlert error={error} />
      <p className="muted">Introduza apenas informação confirmada. Campos em falta não são inventados; a auditoria indica o que afeta a referência.</p>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="r-type">Tipo</label>
          <select id="r-type" value={v.type} onChange={(e) => set("type", e.target.value)}>
            {Object.entries(TYPES).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="r-year">Ano</label>
          <input id="r-year" inputMode="numeric" value={v.issued_year ?? ""} disabled={!!v.no_date} onChange={(e) => set("issued_year", e.target.value)} />
          <label className="check">
            <input type="checkbox" checked={!!v.no_date} onChange={(e) => set("no_date", e.target.checked)} /> Sem data (s.d.)
          </label>
        </div>
        <div className="field">
          <label htmlFor="r-month">Mês / dia (se aplicável)</label>
          <div className="row">
            <input id="r-month" inputMode="numeric" style={{ width: 70 }} value={v.issued_month ?? ""} onChange={(e) => set("issued_month", e.target.value)} aria-label="Mês" />
            <input inputMode="numeric" style={{ width: 70 }} value={v.issued_day ?? ""} onChange={(e) => set("issued_day", e.target.value)} aria-label="Dia" />
          </div>
        </div>
      </div>
      <fieldset>
        <legend>Autores e contribuidores (ordem da obra)</legend>
        {contrib.map((c, i) => (
          <div key={i} className="row" style={{ marginBottom: 6 }}>
            <select aria-label="Papel" value={c.role} onChange={(e) => upd(i, "role", e.target.value)} style={{ width: 120 }}>
              <option value="author">Autor</option>
              <option value="editor">Editor</option>
              <option value="translator">Tradutor</option>
              <option value="director">Realizador</option>
            </select>
            {c.literal !== undefined && c.literal !== null ? (
              <>
                <input aria-label="Nome institucional" placeholder="Nome institucional completo" value={c.literal ?? ""} onChange={(e) => upd(i, "literal", e.target.value)} style={{ flex: 2, minWidth: 180 }} />
                <input aria-label="Sigla" placeholder="Sigla (opcional)" value={c.abbreviation ?? ""} onChange={(e) => upd(i, "abbreviation", e.target.value)} style={{ width: 110 }} />
              </>
            ) : (
              <>
                <input aria-label="Apelido(s)" placeholder="Apelido(s)" value={c.family ?? ""} onChange={(e) => upd(i, "family", e.target.value)} style={{ flex: 1, minWidth: 140 }} />
                <input aria-label="Nome(s) próprio(s)" placeholder="Nome(s) próprio(s)" value={c.given ?? ""} onChange={(e) => upd(i, "given", e.target.value)} style={{ flex: 1, minWidth: 140 }} />
                <input aria-label="Partícula" placeholder="Partícula" value={c.particle ?? ""} onChange={(e) => upd(i, "particle", e.target.value)} style={{ width: 90 }} />
              </>
            )}
            <button className="btn btn-small" aria-label="Subir" onClick={() => moveC(i, -1)}>
              ↑
            </button>
            <button className="btn btn-small" aria-label="Remover" onClick={() => setContrib(contrib.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
        <div className="row">
          <button className="btn btn-small" onClick={() => setContrib([...contrib, { role: "author", family: "", given: "" }])}>
            + Pessoa
          </button>
          <button className="btn btn-small" onClick={() => setContrib([...contrib, { role: "author", literal: "", abbreviation: "" }])}>
            + Autor institucional
          </button>
        </div>
      </fieldset>
      <div className="form-grid">
        {TEXT_FIELDS.map(([k, label, hint]) => (
          <div key={k} className={`field ${k === "title" ? "wide" : ""}`}>
            <label htmlFor={`r-${k}`}>{label}</label>
            <input id={`r-${k}`} value={v[k] ?? ""} onChange={(e) => set(k, e.target.value)} />
            {hint && <span className="hint">{hint}</span>}
          </div>
        ))}
        <div className="field">
          <label htmlFor="r-acc">Data de consulta (interna)</label>
          <input id="r-acc" type="date" value={v.accessed_date ?? ""} onChange={(e) => set("accessed_date", e.target.value)} />
          <label className="check">
            <input type="checkbox" checked={!!v.show_accessed} onChange={(e) => set("show_accessed", e.target.checked)} /> Mostrar na referência (conteúdo concebido para mudar)
          </label>
        </div>
        <div className="field">
          <label htmlFor="r-read">Leitura</label>
          <select id="r-read" value={v.read_status} onChange={(e) => set("read_status", e.target.value)}>
            {Object.entries(READ).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="r-ver">Verificação</label>
          <select id="r-ver" value={v.verification_status} onChange={(e) => set("verification_status", e.target.value)}>
            {Object.entries(VERIF).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="field wide">
          <label htmlFor="r-tags">Etiquetas (separadas por vírgulas)</label>
          <input id="r-tags" value={v.tags ?? ""} onChange={(e) => set("tags", e.target.value)} />
        </div>
        <div className="field wide">
          <label htmlFor="r-notes">Notas</label>
          <textarea id="r-notes" value={v.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </div>
      </div>
    </Dialog>
  );
}

export function ReferenceDetailPage() {
  const { id } = useParams();
  const base = useProjectApi();
  const { canWrite } = useSession();
  const r = useAsync(() => get<Ref & { formatted: { html: string; text: string } | null }>(`${base}/references/${id}`), [base, id]);
  const occ = useAsync(() => get<any[]>(`${base}/references/${id}/occurrences`), [base, id]);
  const exc = useAsync(() => get<{ rows: any[] }>(`${base}/e/excerpt?reference_id=${id}`), [base, id]);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (r.loading && !r.data) return <Loading />;
  if (r.error || !r.data) return <ErrorAlert error={r.error} />;
  const ref = r.data;
  const missing: string[] = [];
  if (!ref.contributors.some((c) => c.role === "author")) missing.push("autor (será usado o título na posição do autor)");
  if (!ref.issued_year && !ref.no_date) missing.push("data (confirmar se é s.d.)");
  if (ref.type === "article" && !ref.container_title) missing.push("revista");
  if (ref.type === "webpage" && !ref.url) missing.push("URL");
  if (ref.type === "webpage" && ref.no_date && !ref.accessed_date) missing.push("data de consulta (página sem data)");
  return (
    <>
      <PageHead title={ref.title}>
        {canWrite && (
          <>
            <button className="btn" onClick={() => setEditing(true)}>
              Editar dados
            </button>
            <button
              className="btn"
              onClick={() =>
                void post(`${base}/references/${ref.id}/archive`, { archived: !ref.archived_at }).then(() => r.reload())
              }
            >
              {ref.archived_at ? "Restaurar" : "Arquivar"}
            </button>
          </>
        )}
      </PageHead>
      {ref.archived_at && <div className="alert warn">Arquivada{ref.merged_into ? " (fundida noutra referência)" : ""}. As citações existentes continuam resolvidas.</div>}
      {msg && <div className="alert ok">{msg}</div>}
      <div className="grid grid-2">
        <section className="card">
          <h2>Referência APA 7</h2>
          {ref.formatted ? (
            <>
              <p className="bibliography" dangerouslySetInnerHTML={{ __html: ref.formatted.html }} />
              <button className="btn btn-small" onClick={() => void navigator.clipboard.writeText(ref.formatted!.text).then(() => setMsg("Referência copiada."))}>
                Copiar referência
              </button>
            </>
          ) : (
            <p className="muted">Ainda não citada no texto: aparece na lista final apenas quando citada.</p>
          )}
          {missing.length > 0 && (
            <div className="alert warn" style={{ marginTop: "0.75rem" }}>
              Informação em falta que afeta a referência: {missing.join("; ")}.
            </div>
          )}
          <p className="muted">Uma referência bem formatada não certifica a qualidade científica da fonte.</p>
        </section>
        <section className="card">
          <h2>Onde é citada</h2>
          {(occ.data ?? []).length === 0 ? (
            <p className="muted">Sem ocorrências no texto.</p>
          ) : (
            <ul>
              {occ.data!.map((o) => (
                <li key={o.citation_id}>
                  <Link to={`/app/escrita/editor/${o.section_id}`}>{o.section_title}</Link> — {o.mode}
                  {o.locator ? `, ${o.locator_label ?? "p."} ${o.locator}` : ""}
                </li>
              ))}
            </ul>
          )}
          <h2>Excertos e notas</h2>
          {(exc.data?.rows ?? []).length === 0 ? (
            <p className="muted">
              Sem excertos. <Link to="/app/dados/excertos?novo=1">Registar excerto</Link>
            </p>
          ) : (
            <ul>
              {exc.data!.rows.map((e) => (
                <li key={e.id}>
                  <span className="badge">{e.kind === "literal" ? "Literal" : e.kind === "paraphrase" ? "Paráfrase" : "Comentário"}</span> {e.text.slice(0, 200)}
                  {e.locator ? ` (${e.locator_label ?? "p."} ${e.locator})` : ""}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <section className="card">
        <h2>Metadados</h2>
        <dl className="kv">
          <dt>Tipo</dt>
          <dd>{TYPES[ref.type]}</dd>
          <dt>Autores</dt>
          <dd>{ref.contributors.map((c) => c.literal ?? `${c.family}${c.given ? ", " + c.given : ""}`).join("; ") || "—"}</dd>
          {["container_title", "volume", "issue", "pages", "publisher", "institution", "doi", "url", "isbn", "language", "metadata_source"].map((k) =>
            ref[k] ? (
              <div key={k} style={{ display: "contents" }}>
                <dt>{k}</dt>
                <dd>{String(ref[k])}</dd>
              </div>
            ) : null,
          )}
          <dt>Verificação</dt>
          <dd>{VERIF[ref.verification_status]}</dd>
        </dl>
      </section>
      {editing && (
        <ReferenceDialog
          reference={ref}
          onClose={() => {
            setEditing(false);
            void r.reload();
          }}
        />
      )}
    </>
  );
}

export function ImportPage() {
  const base = useProjectApi();
  const [format, setFormat] = useState<"bibtex" | "ris" | "csl-json">("bibtex");
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (dryRun: boolean) => {
    setError(null);
    try {
      const r = await post(`${base}/references-import`, { format, content, dryRun });
      if (!r.ok) setError(r.error);
      else if (dryRun) setPreview(r);
      else setResult(r);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <PageHead title="Importar bibliografia" intro="BibTeX, RIS ou CSL-JSON. Primeiro é mostrada uma pré-visualização com avisos e possíveis duplicados; nada é gravado sem confirmação." />
      <ErrorAlert error={error} />
      {result ? (
        <div className="alert ok">
          Importadas {result.created.length} fonte(s). {result.skipped.length ? `Ignoradas: ${result.skipped.map((s: any) => `${s.title ?? "(sem título)"} — ${s.reason}`).join("; ")}` : ""}{" "}
          <Link to="/app/bibliografia">Ver biblioteca</Link>
        </div>
      ) : null}
      <div className="card stack">
        <div className="row">
          <label htmlFor="fmt">Formato</label>
          <select id="fmt" value={format} onChange={(e) => setFormat(e.target.value as typeof format)} style={{ width: 160 }}>
            <option value="bibtex">BibTeX</option>
            <option value="ris">RIS</option>
            <option value="csl-json">CSL-JSON</option>
          </select>
          <input
            type="file"
            accept=".bib,.ris,.json,.txt"
            aria-label="Escolher ficheiro"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setContent(await f.text());
            }}
            style={{ maxWidth: 320 }}
          />
        </div>
        <label htmlFor="content" className="sr-only">
          Conteúdo
        </label>
        <textarea id="content" rows={10} placeholder="Cole aqui o conteúdo…" value={content} onChange={(e) => { setContent(e.target.value); setPreview(null); }} className="mono" />
        <div className="row">
          <button className="btn" disabled={!content} onClick={() => void run(true)}>
            Pré-visualizar
          </button>
          <button className="btn btn-primary" disabled={!preview} onClick={() => void run(false)}>
            Confirmar importação
          </button>
        </div>
      </div>
      {preview && (
        <div className="table-wrap" style={{ marginTop: "1rem" }}>
          <table className="data">
            <thead>
              <tr>
                <th>Título</th>
                <th>Autores</th>
                <th>Ano</th>
                <th>Tipo</th>
                <th>Avisos</th>
              </tr>
            </thead>
            <tbody>
              {preview.candidates.map((c: any, i: number) => (
                <tr key={i}>
                  <td>{c.data.title ?? <em>sem título</em>}</td>
                  <td>{(c.data.contributors ?? []).map((a: any) => a.literal ?? `${a.family}${a.given ? ", " + a.given : ""}`).join("; ")}</td>
                  <td>{c.data.issued_year ?? "—"}</td>
                  <td>{TYPES[c.data.type] ?? c.data.type}</td>
                  <td>{c.warnings.length ? c.warnings.join(" ") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
