import { useState } from "react";
import { get } from "../../api";
import { useProjectApi } from "../../session";
import { ErrorAlert, Loading, PageHead, useAsync } from "../../components/ui";
import { fmtDateTime } from "../../format";

export function HistoryPage() {
  const base = useProjectApi();
  const [type, setType] = useState("");
  const a = useAsync(() => get<any[]>(`${base}/audit?limit=300${type ? `&entityType=${type}` : ""}`), [base, type]);
  return (
    <>
      <PageHead title="Histórico" intro="Registo de auditoria: criações, alterações (com valores anteriores), arquivos, publicações e exportações." />
      <select aria-label="Filtrar por tipo" value={type} onChange={(e) => setType(e.target.value)} style={{ maxWidth: 240, marginBottom: "0.75rem" }}>
        <option value="">Todos os tipos</option>
        {["section", "reference", "harvest", "expense", "allocation", "cycle", "publication", "xlsx", "project"].map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <ErrorAlert error={a.error} />
      {a.loading && !a.data ? (
        <Loading />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Quem</th>
                <th>Ação</th>
                <th>Tipo</th>
                <th>Resumo</th>
              </tr>
            </thead>
            <tbody>
              {(a.data ?? []).map((e) => (
                <tr key={e.id}>
                  <td>{fmtDateTime(e.created_at)}</td>
                  <td>{e.user_name ?? "sistema"}</td>
                  <td>{e.action}</td>
                  <td>{e.entity_type}</td>
                  <td>{e.summary ?? <span className="mono muted">{e.entity_id?.slice(0, 8)}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
