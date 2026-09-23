import { useState } from "react";
import { Link } from "react-router-dom";
import { get } from "../../api";
import { useProjectApi } from "../../session";
import { Badge, Dialog, ErrorAlert, INDICATOR_STATUS, Loading, PageHead, useAsync } from "../../components/ui";
import { fmtNumber } from "../../format";

export function IndicatorsPage() {
  const base = useProjectApi();
  const r = useAsync(() => get(`${base}/indicators`), [base]);
  const [detail, setDetail] = useState<any>(null);
  if (r.loading && !r.data) return <Loading />;
  if (r.error) return <ErrorAlert error={r.error} />;
  const d = r.data;
  const fmtVal = (x: any) => (x.value === null ? "—" : x.unit.startsWith("fração") ? `${fmtNumber(Number(x.value) * 100, 2)}%` : fmtNumber(x.value, 3));
  const Table = ({ rows }: { rows: any[] }) => (
    <div className="table-wrap">
      <table className="data">
        <caption className="sr-only">Indicadores</caption>
        <thead>
          <tr>
            <th>Indicador</th>
            <th className="num">Valor</th>
            <th>Unidade</th>
            <th>Estado</th>
            <th>Cobertura</th>
            <th>Cálculo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x, i) => (
            <tr key={i}>
              <td>{x.label}</td>
              <td className="num">{fmtVal(x)}</td>
              <td>{x.unit}</td>
              <td>
                <Badge status={x.status} label={INDICATOR_STATUS[x.status] ?? x.status} />
              </td>
              <td>{x.coverage ? `${x.coverage.used}/${x.coverage.total}` : "—"}</td>
              <td>
                <button className="btn btn-small" onClick={() => setDetail(x)}>
                  Ver cálculo
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <>
      <PageHead
        title="Indicadores"
        intro={`Cálculos centralizados no servidor · versão ${d.formulaVersion}. Cada valor abre a definição, os dados usados e as exclusões. Não anualizados.`}
      >
        <Link className="btn" to="/app/gestao/exportacoes">
          Exportar para Excel
        </Link>
      </PageHead>
      {d.perCycle.length === 0 && <p className="muted">Sem ciclos registados. Os indicadores aparecem quando existirem estruturas, ciclos e colheitas reais.</p>}
      {d.unallocated.length > 0 && (
        <div className="alert warn">
          Parte de {d.unallocated.length} despesa(s) ainda não está atribuída a ciclos ({d.unallocated.map((u: any) => `${fmtNumber(u.unallocatedAmount)} ${u.currency}`).join("; ")}).{" "}
          <Link to="/app/dados/reparticoes">Rever repartições</Link>
        </div>
      )}
      {d.aggregate.length > 0 && d.perCycle.length > 1 && (
        <section className="card">
          <h2>Agregado dos ciclos</h2>
          <Table rows={d.aggregate} />
        </section>
      )}
      {d.perCycle.map((c: any) => (
        <section key={c.cycle.id} className="card">
          <h2>
            Ciclo {c.cycle.code} — {c.cycle.crop_name}
            {c.cycle.crop_variety ? ` (${c.cycle.crop_variety})` : ""}
          </h2>
          <p className="muted">
            Estrutura {c.cycle.structure_code} · fração de área {fmtNumber(Number(c.cycle.area_fraction) * 100)}% · {c.cycle.start_date ?? "início ?"} → {c.cycle.end_date ?? "fim ?"}
          </p>
          <Table rows={c.results} />
        </section>
      ))}
      {detail && (
        <Dialog open title={detail.label} onClose={() => setDetail(null)}>
          <dl className="kv">
            <dt>Código</dt>
            <dd className="mono">{detail.code}</dd>
            <dt>Fórmula</dt>
            <dd>{detail.formula}</dd>
            <dt>Valor</dt>
            <dd>
              {detail.value ?? "—"} {detail.unit}
            </dd>
            <dt>Numerador</dt>
            <dd>{detail.numerator ?? "—"}</dd>
            <dt>Denominador</dt>
            <dd>{detail.denominator ?? "—"}</dd>
            <dt>Estado</dt>
            <dd>{INDICATOR_STATUS[detail.status]}</dd>
            <dt>Versão do cálculo</dt>
            <dd>{detail.formulaVersion}</dd>
            <dt>Registos usados</dt>
            <dd>{detail.inputs?.length ? detail.inputs.map((i: any) => `${i.table}:${i.id.slice(0, 8)}`).join(", ") : "nenhum"}</dd>
          </dl>
          {detail.notes?.length > 0 && (
            <ul>
              {detail.notes.map((n: string, i: number) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </Dialog>
      )}
    </>
  );
}
