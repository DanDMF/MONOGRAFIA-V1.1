import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { get } from "../../api";
import { useProjectApi } from "../../session";
import { Badge, ErrorAlert, Loading, PageHead, useAsync } from "../../components/ui";

interface Rule {
  id: string;
  title: string;
  category: string;
  origin: string;
  version: string;
  reviewedAt: string;
  summary: string[];
  apaTopic: string;
  auditChecks: string[];
  examples: { label: string; text: string; html: string }[];
  references: { html: string; text: string }[];
}

export function ApaGuidePage() {
  const base = useProjectApi();
  const [params, setParams] = useSearchParams();
  const locale = (params.get("perfil") as "pt-PT" | "en-US" | null) ?? undefined;
  const g = useAsync(() => get<{ locale: string; version: string; reviewedAt: string; officialHome: string; rules: Rule[] }>(`${base}/apa-guide${locale ? `?locale=${locale}` : ""}`), [base, locale]);
  const [q, setQ] = useState("");
  const rules = useMemo(
    () => (g.data?.rules ?? []).filter((r) => !q || (r.title + r.summary.join(" ")).toLowerCase().includes(q.toLowerCase())),
    [g.data, q],
  );
  const focus = params.get("regra");
  if (g.loading && !g.data) return <Loading />;
  if (g.error || !g.data) return <ErrorAlert error={g.error} />;
  const categories = [...new Set(rules.map((r) => r.category))];
  return (
    <>
      <PageHead
        title="Guia APA"
        intro="Regras resumidas com origem, versão e data de revisão. Os exemplos são fictícios e didáticos: são gerados pelo mesmo motor que formata o seu texto e nunca entram na bibliografia."
      >
        <Link className="btn" to="/app/bibliografia/auditoria">
          Abrir auditoria
        </Link>
      </PageHead>
      <div className="row" style={{ marginBottom: "0.75rem" }}>
        <input type="search" aria-label="Pesquisar no guia" placeholder="Pesquisar regra…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 300 }} />
        <label htmlFor="perfil">Perfil dos exemplos</label>
        <select
          id="perfil"
          value={g.data.locale}
          style={{ maxWidth: 220 }}
          onChange={(e) => {
            params.set("perfil", e.target.value);
            setParams(params, { replace: true });
          }}
        >
          <option value="pt-PT">Português (Portugal)</option>
          <option value="en-US">Inglês</option>
        </select>
      </div>
      <p className="muted">
        {g.data.version} · revisto em {g.data.reviewedAt}. Fonte oficial:{" "}
        <a href={g.data.officialHome} target="_blank" rel="noreferrer">
          APA Style — Style and Grammar Guidelines
        </a>{" "}
        (cada regra indica o tópico correspondente). Este guia resume; não substitui o manual nem o regulamento da instituição.
      </p>
      {categories.map((cat) => (
        <section key={cat}>
          <h2>{cat}</h2>
          {rules
            .filter((r) => r.category === cat)
            .map((r) => (
              <article key={r.id} id={`regra-${r.id}`} className="card" style={focus === r.id ? { outline: "3px solid var(--focus)" } : undefined}>
                <h3 style={{ marginTop: 0 }}>{r.title}</h3>
                <p>
                  <Badge status={r.origin === "APA 7" ? "ok" : "earth"} label={`Origem: ${r.origin}`} /> <span className="muted">Revisto em {r.reviewedAt}</span>
                </p>
                <ul>
                  {r.summary.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
                {r.examples.length > 0 && (
                  <div className="table-wrap">
                    <table className="data">
                      <caption className="sr-only">Exemplos didáticos</caption>
                      <thead>
                        <tr>
                          <th>Exemplo didático (fictício)</th>
                          <th>Resultado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.examples.map((e, i) => (
                          <tr key={i}>
                            <td>{e.label}</td>
                            <td className="reading" style={{ fontSize: "1rem" }} dangerouslySetInnerHTML={{ __html: e.html }} />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {r.references.length > 0 && (
                  <>
                    <p className="muted" style={{ marginTop: "0.75rem" }}>
                      Entradas da lista de referências (fictícias):
                    </p>
                    <ul className="bibliography">
                      {r.references.map((b, i) => (
                        <li key={i} dangerouslySetInnerHTML={{ __html: b.html }} />
                      ))}
                    </ul>
                  </>
                )}
                <p className="muted" style={{ marginBottom: 0 }}>
                  Tópico APA Style: {r.apaTopic}
                  {r.auditChecks.length > 0 && <> · Verificado na auditoria: {r.auditChecks.join(", ")}</>}
                </p>
              </article>
            ))}
        </section>
      ))}
    </>
  );
}
