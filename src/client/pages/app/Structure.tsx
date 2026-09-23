import { useState } from "react";
import { Link } from "react-router-dom";
import { get, patch, post } from "../../api";
import { useProjectApi, useSession } from "../../session";
import { Badge, ErrorAlert, Loading, PageHead, useAsync } from "../../components/ui";
import { SECTION_STATUS } from "../../../shared/templates";

interface Sec {
  id: string;
  parent_id: string | null;
  kind: string;
  title: string;
  position: number;
  number: string | null;
  status: string;
  word_count: number | null;
}

export function StructurePage() {
  const base = useProjectApi();
  const { canWrite } = useSession();
  const s = useAsync(() => get<Sec[]>(`${base}/sections`), [base]);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await s.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (s.loading && !s.data) return <Loading />;
  const sections = s.data ?? [];
  const depth = (x: Sec) => {
    let d = 0;
    let p = x.parent_id;
    while (p) {
      d++;
      p = sections.find((y) => y.id === p)?.parent_id ?? null;
    }
    return d;
  };
  const siblings = (x: Sec) => sections.filter((y) => y.parent_id === x.parent_id).sort((a, b) => a.position - b.position);
  const move = (x: Sec, delta: number) => {
    const sib = siblings(x);
    const idx = sib.findIndex((y) => y.id === x.id) + delta;
    if (idx < 0 || idx >= sib.length) return;
    void run(() => post(`${base}/sections/${x.id}/move`, { parent_id: x.parent_id, position: idx + 1 }));
  };
  return (
    <>
      <PageHead
        title="Estrutura da monografia"
        intro="Modelo académico editável (não é uma estrutura universal da APA). Reordenar atualiza a numeração e as referências cruzadas; os IDs e as ligações mantêm-se."
      />
      <ErrorAlert error={error ?? s.error} />
      {canWrite && (
        <form
          className="row card"
          style={{ marginBottom: "1rem" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!newTitle.trim()) return;
            void run(() => post(`${base}/sections`, { title: newTitle, kind: "chapter" }).then(() => setNewTitle("")));
          }}
        >
          <label htmlFor="new-ch" className="sr-only">
            Título do novo capítulo
          </label>
          <input id="new-ch" placeholder="Título de um novo capítulo" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} style={{ maxWidth: 380 }} />
          <button className="btn">+ Capítulo</button>
        </form>
      )}
      <ul className="tree card" style={{ padding: 0 }}>
        {sections.map((x) => (
          <li key={x.id}>
            <div className="tree-row" style={{ paddingLeft: `${0.5 + depth(x) * 1.5}rem` }}>
              <span className="num">{x.number ?? "·"}</span>
              <span className="title">
                <Link to={`/app/escrita/editor/${x.id}`}>{x.title}</Link>
              </span>
              <span className="muted">{x.word_count ? `${x.word_count} pal.` : ""}</span>
              <Badge status={x.status} label={SECTION_STATUS[x.status] ?? x.status} />
              {canWrite && (
                <>
                  <button className="btn btn-small" aria-label={`Subir ${x.title}`} onClick={() => move(x, -1)}>
                    ↑
                  </button>
                  <button className="btn btn-small" aria-label={`Descer ${x.title}`} onClick={() => move(x, 1)}>
                    ↓
                  </button>
                  <button
                    className="btn btn-small"
                    onClick={() => {
                      const t = prompt("Novo título", x.title);
                      if (t && t.trim() && t !== x.title) void run(() => patch(`${base}/sections/${x.id}`, { title: t }));
                    }}
                  >
                    Renomear
                  </button>
                  <button
                    className="btn btn-small"
                    onClick={() => {
                      const t = prompt("Título da subsecção");
                      if (t && t.trim()) void run(() => post(`${base}/sections`, { title: t, parent_id: x.id }));
                    }}
                  >
                    + Subsecção
                  </button>
                  <button
                    className="btn btn-small"
                    onClick={() => {
                      if (confirm(`Arquivar “${x.title}”? O conteúdo e o histórico mantêm-se e pode ser restaurado.`))
                        void run(() => post(`${base}/sections/${x.id}/archive`, { archived: true }));
                    }}
                  >
                    Arquivar
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
