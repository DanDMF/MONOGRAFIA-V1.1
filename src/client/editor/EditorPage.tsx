import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ApiError, get, patch, post, put } from "../api";
import { useProjectApi, useSession } from "../session";
import { Badge, Dialog, ErrorAlert, Loading, PageHead, useAsync } from "../components/ui";
import { CardLink, Citation, CitationBlock, EditorContext, Xref, type RenderedCitation } from "./extensions";
import { CitationDialog, type RefOption } from "./CitationDialog";
import { SECTION_STATUS } from "../../shared/templates";
import { plainText, docWordCount, type CitationAttrs, type DocNode } from "../../shared/doc";
import { diffWords } from "../../shared/diff";
import { fmtDateTime } from "../format";

type SaveState = { kind: "idle" | "dirty" | "saving" | "saved" | "error" | "conflict"; at?: Date; message?: string };

const draftKey = (id: string) => `vrban.draft.${id}`;
const readDraft = (id: string): { doc: DocNode; baseVersion: number; at: string } | null => {
  try {
    return JSON.parse(localStorage.getItem(draftKey(id)) ?? "null");
  } catch {
    return null;
  }
};
const writeDraft = (id: string, v: unknown) => {
  try {
    localStorage.setItem(draftKey(id), JSON.stringify(v));
  } catch {
    /* cópia de emergência indisponível; a gravação no servidor continua */
  }
};
const clearDraft = (id: string) => {
  try {
    localStorage.removeItem(draftKey(id));
  } catch {
    /* ignorar */
  }
};

export function EditorPage() {
  const { sectionId } = useParams();
  const base = useProjectApi();
  const data = useAsync(async () => {
    const [sec, sections, refs, personal, rendered] = await Promise.all([
      get(`${base}/sections/${sectionId}`),
      get<any[]>(`${base}/sections`),
      get<any[]>(`${base}/references`),
      get<{ rows: any[] }>(`${base}/e/personal_communication`),
      get<{ citations: Record<string, RenderedCitation> }>(`${base}/citations/rendered`),
    ]);
    return { sec, sections, refs, personal: personal.rows, rendered: rendered.citations };
  }, [base, sectionId]);
  if (data.loading && !data.data) return <Loading />;
  if (data.error || !data.data) return <ErrorAlert error={data.error} />;
  return <EditorInner key={sectionId} initial={data.data} />;
}

function EditorInner({ initial }: { initial: any }) {
  const base = useProjectApi();
  const { canWrite } = useSession();
  const section = initial.sec.section;
  const id: string = section.id;
  const versionRef = useRef<number>(section.version);
  const [meta, setMeta] = useState(section);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [citations, setCitations] = useState<Record<string, RenderedCitation>>(initial.rendered);
  const [dialog, setDialog] = useState<{ attrs: CitationAttrs | null; pos: number | null; block: boolean } | null>(null);
  const [xrefOpen, setXrefOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ serverDoc: DocNode; serverVersion: number } | null>(null);
  const [recovery, setRecovery] = useState<ReturnType<typeof readDraft>>(null);
  const [words, setWords] = useState<number>(docWordCount(initial.sec.doc));
  const [panel, setPanel] = useState<"info" | "revisions">("info");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const pending = useRef(false);

  const refOptions: RefOption[] = useMemo(
    () =>
      initial.refs.map((r: any) => {
        const a = r.contributors?.filter((c: any) => c.role === "author") ?? [];
        const who = a.length ? (a[0].literal ?? a[0].family) + (a.length > 2 ? " et al." : a.length === 2 ? ` & ${a[1].literal ?? a[1].family}` : "") : r.title;
        return { id: r.id, label: `${who} (${r.no_date ? "s.d." : (r.issued_year ?? "?")}) — ${r.title}`.slice(0, 140) };
      }),
    [initial.refs],
  );
  const personalOptions: RefOption[] = initial.personal.map((p: any) => ({ id: p.id, label: `${p.given_initials} ${p.family} — ${p.communication_date}` }));
  const sectionsById = useMemo(() => new Map<string, any>(initial.sections.map((s: any) => [s.id, s])), [initial.sections]);
  const xrefLabel = useCallback(
    (targetId: string) => {
      const s = sectionsById.get(targetId);
      if (!s) return null;
      const w = s.kind === "chapter" ? "Capítulo" : s.kind === "appendix" ? "Apêndice" : "Secção";
      return s.number ? `${w} ${s.number}` : `“${s.title}”`;
    },
    [sectionsById],
  );

  const refreshCitations = useCallback(async () => {
    const r = await get<{ citations: Record<string, RenderedCitation> }>(`${base}/citations/rendered`);
    setCitations((prev) => ({ ...prev, ...r.citations }));
  }, [base]);

  const doSave = useCallback(
    async (editor: Editor, opts: { checkpoint?: boolean; note?: string; force?: number } = {}) => {
      if (!canWrite) return;
      if (inFlight.current) {
        pending.current = true;
        return;
      }
      inFlight.current = true;
      setSave({ kind: "saving" });
      const doc = editor.getJSON();
      try {
        const r = await put(`${base}/sections/${id}/content`, {
          baseVersion: opts.force ?? versionRef.current,
          doc,
          checkpoint: !!opts.checkpoint,
          note: opts.note,
        });
        versionRef.current = r.version;
        if (r.doc) editor.commands.setContent(r.doc, { emitUpdate: false }); // IDs duplicados reatribuídos pelo servidor
        setMeta((m: any) => ({ ...m, status: r.status }));
        clearDraft(id);
        setSave({ kind: "saved", at: new Date(), message: opts.checkpoint ? `Versão ${r.revisionNumber} guardada` : undefined });
        void refreshCitations();
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          setConflict({ serverDoc: e.details.serverDoc, serverVersion: e.details.serverVersion });
          setSave({ kind: "conflict", message: e.message });
        } else {
          setSave({ kind: "error", message: (e as Error).message });
        }
      } finally {
        inFlight.current = false;
        if (pending.current) {
          pending.current = false;
          void doSave(editor);
        }
      }
    },
    [base, id, canWrite, refreshCitations],
  );

  const editor = useEditor({
    editable: canWrite,
    extensions: [StarterKit.configure({ heading: { levels: [2, 3, 4, 5] }, codeBlock: false }), Citation, CitationBlock, Xref, CardLink],
    content: initial.sec.doc,
    onUpdate: ({ editor }) => {
      setWords(docWordCount(editor.getJSON() as DocNode));
      writeDraft(id, { doc: editor.getJSON(), baseVersion: versionRef.current, at: new Date().toISOString() });
      setSave({ kind: "dirty" });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void doSave(editor), 1500);
    },
  });

  // Recuperação: cópia local mais recente do que a versão do servidor
  useEffect(() => {
    const d = readDraft(id);
    if (d && d.baseVersion === section.version && JSON.stringify(d.doc) !== JSON.stringify(initial.sec.doc)) setRecovery(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (save.kind === "dirty" || save.kind === "saving" || save.kind === "error") e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [save.kind]);

  const openCitation = useCallback((attrs: any, pos: number, block: boolean) => setDialog({ attrs: { ...attrs }, pos, block }), []);

  const submitCitation = (attrs: CitationAttrs) => {
    if (!editor) return;
    const { pos, block } = dialog!;
    if (pos !== null) {
      const { quote, ...rest } = attrs;
      editor.chain().focus().command(({ tr }) => {
        tr.setNodeMarkup(pos, undefined, block ? { ...rest, quote: null } : { ...rest, quote });
        return true;
      }).run();
    } else if (attrs.mode === "quote_block") {
      const paragraphs = (attrs.quote ?? "").split(/\n{2,}/).filter((p) => p.trim()).map((p) => ({ type: "paragraph", content: [{ type: "text", text: p.trim() }] }));
      editor.chain().focus().insertContent({ type: "citationBlock", attrs: { ...attrs, quote: null }, content: paragraphs.length ? paragraphs : [{ type: "paragraph" }] }).run();
    } else {
      editor.chain().focus().insertContent({ type: "citation", attrs }).run();
    }
    // mostrar de imediato o texto da pré-visualização até à próxima gravação
    post(`${base}/citations/preview`, { citation: attrs }).then((r) => setCitations((c) => ({ ...c, [attrs.id]: r }))).catch(() => undefined);
    setDialog(null);
  };
  const removeCitation = () => {
    if (!editor || dialog?.pos == null) return;
    const node = editor.state.doc.nodeAt(dialog.pos);
    if (node) editor.chain().focus().command(({ tr }) => {
      if (dialog.block) tr.replaceWith(dialog.pos!, dialog.pos! + node.nodeSize, node.content);
      else tr.delete(dialog.pos!, dialog.pos! + node.nodeSize);
      return true;
    }).run();
    setDialog(null);
  };

  const sectionCitations = useMemo(() => {
    const out: CitationAttrs[] = [];
    const walk = (n: any) => {
      if ((n.type === "citation" || n.type === "citationBlock") && n.attrs) out.push(n.attrs);
      n.content?.forEach(walk);
    };
    if (editor) walk(editor.getJSON());
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, words, citations]);

  const saveLabel =
    save.kind === "saving"
      ? "A gravar…"
      : save.kind === "saved"
        ? `${save.message ?? "Gravado no servidor"} às ${save.at!.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}`
        : save.kind === "dirty"
          ? "Alterações por gravar"
          : save.kind === "error"
            ? `Não gravado: ${save.message}`
            : save.kind === "conflict"
              ? "Conflito de versões — nada foi sobrescrito"
              : "Sem alterações";

  const tb = (label: string, active: boolean, run: () => void, aria?: string) => (
    <button type="button" className="btn" aria-pressed={active} aria-label={aria ?? label} onClick={run} disabled={!canWrite}>
      {label}
    </button>
  );

  return (
    <EditorContext.Provider value={{ citations, openCitation, xrefLabel }}>
      <PageHead title={`${sectionsById.get(id)?.number ? sectionsById.get(id).number + " " : ""}${meta.title}`}>
        <span className={`save-state ${save.kind === "error" || save.kind === "conflict" ? "error" : "muted"}`} role="status" aria-live="polite">
          {saveLabel}
        </span>
        {save.kind === "error" && editor && (
          <button className="btn btn-small" onClick={() => void doSave(editor)}>
            Tentar novamente
          </button>
        )}
      </PageHead>
      {recovery && (
        <div className="alert warn">
          Existe uma cópia local não gravada de {fmtDateTime(recovery.at)}.{" "}
          <button
            className="btn btn-small"
            onClick={() => {
              editor?.commands.setContent(recovery.doc);
              setRecovery(null);
            }}
          >
            Recuperar cópia local
          </button>{" "}
          <button
            className="btn btn-small"
            onClick={() => {
              clearDraft(id);
              setRecovery(null);
            }}
          >
            Descartar
          </button>
        </div>
      )}
      {meta.guidance && <p className="guidance">Orientação do modelo (não é texto da monografia): {meta.guidance}</p>}
      <div className="editor-layout">
        <div>
          {canWrite && editor && (
            <div className="editor-toolbar" role="toolbar" aria-label="Formatação">
              {tb("B", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), "Negrito")}
              {tb("I", editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), "Itálico")}
              {tb("T2", editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), "Título de nível 2")}
              {tb("T3", editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), "Título de nível 3")}
              {tb("• Lista", editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run())}
              {tb("1. Lista", editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run())}
              <button className="btn btn-primary" onClick={() => setDialog({ attrs: null, pos: null, block: false })}>
                Inserir citação
              </button>
              <button className="btn" onClick={() => setXrefOpen(true)}>
                Referência cruzada
              </button>
              <button
                className="btn"
                onClick={() => {
                  const note = prompt("Nota desta versão (opcional)") ?? undefined;
                  if (editor) void doSave(editor, { checkpoint: true, note });
                }}
              >
                Guardar versão
              </button>
              <button
                className="btn"
                onClick={() => editor && void post(`${base}/sections/${id}/preview`, { doc: editor.getJSON() }).then((r) => setPreviewHtml(r.html), (e) => alert(e.message))}
              >
                Pré-visualizar
              </button>
            </div>
          )}
          <div className="editor-surface">
            <EditorContent editor={editor} aria-label="Texto da secção" />
          </div>
        </div>
        <aside className="stack">
          <div className="row" role="tablist">
            <button role="tab" aria-selected={panel === "info"} className={`btn btn-small ${panel === "info" ? "btn-primary" : ""}`} onClick={() => setPanel("info")}>
              Secção
            </button>
            <button role="tab" aria-selected={panel === "revisions"} className={`btn btn-small ${panel === "revisions" ? "btn-primary" : ""}`} onClick={() => setPanel("revisions")}>
              Versões
            </button>
          </div>
          {panel === "info" ? (
            <>
              <div className="card">
                <div className="field">
                  <label htmlFor="st">Estado declarado</label>
                  <select
                    id="st"
                    value={meta.status}
                    disabled={!canWrite}
                    onChange={(e) => {
                      const status = e.target.value;
                      void patch(`${base}/sections/${id}`, { status }).then(() => setMeta({ ...meta, status }));
                    }}
                  >
                    {Object.entries(SECTION_STATUS).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="muted">{words} palavras (inclui citações diretas; exclui referências).</p>
              </div>
              <div className="card">
                <h2>Citações nesta secção</h2>
                {sectionCitations.length === 0 ? (
                  <p className="muted">Nenhuma.</p>
                ) : (
                  <ol style={{ paddingLeft: "1.2rem" }}>
                    {sectionCitations.map((c) => (
                      <li key={c.id}>
                        {citations[c.id]?.text ?? "por resolver"}
                        {citations[c.id]?.warnings?.length ? <div className="error">{citations[c.id]!.warnings.join(" ")}</div> : null}
                      </li>
                    ))}
                  </ol>
                )}
                <Link to="/app/bibliografia">Abrir biblioteca</Link>
              </div>
            </>
          ) : (
            <Revisions sectionId={id} editor={editor} onRestored={(v) => (versionRef.current = v)} />
          )}
        </aside>
      </div>
      {dialog && (
        <CitationDialog
          initial={dialog.attrs}
          references={refOptions}
          personal={personalOptions}
          onClose={() => setDialog(null)}
          onSubmit={submitCitation}
          onRemove={dialog.pos !== null && canWrite ? removeCitation : undefined}
        />
      )}
      {xrefOpen && (
        <Dialog open title="Inserir referência cruzada" onClose={() => setXrefOpen(false)}>
          <p className="muted">A referência aponta para o ID da secção; a numeração atualiza-se ao reordenar.</p>
          <ul className="toc">
            {initial.sections
              .filter((s: any) => s.id !== id)
              .map((s: any) => (
                <li key={s.id}>
                  <button
                    className="btn-link"
                    onClick={() => {
                      editor?.chain().focus().insertContent({ type: "xref", attrs: { id: crypto.randomUUID(), targetType: s.kind === "appendix" ? "appendix" : "section", targetId: s.id } }).run();
                      setXrefOpen(false);
                    }}
                  >
                    {s.number ? `${s.number} ` : ""}
                    {s.title}
                  </button>
                </li>
              ))}
          </ul>
        </Dialog>
      )}
      {previewHtml !== null && (
        <Dialog open title="Pré-visualização (privada)" onClose={() => setPreviewHtml(null)}>
          <div className="reading" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </Dialog>
      )}
      {conflict && editor && (
        <Dialog
          open
          title="Conflito de versões"
          onClose={() => setConflict(null)}
          footer={
            <>
              <button
                className="btn"
                onClick={() => {
                  writeDraft(id, { doc: editor.getJSON(), baseVersion: conflict.serverVersion, at: new Date().toISOString() });
                  editor.commands.setContent(conflict.serverDoc, { emitUpdate: false });
                  versionRef.current = conflict.serverVersion;
                  setConflict(null);
                  setSave({ kind: "idle" });
                  setRecovery(readDraft(id));
                }}
              >
                Carregar a versão do servidor (a minha fica como cópia local)
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  void doSave(editor, { force: conflict.serverVersion, checkpoint: true, note: "Substituição após conflito" });
                  setConflict(null);
                }}
              >
                Substituir pela minha versão
              </button>
            </>
          }
        >
          <p>Esta secção foi gravada noutra sessão depois de a abrir. Nada foi sobrescrito. Compare e escolha:</p>
          <div className="diff reading card">
            {diffWords(plainText(conflict.serverDoc), plainText(editor.getJSON() as DocNode)).map((p, i) =>
              p.type === "same" ? <span key={i}>{p.text}</span> : p.type === "add" ? <ins key={i}>{p.text}</ins> : <del key={i}>{p.text}</del>,
            )}
          </div>
          <p className="muted">
            <ins>verde</ins>: só na sua versão · <del>vermelho</del>: só na versão do servidor.
          </p>
        </Dialog>
      )}
    </EditorContext.Provider>
  );
}

function Revisions({ sectionId, editor, onRestored }: { sectionId: string; editor: Editor | null; onRestored: (version: number) => void }) {
  const base = useProjectApi();
  const { canWrite } = useSession();
  const list = useAsync(() => get<any[]>(`${base}/sections/${sectionId}/revisions`), [base, sectionId]);
  const [compare, setCompare] = useState<{ rev: any; doc: DocNode } | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="card">
      <h2>Versões</h2>
      <ErrorAlert error={error ?? list.error} />
      {list.loading && !list.data ? (
        <Loading />
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {(list.data ?? []).map((r) => (
            <li key={r.id} style={{ borderBottom: "1px solid var(--border)", padding: "0.4rem 0" }}>
              <strong>#{r.number}</strong> {r.autosave ? <Badge status="" label="automática" /> : <Badge status="ok" label="marco" />} {r.restored_from && <Badge status="earth" label="restauro" />}
              <div className="muted">
                {fmtDateTime(r.updated_at)} · {r.word_count} pal.{r.note ? ` · ${r.note}` : ""}
              </div>
              <button className="btn btn-small" onClick={() => void get(`${base}/sections/${sectionId}/revisions/${r.id}`).then((d) => setCompare({ rev: r, doc: d.doc }))}>
                Comparar com o atual
              </button>
            </li>
          ))}
        </ul>
      )}
      {compare && editor && (
        <Dialog
          open
          title={`Revisão #${compare.rev.number} → texto atual`}
          onClose={() => setCompare(null)}
          footer={
            canWrite ? (
              <button
                className="btn btn-primary"
                onClick={() =>
                  void post(`${base}/sections/${sectionId}/revisions/${compare.rev.id}/restore`).then(
                    (r) => {
                      editor.commands.setContent(compare.doc, { emitUpdate: false });
                      onRestored(r.version);
                      setCompare(null);
                      void list.reload();
                    },
                    (e) => setError(e.message),
                  )
                }
              >
                Restaurar como nova versão
              </button>
            ) : undefined
          }
        >
          <p className="muted">O restauro cria uma nova versão; nenhuma versão é apagada.</p>
          <div className="diff reading">
            {diffWords(plainText(compare.doc), plainText(editor.getJSON() as DocNode)).map((p, i) =>
              p.type === "same" ? <span key={i}>{p.text}</span> : p.type === "add" ? <ins key={i}>{p.text}</ins> : <del key={i}>{p.text}</del>,
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}
