import { Link } from "react-router-dom";
import { get } from "../../api";
import { useProjectApi, useSession } from "../../session";
import { Badge, ErrorAlert, Loading, PageHead, useAsync } from "../../components/ui";
import { SECTION_STATUS } from "../../../shared/templates";
import { fmtDateTime, fmtNumber } from "../../format";

export function Dashboard() {
  const base = useProjectApi();
  const { project } = useSession();
  const d = useAsync(() => get(`${base}/dashboard`), [base]);
  if (d.loading && !d.data) return <Loading />;
  if (d.error) return <ErrorAlert error={d.error} />;
  const { counts, byStatus, words, inProgress, lastEdited, actions } = d.data;
  return (
    <>
      <PageHead title="Painel" intro={`${project?.name}${project?.academic_title ? " — " + project.academic_title : ""}`}>
        {lastEdited && (
          <Link className="btn btn-primary" to={`/app/escrita/editor/${lastEdited.id}`}>
            Continuar de onde fiquei: {lastEdited.title}
          </Link>
        )}
      </PageHead>
      <div className="grid grid-3">
        <div className="card">
          <div className="stat">{fmtNumber(words, 0)}</div>
          <div className="stat-label">palavras escritas (contagem não mede qualidade)</div>
        </div>
        <div className="card">
          <div className="stat">{counts.references}</div>
          <div className="stat-label">fontes na biblioteca · {counts.unverified_references} por confirmar · {counts.uncited_references} não citadas</div>
        </div>
        <div className="card">
          <div className="stat">{counts.cycles}</div>
          <div className="stat-label">ciclos · {counts.harvests} colheitas · {counts.expenses} despesas</div>
        </div>
      </div>
      <div className="grid grid-2" style={{ marginTop: "1rem" }}>
        <section className="card" aria-labelledby="acoes">
          <h2 id="acoes">Próximas ações</h2>
          {actions.length === 0 ? (
            <p className="muted">Sem pendências detetadas automaticamente. Isto não substitui a revisão do autor.</p>
          ) : (
            <ul>
              {actions.map((a: any, i: number) => (
                <li key={i}>{a.link ? <Link to={a.link}>{a.text}</Link> : a.text}</li>
              ))}
            </ul>
          )}
        </section>
        <section className="card" aria-labelledby="escrita">
          <h2 id="escrita">Secções em curso</h2>
          {inProgress.length === 0 ? (
            <p className="muted">Nenhuma secção em elaboração. Abra a <Link to="/app/escrita/estrutura">estrutura</Link> para começar.</p>
          ) : (
            <ul>
              {inProgress.map((s: any) => (
                <li key={s.id}>
                  <Link to={`/app/escrita/editor/${s.id}`}>
                    {s.number ? `${s.number} ` : ""}
                    {s.title}
                  </Link>{" "}
                  <Badge status={s.status} label={SECTION_STATUS[s.status] ?? s.status} />
                </li>
              ))}
            </ul>
          )}
          <p className="muted">
            Estado declarado:{" "}
            {Object.entries(byStatus)
              .map(([k, v]) => `${SECTION_STATUS[k] ?? k}: ${v}`)
              .join(" · ")}
          </p>
          {lastEdited && <p className="muted">Última edição: {fmtDateTime(lastEdited.updated_at)}</p>}
        </section>
      </div>
    </>
  );
}
