// Próximo parágrafo (VRB-012-001): cartão ideia → … → integrado, pela API com PostgreSQL real.
// Fixtures didáticas (obras fictícias), nunca dados do projeto real.
import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, createProject, createUser, setupTestApp } from "./helpers.js";
import { sanitizeDoc } from "../src/shared/doc.js";
import { cardGaps } from "../src/shared/cards.js";
import { draftToParagraphs } from "../src/server/modules/writing/cards.js";

let env: Awaited<ReturnType<typeof setupTestApp>>;
let author: Client;
let projectId: string;
let otherProjectId: string;
let sectionId: string;
let refA: string;
let refB: string;
let excLiteral: string;
let excComment: string;
let cardId: string;
let version: number;
const P = () => `/api/projects/${projectId}`;

beforeAll(async () => {
  env = await setupTestApp();
  const uid = await createUser(env.pool, "autor@exemplo.org");
  projectId = await createProject(env.pool, uid, "vrban", "empirical_monograph");
  otherProjectId = await createProject(env.pool, uid, "outro");
  const rev = await createUser(env.pool, "revisor@exemplo.org");
  await env.pool.query("insert into project_member (project_id, user_id, role) values ($1,$2,'reviewer')", [projectId, rev]);
  author = await new Client(env.app).login("autor@exemplo.org");
  const sections = await author.json("GET", `${P()}/sections`);
  sectionId = sections.find((s: any) => s.template_key === "intro_context").id;
  refA = (
    await author.json("POST", `${P()}/references`, {
      type: "article",
      title: "Agricultura vertical em contexto urbano",
      container_title: "Revista Fictícia de Estudos Urbanos",
      issued_year: 2024,
      contributors: [{ family: "Silva", given: "Ana" }],
    })
  ).id;
  refB = (
    await author.json("POST", `${P()}/references`, {
      type: "report",
      title: "Relatório de exemplo",
      issued_year: 2023,
      contributors: [{ literal: "Instituto de Estudos Urbanos" }],
    })
  ).id;
  excLiteral = (await author.json("POST", `${P()}/e/excerpt`, { reference_id: refA, kind: "literal", text: "Texto literal fictício.", locator_label: "page", locator: "12" })).id;
  excComment = (await author.json("POST", `${P()}/e/excerpt`, { reference_id: refA, kind: "comment", text: "Comentário meu." })).id;
});
afterAll(async () => {
  await env.app.close();
  await env.pool.end();
});

describe("regras partilhadas", () => {
  it("indica o que falta até cada etapa, sem bloquear", () => {
    const empty = { idea: "X", question: null, section_id: null, interpretation: null, draft: null, sources: [], excerpts: [] };
    expect(cardGaps(empty, "idea")).toEqual([]);
    expect(cardGaps(empty, "research")).toEqual(["Pergunta por definir.", "Secção de destino por escolher."]);
    expect(cardGaps({ ...empty, sources: [{ locator: null }] }, "notes")).toContain("Há fontes sem localização (página, parágrafo…).");
  });
  it("o parágrafo guarda o ID do cartão e rejeita IDs inválidos", () => {
    const id = crypto.randomUUID();
    const d = sanitizeDoc({ type: "doc", content: [{ type: "paragraph", attrs: { cardId: id }, content: [{ type: "text", text: "a" }] }] });
    expect(d.content![0]!.attrs).toEqual({ cardId: id });
    const bad = sanitizeDoc({ type: "doc", content: [{ type: "paragraph", attrs: { cardId: "x<script>" } }] });
    expect(bad.content![0]!.attrs).toBeUndefined();
  });
  it("coloca a citação antes do ponto final e separa parágrafos por linha em branco", () => {
    const ps = draftToParagraphs(crypto.randomUUID(), "Primeiro.\n\nSegundo termina aqui.", [{ referenceId: crypto.randomUUID(), locatorLabel: "page", locator: "4" }]);
    expect(ps).toHaveLength(2);
    expect(ps[0]!.content!.some((n) => n.type === "citation")).toBe(false);
    const types = ps[1]!.content!.map((n) => n.type + (n.text ? `:${n.text}` : ""));
    expect(types).toEqual(["text:Segundo termina aqui", "text: ", "citation", "text:."]);
  });
});

describe("percurso do cartão", () => {
  it("cria um cartão a partir de uma ideia", async () => {
    const c = await author.json("POST", `${P()}/cards`, { idea: "A iluminação LED domina o custo energético" });
    expect(c.stage).toBe("idea");
    cardId = c.id;
    version = c.version;
    expect((await author.req("POST", `${P()}/cards`, { idea: "  " })).statusCode).toBe(400);
  });

  it("liga pergunta, secção, fontes com localização e excertos", async () => {
    const r = await author.json("PATCH", `${P()}/cards/${cardId}`, {
      version,
      question: "Que parte do custo vem da energia?",
      section_id: sectionId,
      stage: "notes",
      sources: [
        { reference_id: refA, locator: "12" },
        { reference_id: refB, locator_label: "section", locator: "3.2" },
      ],
      excerpt_ids: [excLiteral],
      interpretation: "Interpretação própria (fictícia).",
    });
    version = r.card.version;
    expect(r.sources.map((s: any) => [s.author_label, s.locator_label, s.locator])).toEqual([
      ["Silva", "page", "12"],
      ["Instituto de Estudos Urbanos", "section", "3.2"],
    ]);
    expect(r.excerpts.map((e: any) => e.kind)).toEqual(["literal"]);
    expect(r.candidates.map((e: any) => e.id)).toEqual([excComment]);
    expect(r.gaps).toEqual(["Rascunho do parágrafo vazio."]);
  });

  it("recusa conflitos de versão, fontes de outro projeto e a etapa 'integrado' por edição", async () => {
    const stale = await author.req("PATCH", `${P()}/cards/${cardId}`, { version: version - 1, draft: "x" });
    expect(stale.statusCode).toBe(409);
    const foreignRef = (await author.json("POST", `/api/projects/${otherProjectId}/references`, { type: "book", title: "Outra obra" })).id;
    expect((await author.req("PATCH", `${P()}/cards/${cardId}`, { version, sources: [{ reference_id: foreignRef }] })).statusCode).toBe(400);
    expect((await author.req("PATCH", `${P()}/cards/${cardId}`, { version, stage: "integrated" })).statusCode).toBe(400);
    expect((await author.req("GET", `/api/projects/${otherProjectId}/cards/${cardId}`)).statusCode).toBe(404);
  });

  it("revisor lê mas não altera nem integra", async () => {
    const rev = await new Client(env.app).login("revisor@exemplo.org");
    expect((await rev.req("GET", `${P()}/cards/${cardId}`)).statusCode).toBe(200);
    expect((await rev.req("PATCH", `${P()}/cards/${cardId}`, { version, draft: "x" })).statusCode).toBe(403);
    expect((await rev.req("POST", `${P()}/cards/${cardId}/integrate`, { version })).statusCode).toBe(403);
  });

  it("não integra sem rascunho", async () => {
    const r = await author.req("POST", `${P()}/cards/${cardId}/integrate`, { version });
    expect(r.statusCode).toBe(400);
    expect(r.json().message).toMatch(/rascunho/);
  });

  it("o painel sugere o cartão como próximo parágrafo", async () => {
    const d = await author.json("GET", `${P()}/dashboard`);
    expect(d.writing.card.id).toBe(cardId);
    expect(d.writing.byStage).toEqual({ notes: 1 });
  });

  it("integra na secção com citação ligada e mantém o texto existente", async () => {
    const before = await author.json("GET", `${P()}/sections/${sectionId}`);
    await author.json("PUT", `${P()}/sections/${sectionId}/content`, {
      baseVersion: before.section.version,
      doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Texto anterior do autor." }] }] },
    });
    const r0 = await author.json("PATCH", `${P()}/cards/${cardId}`, { version, stage: "review", draft: "A energia representa uma parte relevante do custo." });
    version = r0.card.version;
    const res = await author.json("POST", `${P()}/cards/${cardId}/integrate`, { version, cite: true });
    expect(res.card.stage).toBe("integrated");
    expect(res.sectionId).toBe(sectionId);
    version = res.card.version;

    const s = await author.json("GET", `${P()}/sections/${sectionId}`);
    const blocks = s.doc.content;
    expect(blocks[0].content[0].text).toBe("Texto anterior do autor.");
    const last = blocks[blocks.length - 1];
    expect(last.attrs.cardId).toBe(cardId);
    const cit = last.content.find((n: any) => n.type === "citation");
    expect(cit.attrs.items.map((i: any) => [i.referenceId, i.locator])).toEqual([
      [refA, "12"],
      [refB, "3.2"],
    ]);
    const revs = await author.json("GET", `${P()}/sections/${sectionId}/revisions`);
    expect(revs[0].note).toMatch(/Integração do cartão/);
    expect(revs[0].id).toBe(res.card.integrated_revision_id);

    const rendered = await author.json("GET", `${P()}/citations/rendered`);
    expect(rendered.citations[cit.attrs.id].text).toBe("(Instituto de Estudos Urbanos, 2023, Secção 3.2; Silva, 2024, p. 12)");
    const occ = await author.json("GET", `${P()}/references/${refA}/occurrences`);
    expect(occ.map((o: any) => o.section_id)).toContain(sectionId);

    expect((await author.req("POST", `${P()}/cards/${cardId}/integrate`, { version })).statusCode).toBe(400);
    const d = await author.json("GET", `${P()}/dashboard`);
    expect(d.writing.card).toBeNull();
  });

  it("reabrir o cartão retira a marca de integração sem apagar o parágrafo", async () => {
    const r = await author.json("PATCH", `${P()}/cards/${cardId}`, { version, stage: "review" });
    expect(r.card.integrated_at).toBeNull();
    expect(r.card.integrated_section_id).toBe(sectionId);
    version = r.card.version;
    const s = await author.json("GET", `${P()}/sections/${sectionId}`);
    expect(s.doc.content.some((b: any) => b.attrs?.cardId === cardId)).toBe(true);
  });

  it("a fusão de fontes duplicadas mantém a ligação do cartão", async () => {
    const dup = (await author.json("POST", `${P()}/references`, { type: "article", title: "Agricultura vertical em contexto urbano", issued_year: 2024, contributors: [{ family: "Silva", given: "Ana" }] })).id;
    await author.json("POST", `${P()}/references-merge`, { keepId: dup, dropId: refA, confirm: true });
    const c = await author.json("GET", `${P()}/cards/${cardId}`);
    expect(c.sources.map((s: any) => s.reference_id)).toEqual([dup, refB]);
    expect(c.sources[0].locator).toBe("12");
  });

  it("arquiva, lista e regista o histórico", async () => {
    await author.json("POST", `${P()}/cards/${cardId}/archive`, { archived: true });
    expect(await author.json("GET", `${P()}/cards`)).toHaveLength(0);
    expect(await author.json("GET", `${P()}/cards?archived=true`)).toHaveLength(1);
    const hist = await author.json("GET", `${P()}/audit?entityType=paragraph_card`);
    expect(hist.map((h: any) => h.action)).toEqual(expect.arrayContaining(["create", "update", "integrate", "archive"]));
  });
});
