import { useEffect, useState } from "react";
import { get, patch } from "../../api";
import { useProjectApi, useSession } from "../../session";
import { ErrorAlert, Loading, PageHead } from "../../components/ui";

const FIELDS: [string, string, string?][] = [
  ["name", "Nome do projeto (provisório)"],
  ["academic_title", "Título académico (independente do nome)"],
  ["author_name", "Nome do autor"],
  ["author_family", "Apelido(s) para “Como citar”", "Não é inferido do nome completo."],
  ["author_given", "Nome(s) próprio(s) para “Como citar”"],
  ["degree", "Grau"],
  ["institution", "Instituição"],
  ["advisor", "Orientador"],
  ["academic_year", "Ano"],
  ["study_status", "Estado do estudo (público)"],
  ["central_question", "Pergunta central"],
  ["timezone", "Fuso horário"],
  ["default_currency", "Moeda por omissão (ISO)"],
];

export function SettingsPage() {
  const base = useProjectApi();
  const { canWrite, refresh } = useSession();
  const [p, setP] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  useEffect(() => {
    get(`${base}`).then((r) => setP(r.project), (e) => setError(e.message));
  }, [base]);
  if (!p) return error ? <ErrorAlert error={error} /> : <Loading />;
  const save = async () => {
    setError(null);
    try {
      const body: Record<string, unknown> = { version: p.version, citation_locale: p.citation_locale, public_summary: p.public_summary ?? null };
      for (const [k] of FIELDS) body[k] = p[k] ?? null;
      const r = await patch(`${base}`, body);
      setP(r.project);
      setOk(true);
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <PageHead title="Perfil e definições" intro="Dados reais do projeto, preenchidos pelo autor. A camada APA, o perfil institucional e a apresentação web são configurações distintas." />
      <ErrorAlert error={error} />
      {ok && <div className="alert ok">Gravado.</div>}
      <fieldset disabled={!canWrite} className="card">
        <div className="form-grid">
          {FIELDS.map(([k, label, hint]) => (
            <div className="field" key={k}>
              <label htmlFor={`p-${k}`}>{label}</label>
              <input id={`p-${k}`} value={p[k] ?? ""} onChange={(e) => setP({ ...p, [k]: e.target.value })} />
              {hint && <span className="hint">{hint}</span>}
            </div>
          ))}
          <div className="field">
            <label htmlFor="p-loc">Perfil de citação</label>
            <select id="p-loc" value={p.citation_locale} onChange={(e) => setP({ ...p, citation_locale: e.target.value })}>
              <option value="pt-PT">Português (Portugal) — “e”, “s.d.”, “como citado em”</option>
              <option value="en-US">Inglês — “and”, “n.d.”, “as cited in”</option>
            </select>
            <span className="hint">Origem: adaptação localizada do estilo APA 7 (CSL). A grafia original dos títulos nunca é traduzida.</span>
          </div>
          <div className="field wide">
            <label htmlFor="p-sum">Síntese pública</label>
            <textarea id="p-sum" value={p.public_summary ?? ""} onChange={(e) => setP({ ...p, public_summary: e.target.value })} />
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => void save()}>
          Gravar
        </button>
      </fieldset>
      <section className="card">
        <h2>Perfil institucional</h2>
        <p className="muted">
          Pendente (VRB-003-*): regras da instituição (capa, paginação, margens, preliminares) com origem e diferenças face à APA. Até lá, a exportação académica
          usará o perfil APA de estudante documentado em docs/EXPORTS.md.
        </p>
      </section>
    </>
  );
}
