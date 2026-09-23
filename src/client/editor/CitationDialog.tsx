import { useEffect, useMemo, useState } from "react";
import { post } from "../api";
import { useProjectApi } from "../session";
import { Dialog, ErrorAlert } from "../components/ui";
import { BLOCK_QUOTE_MIN_WORDS, countWords, type CitationAttrs, type CitationMode } from "../../shared/doc";

export interface RefOption {
  id: string;
  label: string;
}

const MODES: { value: CitationMode; label: string; help: string }[] = [
  { value: "parenthetical", label: "Parentética", help: "(Silva, 2024) — paráfrase ou referência geral. Página opcional." },
  { value: "narrative", label: "Narrativa", help: "Silva (2024) — o autor faz parte da frase. Várias obras só se forem dos mesmos autores." },
  { value: "quote_short", label: "Citação direta curta", help: "Menos de 40 palavras, entre aspas, com localizador obrigatório." },
  { value: "quote_block", label: "Citação em bloco", help: "40 palavras ou mais, em bloco recuado, sem aspas externas, com localizador." },
  { value: "secondary", label: "Fonte secundária", help: "Almeida (1998, como citado em Costa, 2023): só a obra consultada entra nas referências." },
  { value: "personal", label: "Comunicação pessoal", help: "Não recuperável; citada no texto e excluída da lista de referências." },
];

const LOCATORS: Record<string, string> = {
  page: "Página impressa (p./pp.)",
  paragraph: "Parágrafo",
  section: "Secção",
  timestamp: "Tempo (audiovisual)",
  chapter: "Capítulo",
  figure: "Figura",
  table: "Tabela",
};

export function CitationDialog({
  initial,
  references,
  personal,
  onClose,
  onSubmit,
  onRemove,
}: {
  initial: CitationAttrs | null;
  references: RefOption[];
  personal: RefOption[];
  onClose: () => void;
  onSubmit: (attrs: CitationAttrs) => void;
  onRemove?: () => void;
}) {
  const base = useProjectApi();
  const [attrs, setAttrs] = useState<CitationAttrs>(
    () => initial ?? { id: crypto.randomUUID(), mode: "parenthetical", items: [], quote: null, narrative: false },
  );
  const [pick, setPick] = useState("");
  const [filter, setFilter] = useState("");
  const [preview, setPreview] = useState<{ text: string; warnings: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isPersonal = attrs.mode === "personal";
  const options = isPersonal ? personal : references;
  const filtered = useMemo(() => options.filter((o) => o.label.toLowerCase().includes(filter.toLowerCase())).slice(0, 200), [options, filter]);
  const words = countWords(attrs.quote ?? "");
  const isQuote = attrs.mode === "quote_short" || attrs.mode === "quote_block";

  // Pré-visualização APA no contexto do projeto (desambiguação real)
  useEffect(() => {
    if (!attrs.items.length) {
      setPreview(null);
      return;
    }
    const t = setTimeout(() => {
      post(`${base}/citations/preview`, { citation: attrs })
        .then((r) => {
          setPreview(r);
          setError(null);
        })
        .catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [attrs, base]);

  const addItem = (id: string) => {
    if (!id || attrs.items.some((i) => i.referenceId === id || i.personalId === id)) return;
    const item = isPersonal ? { personalId: id } : { referenceId: id, locatorLabel: isQuote ? "page" : null, locator: null };
    setAttrs({ ...attrs, items: [...attrs.items, item] });
    setPick("");
  };
  const setMode = (mode: CitationMode) => {
    const switchKind = (mode === "personal") !== isPersonal;
    setAttrs({ ...attrs, mode, items: switchKind ? [] : attrs.items });
  };
  const labelOf = (id?: string | null) => options.find((o) => o.id === id)?.label ?? id ?? "";

  const problems: string[] = [];
  if (!attrs.items.length) problems.push("Escolha pelo menos uma fonte.");
  if (isQuote && !attrs.quote?.trim() && attrs.mode === "quote_short") problems.push("Introduza o excerto citado.");
  if (attrs.mode === "quote_short" && words >= BLOCK_QUOTE_MIN_WORDS) problems.push(`O excerto tem ${words} palavras: com 40 ou mais, use citação em bloco.`);
  if (attrs.mode === "quote_block" && attrs.quote && words < BLOCK_QUOTE_MIN_WORDS) problems.push(`O excerto tem ${words} palavras: com menos de 40, use citação curta.`);
  if (attrs.mode === "secondary" && !attrs.secondaryAuthor?.trim()) problems.push("Indique o autor da obra original mencionada.");
  if (attrs.mode === "secondary" && attrs.items.length > 1) problems.push("Fonte secundária: escolha apenas a obra consultada.");

  return (
    <Dialog
      open
      title={initial ? "Citação" : "Inserir citação"}
      onClose={onClose}
      footer={
        <>
          {onRemove && (
            <button className="btn btn-danger" onClick={onRemove}>
              Remover citação
            </button>
          )}
          {preview && (
            <button className="btn" onClick={() => void navigator.clipboard.writeText(preview.text)}>
              Copiar citação
            </button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={problems.length > 0 && !(problems.length === 1 && problems[0]!.includes("palavras"))} onClick={() => onSubmit(attrs)}>
            {initial ? "Atualizar" : "Inserir"}
          </button>
        </>
      }
    >
      <ErrorAlert error={error} />
      <p className="muted" style={{ marginTop: 0 }}>
        Dúvidas sobre a forma correta? <a href="/app/bibliografia/guia" target="_blank" rel="noreferrer">Abrir o Guia APA</a> (exemplos didáticos).
      </p>
      <fieldset>
        <legend>Modalidade</legend>
        {MODES.map((m) => (
          <label key={m.value} className="check" style={{ alignItems: "flex-start", marginBottom: 4 }}>
            <input type="radio" name="mode" checked={attrs.mode === m.value} onChange={() => setMode(m.value)} disabled={!!initial && (m.value === "quote_block") !== (initial.mode === "quote_block")} />
            <span>
              <strong>{m.label}</strong> <span className="muted">— {m.help}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>{isPersonal ? "Comunicação pessoal" : "Fontes"}</legend>
        {attrs.items.map((it, i) => (
          <div key={i} className="row" style={{ marginBottom: 6 }}>
            <span style={{ flex: 2, minWidth: 200 }}>{labelOf(it.referenceId ?? it.personalId)}</span>
            {!isPersonal && (
              <>
                <select aria-label="Tipo de localizador" value={it.locatorLabel ?? ""} style={{ width: 170 }} onChange={(e) => setAttrs({ ...attrs, items: attrs.items.map((x, j) => (j === i ? { ...x, locatorLabel: e.target.value || null } : x)) })}>
                  <option value="">Sem localizador</option>
                  {Object.entries(LOCATORS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
                <input aria-label="Localizador" placeholder={it.locatorLabel === "page" ? "ex.: 18 ou 18-20" : "valor"} style={{ width: 120 }} value={it.locator ?? ""} onChange={(e) => setAttrs({ ...attrs, items: attrs.items.map((x, j) => (j === i ? { ...x, locator: e.target.value || null, locatorLabel: x.locatorLabel ?? "page" } : x)) })} />
              </>
            )}
            <button className="btn btn-small" aria-label="Remover fonte" onClick={() => setAttrs({ ...attrs, items: attrs.items.filter((_, j) => j !== i) })}>
              ✕
            </button>
          </div>
        ))}
        <div className="row">
          <input aria-label="Filtrar fontes" placeholder="Filtrar…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 180 }} />
          <select aria-label="Adicionar fonte" value={pick} onChange={(e) => addItem(e.target.value)} style={{ flex: 1, minWidth: 220 }}>
            <option value="">{options.length ? "+ Adicionar…" : isPersonal ? "Sem comunicações registadas" : "Biblioteca vazia"}</option>
            {filtered.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {!isPersonal && <p className="hint muted">A página impressa da fonte é distinta da página do ficheiro PDF. Não inventar números de página.</p>}
      </fieldset>
      {attrs.mode === "quote_short" && (
        <div className="field">
          <label htmlFor="q">Excerto literal ({words} palavras)</label>
          <textarea id="q" value={attrs.quote ?? ""} onChange={(e) => setAttrs({ ...attrs, quote: e.target.value })} />
          <span className="hint">Omissões com “…”, interpolações entre [ ]; indicar ênfase acrescentada e tradução própria no sufixo.</span>
        </div>
      )}
      {attrs.mode === "quote_block" && !initial && (
        <div className="field">
          <label htmlFor="qb">Excerto literal ({words} palavras)</label>
          <textarea id="qb" rows={6} value={attrs.quote ?? ""} onChange={(e) => setAttrs({ ...attrs, quote: e.target.value })} />
          <span className="hint">Será inserido como bloco editável; o parêntese fica depois da pontuação final.</span>
        </div>
      )}
      {attrs.mode === "secondary" && (
        <div className="form-grid">
          <div className="field">
            <label htmlFor="sa">Autor da obra original</label>
            <input id="sa" value={attrs.secondaryAuthor ?? ""} onChange={(e) => setAttrs({ ...attrs, secondaryAuthor: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="sy">Ano da obra original (se conhecido)</label>
            <input id="sy" value={attrs.secondaryYear ?? ""} onChange={(e) => setAttrs({ ...attrs, secondaryYear: e.target.value })} />
            <span className="hint">Não inventar a data original.</span>
          </div>
        </div>
      )}
      {(attrs.mode === "secondary" || attrs.mode === "personal") && (
        <label className="check">
          <input type="checkbox" checked={!!attrs.narrative} onChange={(e) => setAttrs({ ...attrs, narrative: e.target.checked })} /> Forma narrativa
        </label>
      )}
      {problems.length > 0 && (
        <ul className="alert warn" style={{ paddingLeft: "1.5rem" }}>
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <div className="card" aria-live="polite">
        <strong>Pré-visualização APA:</strong>{" "}
        {preview ? (
          <>
            {attrs.mode === "quote_short" && attrs.quote ? `“${attrs.quote}” ` : ""}
            {preview.text}
            {preview.warnings.length > 0 && <div className="error">{preview.warnings.join(" ")}</div>}
          </>
        ) : (
          <span className="muted">escolha uma fonte</span>
        )}
      </div>
    </Dialog>
  );
}
