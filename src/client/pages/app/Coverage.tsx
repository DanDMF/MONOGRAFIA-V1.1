import { PageHead } from "../../components/ui";

const ROWS: [string, string, string][] = [
  ["Fundação: autenticação, permissões, auditoria, fila, armazenamento", "Implementado e verificado (testes)", "ok"],
  ["Estrutura académica, editor estruturado, versões, conflitos, referências cruzadas", "Implementado; editor verificado por testes de API", "ok"],
  ["Biblioteca, APA 7 (CSL), citações como objetos, importação BibTeX/RIS/CSL-JSON, fusão", "Implementado e verificado (testes)", "ok"],
  ["Publicação por snapshot imutável, site público, “Como citar”", "Implementado e verificado (testes)", "ok"],
  ["Protocolo, variáveis, locais, estruturas, culturas, ciclos, registos, colheitas, consumos, trabalho", "Implementado (formulários genéricos)", "ok"],
  ["Despesas, repartições, ativos, vendas, câmbio, indicadores", "Implementado e verificado (testes)", "ok"],
  ["Exportação XLSX (fila) e CSV; verificação independente LibreOffice/openpyxl", "Implementado e verificado", "ok"],
  ["DOCX/PDF, pacote reproduzível", "Pendente", "warn"],
  ["Gráficos, cenários/sensibilidade, VAL/TIR", "Pendente", "warn"],
  ["Caixa de entrada universal, OCR, conhecimento/afirmações, assistente", "Pendente", "warn"],
  ["Próximo parágrafo, notas/conceitos, matriz da literatura, matriz de coerência, auditoria académica", "Pendente", "warn"],
  ["Importação Excel/CSV de dados, backups e restauro", "Pendente", "warn"],
];

export function CoveragePage() {
  return (
    <>
      <PageHead title="Cobertura da especificação" intro="Resumo do estado real. A matriz granular (IDs VRB-NNN-NNN, fase, estado e evidência) está em docs/REQUIREMENTS.md no repositório." />
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Módulo</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([m, s, k]) => (
              <tr key={m}>
                <td>{m}</td>
                <td>
                  <span className={`badge ${k}`}>{s}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
