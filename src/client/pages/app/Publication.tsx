import { useState } from "react";
import { get, post } from "../../api";
import { useProjectApi, useSession } from "../../session";
import { Badge, ErrorAlert, Loading, PageHead, useAsync } from "../../components/ui";
import { fmtDateTime } from "../../format";

export function PublicationPage() {
  const base = useProjectApi();
  const { canWrite, project } = useSession();
  const sections = useAsync(() => get<any[]>(`${base}/sections`), [base]);
  const pubs = useAsync(() => get<any[]>(`${base}/publications`), [base]);
  const auditRes = useAsync(() => get<any>(`${base}/audit/academic`), [base]);
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [indicators, setIndicators] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  if (sections.loading && !sections.data) return <Loading />;
  const withContent = (sections.data ?? []).filter((s) => s.word_count > 0);
  const publish = async () => {
    if (!confirm(`Publicar ${selected.length} secção(ões) como nova versão pública? Rascunhos posteriores não alteram esta versão.`)) return;
    setError(null);
    try {
      const r = await post(`${base}/publications`, { sectionIds: selected, note: note || undefined, includeIndicators: indicators });
      setOk(`Publicada a versão ${r.label}.${r.manifest.citationWarnings.length ? ` Atenção: ${r.manifest.citationWarnings.length} citação(ões) com avisos.` : ""}`);
      setSelected([]);
      setNote("");
      void pubs.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <PageHead title="Publicação" intro="Cada publicação é um snapshot imutável do texto, citações, bibliografia do escopo e indicadores escolhidos. Os visitantes só veem versões publicadas.">
        {project && (
          <a className="btn" href={`/p/${project.slug}`} target="_blank" rel="noreferrer">
            Ver como visitante ↗
          </a>
        )}
      </PageHead>
      <ErrorAlert error={error ?? sections.error ?? pubs.error} />
      {ok && <div className="alert ok">{ok}</div>}
      {canWrite && (
        <section className="card stack">
          <h2>Nova versão</h2>
          {auditRes.data && (auditRes.data.summary.structural > 0 || auditRes.data.summary.incomplete > 0) && (
            <div className="alert warn">
              A auditoria académica tem {auditRes.data.summary.structural} erro(s) estrutural(is) e {auditRes.data.summary.incomplete} informação(ões) incompleta(s).{" "}
              <a href="/app/bibliografia/auditoria">Rever antes de publicar</a> (a publicação não é bloqueada).
            </div>
          )}
          {withContent.length === 0 ? (
            <p className="muted">Nenhuma secção com texto. Escreva primeiro no editor.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0 }}>
              {withContent.map((s) => (
                <li key={s.id}>
                  <label className="check">
                    <input type="checkbox" checked={selected.includes(s.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, s.id] : selected.filter((x) => x !== s.id))} />
                    {s.number ? `${s.number} ` : ""}
                    {s.title} <span className="muted">({s.word_count} pal.)</span> <Badge status={s.status} label={s.status} />
                  </label>
                </li>
              ))}
            </ul>
          )}
          <label className="check">
            <input type="checkbox" checked={indicators} onChange={(e) => setIndicators(e.target.checked)} /> Incluir indicadores calculados (valores, fórmulas e cobertura; sem registos privados)
          </label>
          <div className="field">
            <label htmlFor="note">Nota de versão</label>
            <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Principais alterações" />
          </div>
          <div>
            <button className="btn btn-primary" disabled={!selected.length} onClick={() => void publish()}>
              Publicar {selected.length} secção(ões)
            </button>
          </div>
        </section>
      )}
      <section className="card">
        <h2>Versões</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Versão</th>
                <th>Data</th>
                <th>Nota</th>
                <th>Conteúdo</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(pubs.data ?? []).map((p) => (
                <tr key={p.id}>
                  <td>{p.label}</td>
                  <td>{fmtDateTime(p.created_at)}</td>
                  <td>{p.note ?? "—"}</td>
                  <td>
                    {p.manifest.sections.length} secção(ões) · {p.manifest.bibliographyCount} referências{p.manifest.indicators ? " · indicadores" : ""}
                  </td>
                  <td>{p.withdrawn_at ? <Badge status="failed" label="Retirada" /> : p.is_current ? <Badge status="ok" label="Apresentada" /> : <Badge status="" label="Arquivo" />}</td>
                  <td className="row">
                    {canWrite && !p.withdrawn_at && !p.is_current && (
                      <button className="btn btn-small" onClick={() => void post(`${base}/publications/${p.id}/current`).then(() => pubs.reload())}>
                        Apresentar esta
                      </button>
                    )}
                    {canWrite && !p.withdrawn_at && (
                      <button
                        className="btn btn-small btn-danger"
                        onClick={() => {
                          if (confirm("Retirar esta versão? Deixa de estar acessível no site. Downloads já efetuados por terceiros não podem ser recolhidos."))
                            void post(`${base}/publications/${p.id}/withdraw`).then(() => pubs.reload());
                        }}
                      >
                        Retirar
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
