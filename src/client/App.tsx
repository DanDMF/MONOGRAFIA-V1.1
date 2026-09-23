import { lazy, Suspense, useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { SessionProvider, useSession } from "./session";
import { get } from "./api";
import { Loading } from "./components/ui";
import { LoginPage } from "./pages/app/Login";
import { Dashboard } from "./pages/app/Dashboard";
import { StructurePage } from "./pages/app/Structure";
import { LibraryPage, ReferenceDetailPage, ImportPage } from "./pages/app/Library";
import { EntityPage, ENTITY_ROUTES } from "./pages/app/EntityPage";
import { IndicatorsPage } from "./pages/app/Indicators";
import { ExportsPage } from "./pages/app/Exports";
import { PublicationPage } from "./pages/app/Publication";
import { HistoryPage } from "./pages/app/History";
import { SettingsPage } from "./pages/app/Settings";
import { CoveragePage } from "./pages/app/Coverage";
import { ApaGuidePage } from "./pages/app/ApaGuide";
import { AuditPage } from "./pages/app/Audit";
import { CardDetailPage, CardsPage } from "./pages/app/Cards";
import { PublicHome, PublicLayout, PublicMonograph, PublicReferences, PublicResults, PublicDocuments } from "./pages/public/Public";
import { ReadingPrefs } from "./pages/public/ReadingPrefs";

// O editor (TipTap/ProseMirror) só é carregado na área privada.
const EditorPage = lazy(() => import("./editor/EditorPage").then((m) => ({ default: m.EditorPage })));

export function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route path="/" element={<PublicRoot />} />
        <Route path="/entrar" element={<LoginPage />} />
        <Route path="/p/:slug" element={<PublicLayout />}>
          <Route index element={<PublicHome />} />
          <Route path="monografia" element={<PublicMonograph />} />
          <Route path="monografia/:sectionId" element={<PublicMonograph />} />
          <Route path="referencias" element={<PublicReferences />} />
          <Route path="resultados" element={<PublicResults />} />
          <Route path="documentos" element={<PublicDocuments />} />
          <Route path="leitura" element={<ReadingPrefs />} />
          <Route path="v/:number" element={<PublicHome />} />
          <Route path="v/:number/monografia" element={<PublicMonograph />} />
          <Route path="v/:number/monografia/:sectionId" element={<PublicMonograph />} />
          <Route path="v/:number/referencias" element={<PublicReferences />} />
          <Route path="v/:number/resultados" element={<PublicResults />} />
        </Route>
        <Route path="/app" element={<PrivateLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="escrita/estrutura" element={<StructurePage />} />
          <Route path="escrita/cartoes" element={<CardsPage />} />
          <Route path="escrita/cartoes/:id" element={<CardDetailPage />} />
          <Route path="escrita/editor/:sectionId" element={<Suspense fallback={<Loading what="a abrir o editor" />}><EditorPage /></Suspense>} />
          <Route path="bibliografia" element={<LibraryPage />} />
          <Route path="bibliografia/importar" element={<ImportPage />} />
          <Route path="bibliografia/guia" element={<ApaGuidePage />} />
          <Route path="bibliografia/auditoria" element={<AuditPage />} />
          <Route path="bibliografia/:id" element={<ReferenceDetailPage />} />
          <Route path="analise/indicadores" element={<IndicatorsPage />} />
          <Route path="gestao/exportacoes" element={<ExportsPage />} />
          <Route path="gestao/publicacao" element={<PublicationPage />} />
          <Route path="gestao/historico" element={<HistoryPage />} />
          <Route path="gestao/definicoes" element={<SettingsPage />} />
          <Route path="gestao/cobertura" element={<CoveragePage />} />
          <Route path="dados/:slug" element={<EntityRoute />} />
          <Route path="*" element={<p>Página inexistente.</p>} />
        </Route>
        <Route path="*" element={<p className="container">Página inexistente. <Link to="/">Voltar ao início</Link></p>} />
      </Routes>
    </SessionProvider>
  );
}

function EntityRoute() {
  const { slug } = useParams();
  const r = ENTITY_ROUTES.find((x) => x.slug === slug);
  if (!r) return <p>Tipo de registo inexistente.</p>;
  return <EntityPage key={r.entity} entity={r.entity} />;
}

/** "/" apresenta o projeto público configurado; sem publicação, mostra estado honesto. */
function PublicRoot() {
  const [slug, setSlug] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    get<{ slug: string | null }>("/api/public-config")
      .then((c) => setSlug(c.slug))
      .catch(() => setSlug(null));
  }, []);
  if (slug === undefined) return <Loading />;
  if (slug) return <Navigate to={`/p/${slug}`} replace />;
  return (
    <main className="container hero">
      <h1>VRBAN — Laboratório de Agricultura Urbana Vertical</h1>
      <p className="lead">Investigação em desenvolvimento. Ainda não existe uma versão publicada.</p>
      <p>
        <Link to="/entrar">Entrar na área de investigação</Link>
      </p>
    </main>
  );
}

const NAV: { group: string; items: { to: string; label: string }[]; pending?: string[] }[] = [
  {
    group: "Escrita",
    items: [
      { to: "/app", label: "Painel" },
      { to: "/app/escrita/cartoes", label: "Próximo parágrafo" },
      { to: "/app/escrita/estrutura", label: "Estrutura e editor" },
    ],
    pending: ["Notas e conceitos", "Revisão"],
  },
  {
    group: "Bibliografia",
    items: [
      { to: "/app/bibliografia", label: "Biblioteca" },
      { to: "/app/bibliografia/importar", label: "Importar BibTeX/RIS" },
      { to: "/app/dados/excertos", label: "Excertos" },
      { to: "/app/dados/comunicacoes", label: "Comunicações pessoais" },
      { to: "/app/bibliografia/guia", label: "Guia APA" },
      { to: "/app/bibliografia/auditoria", label: "Auditoria académica" },
    ],
    pending: ["Matriz da literatura", "Pesquisa bibliográfica"],
  },
  {
    group: "Experimento",
    items: [
      { to: "/app/dados/protocolo", label: "Protocolo" },
      { to: "/app/dados/variaveis", label: "Variáveis" },
      { to: "/app/dados/locais", label: "Locais" },
      { to: "/app/dados/estruturas", label: "Estruturas" },
      { to: "/app/dados/culturas", label: "Culturas" },
      { to: "/app/dados/ciclos", label: "Ciclos" },
      { to: "/app/dados/registos", label: "Registos de campo" },
      { to: "/app/dados/colheitas", label: "Colheitas" },
      { to: "/app/dados/consumos", label: "Consumos" },
      { to: "/app/dados/trabalho", label: "Trabalho" },
    ],
    pending: ["Galeria e ficheiros"],
  },
  {
    group: "Análise",
    items: [
      { to: "/app/dados/despesas", label: "Despesas" },
      { to: "/app/dados/reparticoes", label: "Repartições" },
      { to: "/app/dados/ativos", label: "Ativos" },
      { to: "/app/dados/vendas", label: "Vendas" },
      { to: "/app/dados/cambio", label: "Taxas de câmbio" },
      { to: "/app/analise/indicadores", label: "Indicadores" },
    ],
    pending: ["Gráficos", "Cenários", "Qualidade dos dados"],
  },
  {
    group: "Gestão",
    items: [
      { to: "/app/gestao/exportacoes", label: "Exportações" },
      { to: "/app/gestao/publicacao", label: "Publicação" },
      { to: "/app/gestao/historico", label: "Histórico" },
      { to: "/app/gestao/definicoes", label: "Perfil e definições" },
      { to: "/app/gestao/cobertura", label: "Cobertura da especificação" },
    ],
    pending: ["Planeamento", "Backups"],
  },
];

function PrivateLayout() {
  const { me, loading, project, logout, setProjectId } = useSession();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => setOpen(false), [location.pathname]);
  if (loading) return <Loading />;
  if (!me?.user) return <Navigate to={`/entrar?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (!project)
    return (
      <main className="container hero">
        <h1>Sem projeto autorizado</h1>
        <p>Esta conta está autenticada mas não tem acesso a nenhum projeto. O acesso é concedido explicitamente pelo autor (ver README: provisionamento).</p>
        <button className="btn" onClick={() => void logout()}>
          Sair
        </button>
      </main>
    );
  return (
    <>
      {project.is_demo && <div className="demo-banner">Ambiente de demonstração — dados fictícios, não usar como resultados.</div>}
      <a href="#conteudo" className="skip-link">
        Saltar para o conteúdo
      </a>
      <div className="topbar">
        <button className="btn btn-small" aria-expanded={open} aria-controls="sidebar" onClick={() => setOpen(!open)}>
          ☰ Menu
        </button>
        <strong>{project.name}</strong>
        <span className="spacer" />
        <Link className="btn btn-small" to="/app/escrita/cartoes">
          + Ideia
        </Link>
        <Link className="btn btn-small" to="/app/dados/colheitas?novo=1">
          + Colheita
        </Link>
        <Link className="btn btn-small" to="/app/dados/despesas?novo=1">
          + Despesa
        </Link>
        <Link className="btn btn-small" to="/app/dados/registos?novo=1">
          + Registo
        </Link>
      </div>
      <div className="app-shell">
        <nav className="sidebar" id="sidebar" data-open={open} aria-label="Navegação da área de investigação">
          <Link to="/app" className="brand">
            VRBAN<small>Centro de investigação</small>
          </Link>
          {me.projects.length > 1 && (
            <select aria-label="Projeto ativo" value={project.id} onChange={(e) => { setProjectId(e.target.value); navigate("/app"); }}>
              {me.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.is_demo ? " (demo)" : ""}
                </option>
              ))}
            </select>
          )}
          {NAV.map((g) => (
            <div key={g.group}>
              <div className="nav-group">{g.group}</div>
              {g.items.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.to === "/app"}>
                  {i.label}
                </NavLink>
              ))}
              {g.pending?.map((p) => (
                <div key={p} className="pending" title="Especificado; ainda não implementado (ver Cobertura)">
                  {p} · pendente
                </div>
              ))}
            </div>
          ))}
          <div className="nav-group">Conta</div>
          <div className="pending">{me.user.display_name} ({project.role === "author" ? "autor" : "revisor"})</div>
          <a href={`/p/${project.slug}`} target="_blank" rel="noreferrer">
            Ver site público ↗
          </a>
          <button className="btn btn-link" onClick={() => void logout().then(() => navigate("/entrar"))}>
            Sair
          </button>
        </nav>
        <main className="main" id="conteudo" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </>
  );
}
