// Percurso académico completo pela API (secção E): acesso do autor → fonte → secção → citação APA →
// bibliografia → gravação persistente → publicação isolada. Inclui autorização e conflitos.
import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, createProject, createUser, setupTestApp } from "./helpers.js";

let env: Awaited<ReturnType<typeof setupTestApp>>;
let author: Client;
let projectId: string;
const P = () => `/api/projects/${projectId}`;

const para = (...content: unknown[]) => ({ type: "paragraph", content });
const text = (t: string) => ({ type: "text", text: t });
const citation = (id: string, referenceId: string, extra: Record<string, unknown> = {}) => ({
  type: "citation",
  attrs: { id, mode: "parenthetical", items: [{ referenceId }], ...extra },
});

beforeAll(async () => {
  env = await setupTestApp();
  const uid = await createUser(env.pool, "autor@exemplo.org");
  projectId = await createProject(env.pool, uid, "vrban", "empirical_monograph");
  await createUser(env.pool, "outra@exemplo.org");
  const rev = await createUser(env.pool, "revisor@exemplo.org");
  await env.pool.query("insert into project_member (project_id, user_id, role) values ($1,$2,'reviewer')", [projectId, rev]);
  author = await new Client(env.app).login("autor@exemplo.org");
});
afterAll(async () => {
  await env.app.close();
  await env.pool.end();
});

describe("acesso e autorização", () => {
  it("visitante não autenticado não lê dados privados", async () => {
    const anon = new Client(env.app);
    expect((await anon.req("GET", `${P()}/sections`)).statusCode).toBe(401);
    expect((await anon.req("GET", `${P()}/references`)).statusCode).toBe(401);
  });
  it("credenciais erradas são recusadas sem revelar se a conta existe", async () => {
    const r = await new Client(env.app).req("POST", "/api/auth/login", { email: "autor@exemplo.org", password: "errada-errada-123" });
    expect(r.statusCode).toBe(401);
    expect(r.json().message).toBe("Email ou palavra-passe incorretos.");
  });
  it("conta autenticada mas não autorizada não adquire acesso nem edição", async () => {
    const other = await new Client(env.app).login("outra@exemplo.org");
    expect((await other.req("GET", `${P()}/sections`)).statusCode).toBe(403);
    expect((await other.req("POST", `${P()}/references`, { type: "book", title: "X" })).statusCode).toBe(403);
  });
  it("revisor consulta mas não altera nem publica", async () => {
    const rev = await new Client(env.app).login("revisor@exemplo.org");
    expect((await rev.req("GET", `${P()}/sections`)).statusCode).toBe(200);
    expect((await rev.req("POST", `${P()}/references`, { type: "book", title: "X" })).statusCode).toBe(403);
    expect((await rev.req("POST", `${P()}/publications`, { sectionIds: [crypto.randomUUID()] })).statusCode).toBe(403);
  });
  it("pedidos que alteram estado sem cabeçalho próprio são recusados (CSRF)", async () => {
    const r = await env.app.inject({ method: "POST", url: `${P()}/references`, payload: { type: "book", title: "X" }, headers: { cookie: author.cookie } });
    expect(r.statusCode).toBe(403);
  });
});

describe("percurso académico", () => {
  let refA: string;
  let refB: string;
  let intro: string;
  let context: string;
  let version: number;
  const c1 = crypto.randomUUID();
  const c2 = crypto.randomUUID();

  it("modelo cria a estrutura académica com numeração automática", async () => {
    const sections = await author.json("GET", `${P()}/sections`);
    const introS = sections.find((s: any) => s.template_key === "intro");
    expect(introS.number).toBe("1");
    const ctx = sections.find((s: any) => s.template_key === "intro_context");
    expect(ctx.number).toBe("1.1");
    expect(sections.find((s: any) => s.template_key === "cover").number).toBeNull();
    intro = introS.id;
    context = ctx.id;
  });

  it("regista fontes com autores ordenados", async () => {
    const a = await author.json("POST", `${P()}/references`, {
      type: "article",
      title: "Agricultura vertical em contexto urbano",
      container_title: "Revista Fictícia de Estudos Urbanos",
      issued_year: 2024,
      volume: "3",
      issue: "2",
      pages: "10-20",
      doi: "https://doi.org/10.1234/ABC.1",
      contributors: [
        { family: "Silva", given: "Ana" },
        { family: "Costa", given: "Bruno" },
      ],
    });
    refA = a.id;
    expect(a.doi).toBe("10.1234/abc.1");
    expect(a.contributors.map((c: any) => c.family)).toEqual(["Silva", "Costa"]);
    const b = await author.json("POST", `${P()}/references`, {
      type: "report",
      title: "Relatório de exemplo",
      no_date: true,
      contributors: [{ literal: "Instituto de Estudos Urbanos", abbreviation: "IEU" }],
    });
    refB = b.id;
    const bad = await author.req("POST", `${P()}/references`, { type: "article", title: "X", doi: "não-é-doi" });
    expect(bad.statusCode).toBe(400);
  });

  it("grava a secção com citações ligadas e controla a versão", async () => {
    const doc = {
      type: "doc",
      content: [
        para(text("A agricultura vertical é discutida na literatura "), citation(c1, refA), text(".")),
        para(text("Segundo "), citation(c2, refB, { mode: "narrative" }), text(", há evidência a confirmar.")),
      ],
    };
    const r = await author.json("PUT", `${P()}/sections/${context}/content`, { baseVersion: 0, doc });
    expect(r.version).toBe(1);
    expect(r.wordCount).toBeGreaterThan(5);
    version = r.version;
    const s = await author.json("GET", `${P()}/sections/${context}`);
    expect(s.section.status).toBe("drafting");
    expect(s.doc.content).toHaveLength(2);
  });

  it("detecta conflito em vez de sobrescrever silenciosamente", async () => {
    const r = await author.req("PUT", `${P()}/sections/${context}/content`, { baseVersion: 0, doc: { type: "doc", content: [para(text("sobrescrever"))] } });
    expect(r.statusCode).toBe(409);
    expect(r.json().details.serverVersion).toBe(version);
    const s = await author.json("GET", `${P()}/sections/${context}`);
    expect(JSON.stringify(s.doc)).not.toContain("sobrescrever");
  });

  it("recusa nós não suportados e fontes de outro projeto", async () => {
    const bad = await author.req("PUT", `${P()}/sections/${context}/content`, {
      baseVersion: version,
      doc: { type: "doc", content: [{ type: "script", text: "alert(1)" }] },
    });
    expect(bad.statusCode).toBe(400);
    const foreign = await author.req("PUT", `${P()}/sections/${context}/content`, {
      baseVersion: version,
      doc: { type: "doc", content: [para(citation(crypto.randomUUID(), crypto.randomUUID()))] },
    });
    expect(foreign.statusCode).toBe(400);
  });

  it("renderiza citações APA e bibliografia a partir da biblioteca", async () => {
    const r = await author.json("GET", `${P()}/citations/rendered`);
    expect(r.citations[c1].text).toBe("(Silva & Costa, 2024)");
    expect(r.citations[c2].text).toBe("Instituto de Estudos Urbanos (IEU, s.d.)");
    expect(r.bibliography.map((b: any) => b.text)).toEqual([
      "Instituto de Estudos Urbanos. (s.d.). Relatório de exemplo.",
      "Silva, A., & Costa, B. (2024). Agricultura vertical em contexto urbano. Revista Fictícia de Estudos Urbanos, 3(2), 10–20. https://doi.org/10.1234/abc.1",
    ]);
    const occ = await author.json("GET", `${P()}/references/${refA}/occurrences`);
    expect(occ).toHaveLength(1);
    expect(occ[0].section_id).toBe(context);
  });

  it("corrigir metadados atualiza todas as ocorrências no rascunho", async () => {
    const ref = await author.json("GET", `${P()}/references/${refA}`);
    await author.json("PUT", `${P()}/references/${refA}`, {
      ...ref,
      issued_year: 2025,
      contributors: ref.contributors.map((c: any) => ({ family: c.family, given: c.given })),
    });
    const r = await author.json("GET", `${P()}/citations/rendered`);
    expect(r.citations[c1].text).toBe("(Silva & Costa, 2025)");
    // versão desatualizada é recusada
    const stale = await author.req("PUT", `${P()}/references/${refA}`, { ...ref, contributors: [{ family: "Silva" }] });
    expect(stale.statusCode).toBe(409);
  });

  let pub1: any;
  it("publica um snapshot e o visitante lê só a versão publicada", async () => {
    pub1 = await author.json("POST", `${P()}/publications`, { sectionIds: [context], note: "Primeira versão pública" });
    expect(pub1.number).toBe(1);
    const anon = new Client(env.app);
    const ov = await anon.json("GET", "/api/public/vrban");
    expect(ov.publication.label).toBe("v1");
    // estrutura: antepassado incluído (título) + secção selecionada
    expect(ov.sections.map((s: any) => [s.number, s.hasContent])).toEqual([
      ["1", false],
      ["1.1", true],
    ]);
    expect(ov.bibliography.entries).toHaveLength(2);
    expect(ov.howToCite.reference.text).toMatch(/Autor Teste\. \(\d{4}, .+\)\. Título de teste \(Versão 1\) \[Monografia interativa\]\. https:\/\/vrban\.example\/p\/vrban\/v\/1/);
    const sec = await anon.json("GET", `/api/public/vrban/sections/${context}`);
    expect(sec.html).toContain("(Silva &#38; Costa, 2025)");
    // secções não publicadas não são acessíveis
    expect((await anon.req("GET", `/api/public/vrban/sections/${intro}`)).statusCode).toBe(200);
    const other = (await author.json("GET", `${P()}/sections`)).find((s: any) => s.template_key === "methodology").id;
    expect((await anon.req("GET", `/api/public/vrban/sections/${other}`)).statusCode).toBe(404);
  });

  it("alteração privada não modifica a publicação existente", async () => {
    const s = await author.json("GET", `${P()}/sections/${context}`);
    await author.json("PUT", `${P()}/sections/${context}/content`, {
      baseVersion: s.section.version,
      doc: { type: "doc", content: [para(text("Rascunho novo e privado "), citation(c1, refA))] },
      checkpoint: true,
    });
    const sec = await new Client(env.app).json("GET", `/api/public/vrban/sections/${context}`);
    expect(sec.html).not.toContain("Rascunho novo");
    expect(sec.html).toContain("A agricultura vertical");
    // tentativa de alterar o snapshot diretamente é bloqueada pela base
    await expect(env.pool.query("update publication_item set content = '{}' where publication_id = $1", [pub1.id])).rejects.toThrow(/imutáveis/);
  });

  it("histórico de versões e restauro não destrutivo", async () => {
    const revs = await author.json("GET", `${P()}/sections/${context}/revisions`);
    expect(revs.length).toBeGreaterThanOrEqual(2);
    const oldest = revs[revs.length - 1];
    const r = await author.json("POST", `${P()}/sections/${context}/revisions/${oldest.id}/restore`);
    const after = await author.json("GET", `${P()}/sections/${context}/revisions`);
    expect(after.length).toBe(revs.length + 1);
    expect(r.revisionNumber).toBe(after[0].number);
  });

  it("reordenar capítulos atualiza numeração e referências cruzadas sem quebrar ligações", async () => {
    const sections = await author.json("GET", `${P()}/sections`);
    const met = sections.find((s: any) => s.template_key === "methodology");
    const x = crypto.randomUUID();
    const s = await author.json("GET", `${P()}/sections/${intro}`);
    await author.json("PUT", `${P()}/sections/${intro}/content`, {
      baseVersion: s.section.version,
      doc: { type: "doc", content: [para(text("Ver "), { type: "xref", attrs: { id: x, targetType: "section", targetId: met.id } }, text("."))] },
    });
    const before = await author.json("POST", `${P()}/sections/${intro}/preview`, { doc: (await author.json("GET", `${P()}/sections/${intro}`)).doc });
    expect(before.html).toContain("Capítulo 3");
    const topPos = sections.filter((q: any) => q.parent_id === null).findIndex((q: any) => q.id === intro) + 1;
    await author.json("POST", `${P()}/sections/${met.id}/move`, { parent_id: null, position: topPos });
    const after = await author.json("POST", `${P()}/sections/${intro}/preview`, { doc: (await author.json("GET", `${P()}/sections/${intro}`)).doc });
    expect(after.html).toContain("Capítulo 1");
    const renum = await author.json("GET", `${P()}/sections`);
    expect(renum.find((q: any) => q.id === intro).number).toBe("2");
    expect(renum.find((q: any) => q.template_key === "intro_context").number).toBe("2.1");
    // citações continuam resolvidas após reordenação
    const r = await author.json("GET", `${P()}/citations/rendered`);
    expect(r.citations[c1].text).toBe("(Silva & Costa, 2025)");
  });

  it("retirar a publicação remove o acesso público", async () => {
    await author.json("POST", `${P()}/publications/${pub1.id}/withdraw`);
    expect((await new Client(env.app).req("GET", "/api/public/vrban")).statusCode).toBe(404);
    expect((await new Client(env.app).req("GET", `/api/public/vrban/sections/${context}`)).statusCode).toBe(404);
  });

  it("publicação parcial inclui apenas a bibliografia do escopo", async () => {
    const intro2 = (await author.json("GET", `${P()}/sections`)).find((s: any) => s.template_key === "intro_problem").id;
    const cx = crypto.randomUUID();
    await author.json("PUT", `${P()}/sections/${intro2}/content`, { baseVersion: 0, doc: { type: "doc", content: [para(text("Problema "), citation(cx, refB))] } });
    const pub = await author.json("POST", `${P()}/publications`, { sectionIds: [intro2] });
    const ov = await new Client(env.app).json("GET", `/api/public/vrban/v/${pub.number}`);
    expect(ov.bibliography.entries.map((e: any) => e.id)).toEqual([refB]);
  });

  it("importa BibTeX com pré-visualização, avisos e deteção de duplicados", async () => {
    const bib = `@article{silva2025,
      author = {Silva, Ana and Costa, Bruno},
      title = {Agricultura vertical em contexto urbano},
      journal = {Revista Fictícia}, year = {2025}, doi = {10.1234/abc.1}}
    @book{lima2020, author = {Carla Lima and {Organização Exemplo}}, title = {Livro {didático}}, year = 2020, publisher = {Editora}}`;
    const dry = await author.json("POST", `${P()}/references-import`, { format: "bibtex", content: bib, dryRun: true });
    expect(dry.candidates).toHaveLength(2);
    expect(dry.candidates[0].duplicateOf).toBe(refA);
    expect(dry.candidates[1].warnings.join(" ")).toMatch(/inferida/);
    expect(dry.candidates[1].data.contributors[1]).toMatchObject({ literal: "Organização Exemplo" });
    const done = await author.json("POST", `${P()}/references-import`, { format: "bibtex", content: bib, dryRun: false });
    expect(done.created).toHaveLength(1);
    expect(done.skipped[0].reason).toBe("Possível duplicado");
  });

  it("fusão de duplicados preserva as citações existentes", async () => {
    const dup = await author.json("POST", `${P()}/references`, { type: "article", title: "Agricultura vertical em contexto urbano", issued_year: 2025, contributors: [{ family: "Silva" }] });
    const groups = await author.json("GET", `${P()}/references-duplicates`);
    expect(groups.some((g: any) => g.ids.includes(dup.id) && g.ids.includes(refA))).toBe(true);
    const preview = await author.json("POST", `${P()}/references-merge`, { keepId: dup.id, dropId: refA });
    expect(preview.citationsToMove).toBeGreaterThan(0);
    await author.json("POST", `${P()}/references-merge`, { keepId: dup.id, dropId: refA, confirm: true });
    const r = await author.json("GET", `${P()}/citations/rendered`);
    expect(r.citations[c1].text).toBe("(Silva, 2025)");
    expect((await author.json("GET", `${P()}/references/${dup.id}/occurrences`)).length).toBeGreaterThan(0);
  });
});
