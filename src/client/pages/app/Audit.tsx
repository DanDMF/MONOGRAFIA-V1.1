import { useState } from "react";
import { Link } from "react-router-dom";
import { get, post } from "../../api";
import { useProjectApi, useSession } from "../../session";
import { Badge, Dialog, ErrorAlert, Loading, PageHead, useAsync } from "../../components/ui";
import { fmtDateTime } from "../../format";

const SEV: Record<string, { label: string; status: string }> = {
  structural: { label: "Erro estrutural", status: "failed" },
  incomplete: { label: "Informação incompleta", status: "warn" },
  review: { label: "Revisão humana", status: "earth" },
};

interface Finding {
  key: string;
  check: string;
  severity: string;
  message: string;
  target: { type: string; id: string | null; label: string; link: string | null };
  exception: { id: string; justification: string; created_at: string; user_name: string | null } | null;
}

export function AuditPage() {
  const base = useProjectApi();
  const { canWrite } = useSession();
  const a = useAsync(() => get<any>(`${base}/audit/academic`), [base]);
  const [sev, setSev] = useState<string>("");
  const [showJustified, setShowJustified] = useState(false);
  const [justifying, setJustifying] = useState<Finding | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (a.loading && !a.data) return <Loading what="a auditar o projeto" />;
  if (a.error || !a.data) return <ErrorAlert error={a.error} />;
  const d = a.data;
  const findings: Finding[] = d.findings.filter((f: Finding) => (!sev || f.severity === sev) && (showJustified || !f.exception));
  const checkLabel = (code: string) => d.checks.find((c: any) => c.code === code)?.label ?? code;
  const guideRule = (code: string) => d.checks.find((c: any) => c.code === code)?.guideRule as string | null;
  return (
    <>
      <PageHead title="Auditoria académica" intro={d.disclaimer}>
        <button className="btn" onClick={() => void a.reload()}>
          Executar de novo
        </button>
        <Link className="btn" to="/app/bibliografia/guia">
          Guia APA
        </Link>
      </PageHead>
      <div className="grid grid-3">
        {(["structural", "incomplete", "review"] as const).map((k) => (
          <button key={k} className="card" style={{ textAlign: "left", cursor: "pointer" }} aria-pressed={sev === k} onClick={() => setSev(sev === k ? "" : k)}>
            <div className="stat">{d.summary[k]}</div>
            <div className="stat-label">
              {SEV[k]!.label} {sev === k ? "· filtro ativo" : ""}
            </div>
          </button>
        ))}
      </div>
      <p className="muted" style={{ marginTop: "0.75rem" }}>
        Executada em {fmtDateTime(d.ranAt)} · {d.summary.justified} aviso(s) com justificação aceite.{" "}
        <label className="check" style={{ display: "inline-flex" }}>
          <input type="checkbox" checked={showJustified} onChange={(e) => setShowJustified(e.target.checked)} /> Mostrar justificados
        </label>
      </p>
      <ErrorAlert error={error} />
      {findings.length === 0 ? (
        <div className="alert ok">Sem avisos {sev ? `de “${SEV[sev]!.label}”` : "abertos"}. Isto não certifica a conformidade do trabalho.</div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Gravidade</th>
                <th>Verificação</th>
                <th>Onde</th>
                <th>Descrição</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {findings.map((f) => (
                <tr key={f.key}>
                  <td>
                    <Badge status={SEV[f.severity]!.status} label={SEV[f.severity]!.label} />
                  </td>
                  <td>
                    {checkLabel(f.check)}
                    {guideRule(f.check) && (
                      <div>
                        <Link to={`/app/bibliografia/guia?regra=${guideRule(f.check)}#regra-${guideRule(f.check)}`}>Regra no guia</Link>
                      </div>
                    )}
                  </td>
                  <td>{f.target.link ? <Link to={f.target.link}>{f.target.label}</Link> : f.target.label}</td>
                  <td>
                    {f.message}
                    {f.exception && (
                      <div className="alert ok" style={{ margin: "0.4rem 0 0" }}>
                        Justificado por {f.exception.user_name ?? "—"} em {fmtDateTime(f.exception.created_at)}: {f.exception.justification}
                      </div>
                    )}
                  </td>
                  <td>
                    {canWrite && !f.exception && (
                      <button
                        className="btn btn-small"
                        onClick={() => {
                          setJustifying(f);
                          setText("");
                        }}
                      >
                        Justificar exceção
                      </button>
                    )}
                    {canWrite && f.exception && (
                      <button
                        className="btn btn-small"
                        onClick={() => void post(`${base}/audit/academic/exceptions/${f.exception!.id}/revoke`).then(() => a.reload(), (e) => setError(e.message))}
                      >
                        Revogar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Verificações executadas</h2>
        <ul>
          {d.checks.map((c: any) => (
            <li key={c.code}>
              {c.label} — {c.applicable ? `${c.count} aviso(s) aberto(s)` : c.note} <span className="muted">({SEV[c.severity]!.label})</span>
            </li>
          ))}
        </ul>
      </section>
      {justifying && (
        <Dialog
          open
          title="Justificar exceção"
          onClose={() => setJustifying(null)}
          footer={
            <>
              <button className="btn" onClick={() => setJustifying(null)}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                disabled={text.trim().length < 10}
                onClick={() =>
                  void post(`${base}/audit/academic/exceptions`, { findingKey: justifying.key, justification: text }).then(
                    () => {
                      setJustifying(null);
                      void a.reload();
                    },
                    (e) => setError(e.message),
                  )
                }
              >
                Registar justificação
              </button>
            </>
          }
        >
          <p>
            <strong>{checkLabel(justifying.check)}</strong> — {justifying.message}
          </p>
          {justifying.severity === "structural" && (
            <div className="alert warn">Este é um erro estrutural. Justifique apenas se tiver fundamento (por exemplo, regra institucional diferente).</div>
          )}
          <div className="field">
            <label htmlFor="just">Justificação (fica registada no histórico)</label>
            <textarea id="just" value={text} onChange={(e) => setText(e.target.value)} />
            <span className="hint">Mínimo de 10 caracteres. Pode ser revogada mais tarde.</span>
          </div>
        </Dialog>
      )}
    </>
  );
}
