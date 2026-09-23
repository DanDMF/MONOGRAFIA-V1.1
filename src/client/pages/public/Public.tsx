import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useParams } from "react-router-dom";
import { get } from "../../api";
import { Badge, ErrorAlert, INDICATOR_STATUS, Loading, useAsync } from "../../components/ui";
import { fmtDate, fmtNumber } from "../../format";

type Overview = {
  publication: { number: number; label: string; note: string | null; created_at: string };
  project: Record<string, any>;
  sections: { id: string; number: string | null; title: string; depth: number; kind: string; hasContent: boolean; wordCount: number }[];
  bibliography: { entries: { id: string; html: string; text: string }[] } | null;
  indicators: any;
  versions: { number: number; label: string; created_at: string; note: string | null }[];
  howToCite: { reference: { html: string; text: string } | null; inText: string | null } | null;
};

const Ctx = createContext<{ ov: Overview; prefix: string; api: string } | null>(null);
const usePub = () => useContext(Ctx)!;

export function PublicLayout() {
  const { slug, number } = useParams();
  const api = number ? `/api/public/${slug}/v/${number}` : `/api/public/${slug}`;
  const prefix = number ? `/p/${slug}/v/${number}` : `/p/${slug}`;
  const ov = useAsync(() => get<Overview>(api), [api]);
  if (ov.loading && !ov.data) return <Loading />;
  if (ov.error || !ov.data)
    return (
      <main className="container hero">
        <h1>Investigação em desenvolvimento</h1>
        <p className="lead">Ainda não existe uma versão pública disponível{number ? ` (versão ${number} indisponível ou retirada)` : ""}.</p>
      </main>
    );
  const o = ov.data;
  const hasResults = !!o.indicators;
  const hasRefs = !!o.bibliography?.entries.length;
  return (
    <Ctx.Provider value={{ ov: o, prefix, api }}>
      <a href="#conteudo" className="skip-link">
        Saltar para o conteúdo
      </a>
      <header className="site-header">
        <div className="container">
          <Link to={prefix} className="brand">
            {o.project.name}
            <small>Laboratório de Agricultura Urbana Vertical</small>
          </Link>
          <nav className="site-nav" aria-label="Navegação principal">
            <NavLink to={prefix} end>
              Início
            </NavLink>
            <NavLink to={`${prefix}/monografia`}>Monografia</NavLink>
            {hasResults && <NavLink to={`${prefix}/resultados`}>Resultados</NavLink>}
            {hasRefs && <NavLink to={`${prefix}/referencias`}>Referências</NavLink>}
            {!number && <NavLink to={`${prefix}/documentos`}>Documentos</NavLink>}
            <NavLink to={`/p/${slug}/leitura`}>Leitura</NavLink>
          </nav>
        </div>
      </header>
      {number && (
        <div className="demo-banner">
          A consultar a versão {o.publication.label} de {fmtDate(o.publication.created_at.slice(0, 10))}. <Link to={`/p/${slug}`}>Ver versão atual</Link>
        </div>
      )}
      <main id="conteudo" className="container" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="container">
          {o.project.author_name && <>© {o.project.author_name} · </>}Versão publicada {o.publication.label} ({fmtDate(o.publication.created_at.slice(0, 10))}) ·{" "}
          <Link to="/entrar">Área de investigação</Link>
        </div>
      </footer>
    </Ctx.Provider>
  );
}

export function PublicHome() {
  const { ov, prefix } = usePub();
  const p = ov.project;
  useEffect(() => {
    document.title = `${p.name} — ${p.academic_title ?? "Monografia"}`;
  }, [p]);
  const first = ov.sections.find((s) => s.hasContent);
  return (
    <>
      <section className="hero">
        <p className="muted">
          <Badge status="earth" label={p.study_status ?? "Investigação em desenvolvimento"} /> · versão {ov.publication.label} · atualizada em {fmtDate(ov.publication.created_at.slice(0, 10))}
        </p>
        <h1>{p.academic_title ?? p.name}</h1>
        <p className="lead">
          {p.author_name}
          {p.institution ? ` · ${p.institution}` : ""}
          {p.degree ? ` · ${p.degree}` : ""}
        </p>
        {p.central_question && (
          <p className="reading" style={{ fontStyle: "italic" }}>
            Pergunta central: {p.central_question}
          </p>
        )}
        {p.public_summary && <p style={{ maxWidth: "70ch" }}>{p.public_summary}</p>}
        <div className="row">
          {first && (
            <Link className="btn btn-primary" to={`${prefix}/monografia/${first.id}`}>
              Explorar monografia
            </Link>
          )}
          {ov.indicators && (
            <Link className="btn" to={`${prefix}/resultados`}>
              Ver resultados
            </Link>
          )}
        </div>
      </section>
      <section aria-labelledby="percurso">
        <h2 id="percurso">Percurso da investigação</h2>
        <div className="narrative">
          {[
            ["Problema", "intro"],
            ["Método", "methodology"],
            ["Resultados", "results"],
            ["Discussão e limites", "discussion"],
            ["Conclusões", "conclusions"],
          ].map(([label]) => (
            <div key={label} className="step">
              <b>{label}</b>
              {ov.sections.some((s) => s.hasContent && s.title.toLowerCase().includes(label!.split(" ")[0]!.toLowerCase())) ? "Disponível na monografia." : "Em desenvolvimento."}
            </div>
          ))}
        </div>
      </section>
      {ov.howToCite?.reference && (
        <section className="card" aria-labelledby="citar">
          <h2 id="citar">Como citar este projeto</h2>
          <p className="bibliography" dangerouslySetInnerHTML={{ __html: ov.howToCite.reference.html }} />
          <p className="muted">No texto: {ov.howToCite.inText}. Cita a versão {ov.publication.label}; não existe DOI atribuído.</p>
        </section>
      )}
    </>
  );
}

export function PublicMonograph() {
  const { ov, prefix, api } = usePub();
  const { sectionId } = useParams();
  const current = sectionId ?? ov.sections.find((s) => s.hasContent)?.id;
  const sec = useAsync(async () => (current ? get<any>(`${api}/sections/${current}`) : null), [api, current]);
  const readable = ov.sections.filter((s) => s.hasContent);
  const idx = readable.findIndex((s) => s.id === current);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (sec.data) document.title = `${sec.data.number ? sec.data.number + " " : ""}${sec.data.title} — ${ov.project.name}`;
  }, [sec.data, ov.project.name]);
  const toc = useMemo(() => ov.sections.filter((s) => !q || s.title.toLowerCase().includes(q.toLowerCase())), [ov.sections, q]);
  return (
    <div className="with-toc">
      <nav aria-label="Índice">
        <h2 style={{ marginTop: 0 }}>Índice</h2>
        <input type="search" aria-label="Pesquisar no índice" placeholder="Pesquisar secção…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 8 }} />
        <ul className="toc">
          {toc.map((s) =>
            s.hasContent ? (
              <li key={s.id} style={{ paddingLeft: `${s.depth}rem` }}>
                <Link to={`${prefix}/monografia/${s.id}`} aria-current={s.id === current ? "page" : undefined}>
                  {s.number ? `${s.number} ` : ""}
                  {s.title}
                </Link>
              </li>
            ) : (
              <li key={s.id} className="unavailable" style={{ paddingLeft: `${s.depth + 0.5}rem` }}>
                {s.number ? `${s.number} ` : ""}
                {s.title}
              </li>
            ),
          )}
        </ul>
      </nav>
      <article>
        <ErrorAlert error={sec.error} />
        {sec.loading && !sec.data ? (
          <Loading />
        ) : sec.data ? (
          <>
            <h1>
              {sec.data.number ? `${sec.data.number} ` : ""}
              {sec.data.title}
            </h1>
            <div
              className="reading"
              dangerouslySetInnerHTML={{ __html: sec.data.html ?? "<p>Secção em desenvolvimento.</p>" }}
              onClick={(e) => {
                const a = (e.target as HTMLElement).closest("a.xref") as HTMLAnchorElement | null;
                if (a && a.getAttribute("href")?.startsWith("#sec-")) {
                  e.preventDefault();
                  window.location.assign(`${prefix}/monografia/${a.getAttribute("href")!.slice(5)}`);
                }
              }}
            />
            <nav className="row" aria-label="Navegação entre secções" style={{ marginTop: "2rem" }}>
              {idx > 0 && <Link to={`${prefix}/monografia/${readable[idx - 1]!.id}`}>← {readable[idx - 1]!.title}</Link>}
              <span className="spacer" />
              {idx >= 0 && idx < readable.length - 1 && <Link to={`${prefix}/monografia/${readable[idx + 1]!.id}`}>{readable[idx + 1]!.title} →</Link>}
            </nav>
          </>
        ) : (
          <p>Nenhuma secção publicada.</p>
        )}
      </article>
    </div>
  );
}

export function PublicReferences() {
  const { ov } = usePub();
  const [q, setQ] = useState("");
  const entries = (ov.bibliography?.entries ?? []).filter((e) => e.text.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <h1 style={{ marginTop: "1.5rem" }}>Referências</h1>
      <p className="muted">Obras citadas na versão {ov.publication.label} (APA 7). Comunicações pessoais não constam da lista.</p>
      <input type="search" aria-label="Filtrar referências" placeholder="Filtrar por autor, título, ano…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 420, marginBottom: "1rem" }} />
      <ul className="bibliography">
        {entries.map((e) => (
          <li key={e.id} dangerouslySetInnerHTML={{ __html: e.html }} />
        ))}
      </ul>
    </>
  );
}

export function PublicResults() {
  const { ov } = usePub();
  const ind = ov.indicators;
  if (!ind) return <p>Sem resultados publicados.</p>;
  const fmtVal = (x: any) => (x.value === null ? "—" : x.unit.startsWith("fração") ? `${fmtNumber(Number(x.value) * 100, 1)}%` : fmtNumber(x.value, 2));
  return (
    <>
      <h1 style={{ marginTop: "1.5rem" }}>Resultados</h1>
      <p className="muted" style={{ maxWidth: "70ch" }}>
        Indicadores calculados em {fmtDate(ind.computedAt.slice(0, 10))} (versão do cálculo {ind.formulaVersion}) a partir dos dados registados. Valores por ciclo, não anualizados;
        “Dados insuficientes” indica medições em falta, não zero. Abra cada indicador para ver definição, fórmula e cobertura.
      </p>
      {ind.results.map((c: any, i: number) => (
        <section key={i} className="card">
          <h2>
            Ciclo {c.cycle.code} — {c.cycle.crop}
          </h2>
          <p className="muted">
            {c.cycle.start_date ? fmtDate(c.cycle.start_date) : "?"} → {c.cycle.end_date ? fmtDate(c.cycle.end_date) : "?"}
          </p>
          <div className="table-wrap">
            <table className="data">
              <caption className="sr-only">Indicadores do ciclo {c.cycle.code}</caption>
              <thead>
                <tr>
                  <th>Indicador</th>
                  <th className="num">Valor</th>
                  <th>Unidade</th>
                  <th>Estado</th>
                  <th>Definição</th>
                </tr>
              </thead>
              <tbody>
                {c.indicators.map((x: any) => (
                  <tr key={x.code + (x.currency ?? "")}>
                    <td>{x.label}</td>
                    <td className="num">{fmtVal(x)}</td>
                    <td>{x.unit}</td>
                    <td>
                      <Badge status={x.status} label={INDICATOR_STATUS[x.status] ?? x.status} />
                    </td>
                    <td>
                      <details>
                        <summary>Cálculo</summary>
                        <p>{x.formula}</p>
                        {x.coverage && (
                          <p>
                            Cobertura: {x.coverage.used}/{x.coverage.total} registos
                          </p>
                        )}
                        {x.notes.map((n: string, k: number) => (
                          <p key={k} className="muted">
                            {n}
                          </p>
                        ))}
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}

export function PublicDocuments() {
  const { ov } = usePub();
  const { slug } = useParams();
  return (
    <>
      <h1 style={{ marginTop: "1.5rem" }}>Documentos e versões</h1>
      <p className="muted">Cada versão publicada é um registo fixo. Versões retiradas deixam de estar disponíveis aqui.</p>
      <ul>
        {ov.versions.map((v) => (
          <li key={v.number}>
            <Link to={`/p/${slug}/v/${v.number}`}>{v.label}</Link> — {fmtDate(v.created_at.slice(0, 10))}
            {v.note ? ` · ${v.note}` : ""}
          </li>
        ))}
      </ul>
      <p className="muted">Exportações DOCX/PDF da monografia: pendentes nesta fase de desenvolvimento.</p>
    </>
  );
}
