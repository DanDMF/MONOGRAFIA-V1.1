// Próximo parágrafo (secção 12): quadro de cartões e ficha do cartão.
// Fluxo: ideia → pesquisa → leitura → notas → redação → revisão → integrado.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, get, patch, post } from "../../api";
import { useProjectApi, useSession } from "../../session";
import { Badge, ErrorAlert, Loading, PageHead, useAsync } from "../../components/ui";
import { CARD_STAGES, CARD_STAGE_HINT, CARD_STAGE_LABEL, cardGaps, draftWords, type CardStage } from "../../../shared/cards";
import { fmtDate, fmtDateTime } from "../../format";

const LOCATOR_LABEL: Record<string, string> = {
  page: "Página",
  paragraph: "Parágrafo",
  section: "Secção",
  timestamp: "Tempo",
  figure: "Figura",
  table: "Tabela",
  chapter: "Capítulo",
};
const EXCERPT_KIND: Record<string, string> = { literal: "Excerto literal", paraphrase: "Paráfrase", comment: "Comentário do autor" };

const stageStatus = (s: string) => (s === "integrated" ? "ok" : s === "review" || s === "drafting" ? "earth" : "");

interface CardSummary {
  id: string;
  idea: string;
  stage: CardStage;
  section_id: string | null;
  section_title: string | null;
  source_count: number;
  excerpt_count: number;
  next_action: string | null;
  next_action_date: string | null;
  updated_at: string;
  archived_at: string | null;
}

/** Formulário rápido “Nova ideia” (também usado no painel). */
export function NewIdeaForm({ compact = false }: { compact?: boolean }) {
  const base = useProjectApi();
  const navigate = useNavigate();
  const [idea, setIdea] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        if (!idea.trim()) return;
        setBusy(true);
        setError(null);
        post<{ id: string }>(`${base}/cards`, { idea })
          .then((c) => navigate(`/app/escrita/cartoes/${c.id}`))
          .catch((err) => setError((err as Error).message))
          .finally(() => setBusy(false));
      }}
    >
      <label htmlFor="new-idea" className={compact ? "sr-only" : undefined}>
        Nova ideia
      </label>
      <input
        id="new-idea"
        placeholder="Uma ideia para um parágrafo, numa frase"
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        maxLength={2000}
        style={{ flex: 1, minWidth: 200 }}
      />
      <button className="btn btn-primary" disabled={busy || !idea.trim()}>
        Criar cartão
      </button>
      <ErrorAlert error={error} />
    </form>
  );
}

export function CardsPage() {
  const base = useProjectApi();
  const { canWrite } = useSession();
  const [showArchived, setShowArchived] = useState(false);
  const list = useAsync(() => get<CardSummary[]>(`${base}/cards${showArchived ? "?archived=true" : ""}`), [base, showArchived]);
  if (list.loading && !list.data) return <Loading />;
  const cards = list.data ?? [];
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHead
        title="Próximo parágrafo"
        intro="Cada cartão leva uma ideia até um parágrafo integrado na monografia: ideia → pesquisa → leitura → notas → redação → revisão → integrado. Um parágrafo por dia é progresso real."
      />
      <ErrorAlert error={list.error} />
      {canWrite && (
        <section className="card" aria-label="Nova ideia">
          <NewIdeaForm />
        </section>
      )}
      <p className="row" style={{ marginTop: "0.75rem" }}>
        <label className="row">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Mostrar arquivados
        </label>
      </p>
      {cards.length === 0 ? (
        <p className="muted">Ainda não há cartões. Comece por escrever uma ideia acima.</p>
      ) : (
        <div className="board">
          {CARD_STAGES.map((stage) => {
            const inStage = cards.filter((c) => c.stage === stage);
            return (
              <details key={stage} className="board-col" open={stage !== "integrated" || inStage.length <= 3}>
                <summary>
                  <strong>{CARD_STAGE_LABEL[stage]}</strong> <span className="muted">({inStage.length})</span>
                </summary>
                {inStage.length === 0 && <p className="muted small">—</p>}
                {inStage.map((c) => (
                  <Link key={c.id} to={`/app/escrita/cartoes/${c.id}`} className="card card-link">
                    <span className="card-idea">{c.idea}</span>
                    <span className="muted small">
                      {c.section_title ?? "sem secção"} · {c.source_count} fonte(s) · {c.excerpt_count} excerto(s)
                    </span>
                    {c.next_action && (
                      <span className={`small ${c.next_action_date && c.next_action_date < today ? "text-warn" : ""}`}>
                        → {c.next_action}
                        {c.next_action_date ? ` (${fmtDate(c.next_action_date)})` : ""}
                      </span>
                    )}
                    {c.archived_at && <Badge status="" label="Arquivado" />}
                  </Link>
                ))}
              </details>
            );
          })}
        </div>
      )}
    </>
  );
}

interface Source {
  reference_id: string;
  locator_label: string | null;
  locator: string | null;
  author_label: string;
  issued_year: number | null;
  title: string;
  archived_at?: string | null;
}
interface Excerpt {
  id: string;
  reference_id: string;
  kind: string;
  text: string;
  locator_label: string | null;
  locator: string | null;
  is_translation: boolean;
  note: string | null;
}
interface CardFull {
  card: {
    id: string;
    idea: string;
    question: string | null;
    section_id: string | null;
    stage: CardStage;
    interpretation: string | null;
    draft: string | null;
    next_action: string | null;
    next_action_date: string | null;
    integrated_section_id: string | null;
    integrated_at: string | null;
    version: number;
    archived_at: string | null;
    updated_at: string;
  };
  sources: Source[];
  excerpts: Excerpt[];
  candidates: Excerpt[];
  section: { id: string; title: string } | null;
  gaps: string[];
}

type Form = Pick<CardFull["card"], "idea" | "question" | "section_id" | "stage" | "interpretation" | "draft" | "next_action" | "next_action_date"> & {
  sources: Source[];
  excerpts: Excerpt[];
};

const toForm = (d: CardFull): Form => ({
  idea: d.card.idea,
  question: d.card.question,
  section_id: d.card.section_id,
  stage: d.card.stage,
  interpretation: d.card.interpretation,
  draft: d.card.draft,
  next_action: d.card.next_action,
  next_action_date: d.card.next_action_date,
  sources: d.sources,
  excerpts: d.excerpts,
});

const sourceLabel = (s: { author_label: string; issued_year: number | null; title: string }) =>
  `${s.author_label} (${s.issued_year ?? "s.d."}) — ${s.title}`;

/** Excerto com a distinção visual literal / paráfrase / comentário (secção 12). */
function ExcerptView({ e, source }: { e: Excerpt; source?: Source }) {
  const loc = e.locator ? `${LOCATOR_LABEL[e.locator_label ?? "page"] ?? ""} ${e.locator}` : "sem localização";
  return (
    <div className={`excerpt excerpt-${e.kind}`}>
      <div className="excerpt-kind">
        {EXCERPT_KIND[e.kind] ?? e.kind}
        {e.is_translation ? " · tradução própria" : ""} · {source ? `${source.author_label}, ${source.issued_year ?? "s.d."}` : "fonte"} · {loc}
      </div>
      <div className="excerpt-text">{e.kind === "literal" ? `“${e.text}”` : e.text}</div>
      {e.note && <div className="muted small">Nota: {e.note}</div>}
    </div>
  );
}

export function CardDetailPage() {
  const { id } = useParams();
  const base = useProjectApi();
  const { canWrite } = useSession();
  const navigate = useNavigate();
  const [data, setData] = useState<CardFull | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<CardFull | null>(null);
  const [status, setStatus] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [msg, setMsg] = useState<string | null>(null);
  const versionRef = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef<Form | null>(null);
  formRef.current = form;

  const sections = useAsync(() => get<{ id: string; title: string; number: string | null; parent_id: string | null }[]>(`${base}/sections`), [base]);

  const load = useCallback(async () => {
    try {
      const d = await get<CardFull>(`${base}/cards/${id}`);
      setData(d);
      setForm(toForm(d));
      versionRef.current = d.card.version;
      setStatus("saved");
      setConflict(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [base, id]);
  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    const f = formRef.current;
    if (!f) return;
    setStatus("saving");
    try {
      const d = await patch<CardFull>(`${base}/cards/${id}`, {
        version: versionRef.current,
        idea: f.idea,
        question: f.question ?? "",
        section_id: f.section_id ?? "",
        ...(f.stage !== "integrated" ? { stage: f.stage } : {}),
        interpretation: f.interpretation ?? "",
        draft: f.draft ?? "",
        next_action: f.next_action ?? "",
        next_action_date: f.next_action_date ?? "",
        sources: f.sources.map((s) => ({ reference_id: s.reference_id, locator_label: s.locator_label ?? "", locator: s.locator ?? "" })),
        excerpt_ids: f.excerpts.map((e) => e.id),
      });
      versionRef.current = d.card.version;
      setData(d);
      // Mantém o que foi escrito entretanto; atualiza apenas o que o servidor calcula.
      setForm((cur) => (cur === f ? toForm(d) : cur));
      setStatus(formRef.current === f ? "saved" : "dirty");
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setConflict((e.details?.server as CardFull) ?? null);
        setStatus("error");
      } else {
        setError((e as Error).message);
        setStatus("error");
      }
    }
  }, [base, id]);

  const update = (patchForm: Partial<Form>, immediate = false) => {
    setForm((f) => (f ? { ...f, ...patchForm } : f));
    setStatus("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), immediate ? 0 : 1200);
  };
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (status === "dirty" || status === "saving" || status === "error") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  if (error && !data) return <ErrorAlert error={error} />;
  if (!data || !form) return <Loading />;
  const c = data.card;
  const integrated = c.stage === "integrated";
  const editable = canWrite && !c.archived_at;
  const gaps = cardGaps({ ...form, sources: form.sources, excerpts: form.excerpts }, form.stage === "integrated" ? "review" : form.stage);
  const srcById = new Map(form.sources.map((s) => [s.reference_id, s]));
  const stageIdx = CARD_STAGES.indexOf(form.stage);
  const allSections = sections.data ?? [];

  return (
    <>
      <PageHead title={form.idea || "Cartão"} intro={<Link to="/app/escrita/cartoes">← Todos os cartões</Link>}>
        <span className={`save-state ${status}`} role="status" aria-live="polite">
          {status === "saved" ? "Gravado" : status === "saving" ? "A gravar…" : status === "dirty" ? "Alterações por gravar" : "Não gravado"}
        </span>
      </PageHead>
      <ErrorAlert error={error} />
      {conflict !== null && (
        <div className="alert warn" role="alert">
          Este cartão foi alterado noutra sessão; as suas últimas alterações <strong>não</strong> foram gravadas por cima. O texto continua nos campos para o
          poder copiar.{" "}
          <button className="btn btn-small" onClick={() => void load()}>
            Carregar a versão do servidor
          </button>
        </div>
      )}
      {c.archived_at && <div className="alert warn">Cartão arquivado (só leitura).</div>}
      {msg && <div className="alert ok">{msg}</div>}

      <nav aria-label="Etapa do cartão" className="stepper">
        {CARD_STAGES.map((s, i) => (
          <button
            key={s}
            type="button"
            className={`step ${i < stageIdx ? "done" : ""} ${s === form.stage ? "current" : ""}`}
            aria-current={s === form.stage ? "step" : undefined}
            disabled={!editable || s === "integrated" || s === form.stage}
            onClick={() => update({ stage: s }, true)}
            title={s === "integrated" ? "Use “Integrar na secção”" : CARD_STAGE_HINT[s]}
          >
            {CARD_STAGE_LABEL[s]}
          </button>
        ))}
      </nav>
      <p className="guidance">{CARD_STAGE_HINT[form.stage]}</p>
      {gaps.length > 0 && !integrated && (
        <div className="alert warn">
          <strong>O que falta até esta etapa</strong> (orientação; não bloqueia):
          <ul>
            {gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      )}
      {integrated && (
        <div className="alert ok">
          Integrado em {fmtDateTime(c.integrated_at)} na secção{" "}
          <Link to={`/app/escrita/editor/${c.integrated_section_id}`}>{allSections.find((s) => s.id === c.integrated_section_id)?.title ?? "de destino"}</Link>. O
          parágrafo continua ligado a este cartão e às fontes; reveja-o no editor.
        </div>
      )}

      <div className="grid grid-2">
        <section className="card">
          <h2>Ideia e pergunta</h2>
          <div className="field">
            <label htmlFor="c-idea">Ideia</label>
            <textarea id="c-idea" rows={2} value={form.idea} disabled={!editable} onChange={(e) => update({ idea: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="c-q">Pergunta a que o parágrafo responde</label>
            <textarea id="c-q" rows={2} value={form.question ?? ""} disabled={!editable} onChange={(e) => update({ question: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="c-sec">Capítulo/secção de destino</label>
            <select id="c-sec" value={form.section_id ?? ""} disabled={!editable} onChange={(e) => update({ section_id: e.target.value || null }, true)}>
              <option value="">— escolher —</option>
              {allSections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.number ? `${s.number} ` : ""}
                  {s.title}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="card">
          <h2>Próxima ação</h2>
          <div className="field">
            <label htmlFor="c-next">O que fazer a seguir</label>
            <input id="c-next" value={form.next_action ?? ""} disabled={!editable} onChange={(e) => update({ next_action: e.target.value })} placeholder="Ex.: ler o capítulo 3 da fonte X" />
          </div>
          <div className="field">
            <label htmlFor="c-date">Até (opcional)</label>
            <input id="c-date" type="date" value={form.next_action_date ?? ""} disabled={!editable} onChange={(e) => update({ next_action_date: e.target.value || null }, true)} />
          </div>
          <p className="muted small">Última alteração: {fmtDateTime(c.updated_at)}</p>
        </section>
      </div>

      <SourcesEditor
        sources={form.sources}
        editable={editable}
        onChange={(sources) => {
          const keep = new Set(sources.map((s) => s.reference_id));
          update({ sources, excerpts: form.excerpts.filter((e) => keep.has(e.reference_id)) }, true);
        }}
      />

      <section className="card">
        <h2>Excertos e notas de leitura</h2>
        <p className="muted small">Excerto literal, paráfrase e comentário próprio ficam separados; só o literal leva aspas.</p>
        {form.excerpts.length === 0 && <p className="muted">Nenhum excerto ligado.</p>}
        {form.excerpts.map((e) => (
          <div key={e.id} className="row" style={{ alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <ExcerptView e={e} source={srcById.get(e.reference_id)} />
            </div>
            {editable && (
              <button className="btn btn-small" aria-label="Desligar excerto" onClick={() => update({ excerpts: form.excerpts.filter((x) => x.id !== e.id) }, true)}>
                Desligar
              </button>
            )}
          </div>
        ))}
        {editable && data.candidates.filter((e) => !form.excerpts.some((x) => x.id === e.id)).length > 0 && (
          <>
            <h3>Excertos já registados destas fontes</h3>
            {data.candidates
              .filter((e) => !form.excerpts.some((x) => x.id === e.id))
              .map((e) => (
                <div key={e.id} className="row" style={{ alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <ExcerptView e={e} source={srcById.get(e.reference_id)} />
                  </div>
                  <button className="btn btn-small" onClick={() => update({ excerpts: [...form.excerpts, e] }, true)}>
                    Ligar
                  </button>
                </div>
              ))}
          </>
        )}
        {editable && form.sources.length > 0 && (
          <NewExcerpt
            sources={form.sources}
            onCreated={(e) => {
              update({ excerpts: [...form.excerpts, e] }, true);
            }}
          />
        )}
        {editable && form.sources.length === 0 && <p className="muted small">Ligue primeiro uma fonte para registar excertos.</p>}
      </section>

      <section className="card">
        <h2>Interpretação própria</h2>
        <label htmlFor="c-int" className="sr-only">
          Interpretação própria
        </label>
        <textarea
          id="c-int"
          rows={4}
          value={form.interpretation ?? ""}
          disabled={!editable}
          onChange={(e) => update({ interpretation: e.target.value })}
          placeholder="O que eu concluo destas leituras, com as minhas palavras"
        />
      </section>

      <section className="card">
        <h2>Rascunho do parágrafo</h2>
        <label htmlFor="c-draft" className="sr-only">
          Rascunho do parágrafo
        </label>
        <textarea id="c-draft" rows={8} value={form.draft ?? ""} disabled={!editable} onChange={(e) => update({ draft: e.target.value })} className="draft" />
        <p className="muted small">
          {draftWords(form.draft)} palavra(s). Uma linha em branco separa parágrafos. As citações são inseridas pela integração (ou depois, no editor), nunca
          escritas à mão.
        </p>
        {editable && !integrated && (
          <IntegratePanel
            ready={!!form.draft?.trim() && !!form.section_id}
            hasSources={form.sources.length > 0}
            pending={status !== "saved"}
            sectionTitle={allSections.find((s) => s.id === form.section_id)?.title ?? null}
            onIntegrate={async (cite) => {
              try {
                if (timer.current) clearTimeout(timer.current);
                if (status !== "saved") await save();
                const r = await post<{ sectionId: string; revisionNumber: number }>(`${base}/cards/${id}/integrate`, { version: versionRef.current, cite });
                await load();
                setMsg(`Parágrafo integrado (revisão ${r.revisionNumber} da secção).`);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          />
        )}
      </section>

      {canWrite && (
        <p className="row">
          {integrated && !c.archived_at && (
            <button className="btn" onClick={() => update({ stage: "review" }, true)}>
              Reabrir para revisão
            </button>
          )}
          <button
            className="btn"
            onClick={() =>
              void post(`${base}/cards/${id}/archive`, { archived: !c.archived_at })
                .then(() => (c.archived_at ? load() : navigate("/app/escrita/cartoes")))
                .catch((e) => setError((e as Error).message))
            }
          >
            {c.archived_at ? "Restaurar cartão" : "Arquivar cartão"}
          </button>
        </p>
      )}
    </>
  );
}

function IntegratePanel({
  ready,
  hasSources,
  pending,
  sectionTitle,
  onIntegrate,
}: {
  ready: boolean;
  hasSources: boolean;
  pending: boolean;
  sectionTitle: string | null;
  onIntegrate: (cite: boolean) => Promise<void>;
}) {
  const [cite, setCite] = useState(true);
  const [busy, setBusy] = useState(false);
  return (
    <div className="integrate">
      <h3>Integrar na secção</h3>
      {!ready ? (
        <p className="muted">Para integrar é preciso um rascunho e uma secção de destino.</p>
      ) : (
        <>
          <p>
            O rascunho será acrescentado <strong>no fim</strong> de “{sectionTitle}”, como marco de versão. O texto existente não é alterado.
          </p>
          {hasSources && (
            <label className="row">
              <input type="checkbox" checked={cite} onChange={(e) => setCite(e.target.checked)} /> Acrescentar uma citação parentética das fontes do cartão (com
              localização) no fim do parágrafo
            </label>
          )}
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onIntegrate(hasSources && cite).finally(() => setBusy(false));
            }}
          >
            {pending ? "Gravar e integrar" : "Integrar na secção"}
          </button>
        </>
      )}
    </div>
  );
}

function SourcesEditor({ sources, editable, onChange }: { sources: Source[]; editable: boolean; onChange: (s: Source[]) => void }) {
  const base = useProjectApi();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Source[]>([]);
  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      get<any[]>(`${base}/references?search=${encodeURIComponent(search)}`)
        .then((rows) =>
          setResults(
            rows.slice(0, 8).map((r) => {
              const a = (r.contributors ?? []).find((c: any) => c.role === "author");
              return {
                reference_id: r.id,
                locator_label: null,
                locator: null,
                author_label: a ? a.literal ?? [a.particle, a.family].filter(Boolean).join(" ") : "(sem autor)",
                issued_year: r.issued_year,
                title: r.title,
              };
            }),
          ),
        )
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [search, base]);
  const set = (i: number, k: "locator_label" | "locator", v: string) => onChange(sources.map((s, j) => (j === i ? { ...s, [k]: v || null } : s)));
  return (
    <section className="card">
      <h2>Fontes e localização</h2>
      {sources.length === 0 && <p className="muted">Nenhuma fonte ligada.</p>}
      {sources.map((s, i) => (
        <div key={s.reference_id} className="source-row">
          <Link to={`/app/bibliografia/${s.reference_id}`} className="source-title">
            {sourceLabel(s)}
          </Link>
          {s.archived_at && <Badge status="warn" label="arquivada" />}
          <div className="row">
            <label className="sr-only" htmlFor={`loc-l-${i}`}>
              Tipo de localizador
            </label>
            <select id={`loc-l-${i}`} value={s.locator_label ?? "page"} disabled={!editable} onChange={(e) => set(i, "locator_label", e.target.value)}>
              {Object.entries(LOCATOR_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor={`loc-${i}`}>
              Localização
            </label>
            <input id={`loc-${i}`} placeholder="ex.: 12 ou 12–14" value={s.locator ?? ""} disabled={!editable} onChange={(e) => set(i, "locator", e.target.value)} style={{ width: 130 }} />
            {editable && (
              <button className="btn btn-small" onClick={() => onChange(sources.filter((_, j) => j !== i))}>
                Remover
              </button>
            )}
          </div>
        </div>
      ))}
      {editable && (
        <div className="field" style={{ marginTop: "0.75rem" }}>
          <label htmlFor="src-search">Ligar fonte da biblioteca</label>
          <input id="src-search" placeholder="Pesquisar por autor, título ou ano" value={search} onChange={(e) => setSearch(e.target.value)} />
          {results.length > 0 && (
            <ul className="pick-list">
              {results.map((r) => {
                const linked = sources.some((s) => s.reference_id === r.reference_id);
                return (
                  <li key={r.reference_id}>
                    <button
                      className="btn btn-link"
                      disabled={linked}
                      onClick={() => {
                        onChange([...sources, { ...r, locator_label: "page" }]);
                        setSearch("");
                      }}
                    >
                      {sourceLabel(r)}
                      {linked ? " (já ligada)" : ""}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="muted small">
            A fonte não está na biblioteca? <Link to="/app/bibliografia">Registe-a primeiro</Link> — nunca invente metadados.
          </p>
        </div>
      )}
    </section>
  );
}

function NewExcerpt({ sources, onCreated }: { sources: Source[]; onCreated: (e: Excerpt) => void }) {
  const base = useProjectApi();
  const empty = { reference_id: sources[0]!.reference_id, kind: "literal", text: "", locator_label: "page", locator: "" };
  const [v, setV] = useState(empty);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open)
    return (
      <button className="btn btn-small" onClick={() => setOpen(true)} style={{ marginTop: "0.5rem" }}>
        + Novo excerto
      </button>
    );
  return (
    <form
      className="integrate"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        post<Excerpt>(`${base}/e/excerpt`, { ...v, locator: v.locator || null, locator_label: v.locator ? v.locator_label : null })
          .then((x) => {
            onCreated(x);
            setV({ ...empty, reference_id: v.reference_id });
            setOpen(false);
          })
          .catch((err) => setError((err as Error).message));
      }}
    >
      <h3>Novo excerto</h3>
      <ErrorAlert error={error} />
      <div className="field">
        <label htmlFor="ne-src">Fonte</label>
        <select id="ne-src" value={v.reference_id} onChange={(e) => setV({ ...v, reference_id: e.target.value })}>
          {sources.map((s) => (
            <option key={s.reference_id} value={s.reference_id}>
              {sourceLabel(s)}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="row">
        <legend>Tipo</legend>
        {Object.entries(EXCERPT_KIND).map(([k, label]) => (
          <label key={k} className="row">
            <input type="radio" name="ne-kind" value={k} checked={v.kind === k} onChange={() => setV({ ...v, kind: k })} /> {label}
          </label>
        ))}
      </fieldset>
      <div className="field">
        <label htmlFor="ne-text">Texto</label>
        <textarea id="ne-text" rows={3} required value={v.text} onChange={(e) => setV({ ...v, text: e.target.value })} />
      </div>
      <div className="row">
        <label htmlFor="ne-ll" className="sr-only">
          Tipo de localizador
        </label>
        <select id="ne-ll" value={v.locator_label} onChange={(e) => setV({ ...v, locator_label: e.target.value })}>
          {Object.entries(LOCATOR_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <label htmlFor="ne-loc" className="sr-only">
          Localização
        </label>
        <input id="ne-loc" placeholder="Localização (ex.: 12)" value={v.locator} onChange={(e) => setV({ ...v, locator: e.target.value })} style={{ width: 160 }} />
      </div>
      {v.kind === "literal" && !v.locator && <p className="text-warn small">Um excerto literal precisa de página ou outra localização para ser citado.</p>}
      <p className="row">
        <button className="btn btn-primary" disabled={!v.text.trim()}>
          Registar e ligar
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </p>
    </form>
  );
}
