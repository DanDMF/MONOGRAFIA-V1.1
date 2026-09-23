// Guia APA e auditoria académica (secção 20). Fixtures didáticas isoladas.
import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, createProject, createUser, setupTestApp } from "./helpers.js";
import { skippedHeadings, undefinedAcronyms } from "../src/server/modules/audit/academic.js";

let env: Awaited<ReturnType<typeof setupTestApp>>;
let author: Client;
let projectId: string;
const P = () => `/api/projects/${projectId}`;
const text = (t: string) => ({ type: "text", text: t });
const para = (...content: unknown[]) => ({ type: "paragraph", content });
const heading = (level: number, t: string) => ({ type: "heading", attrs: { level }, content: [text(t)] });
const cite = (referenceId: string, extra: Record<string, unknown> = {}) => ({
  type: "citation",
  attrs: { id: crypto.randomUUID(), mode: "parenthetical", items: [{ referenceId }], ...extra },
});

beforeAll(async () => {
  env = await setupTestApp();
  const uid = await createUser(env.pool, "autor@exemplo.org");
  projectId = await createProject(env.pool, uid, "vrban-audit", "empirical_monograph");
  const rev = await createUser(env.pool, "revisor@exemplo.org");
  await env.pool.query("insert into project_member (project_id, user_id, role) values ($1,$2,'reviewer')", [projectId, rev]);
  author = await new Client(env.app).login("autor@exemplo.org");
});
afterAll(async () => {
  await env.app.close();
  await env.pool.end();
});

describe("funções puras", () => {
  it("deteta níveis de título saltados", () => {
    const doc = { type: "doc", content: [heading(2, "A"), heading(4, "B"), heading(3, "C"), heading(5, "D")] };
    expect(skippedHeadings(doc as any).map((h) => `${h.from}->${h.to}`)).toEqual(["2->4", "3->5"]);
    expect(skippedHeadings({ type: "doc", content: [heading(3, "Começa no 3")] } as any)).toHaveLength(1);
  });
  it("siglas: definidas antes, definidas por extenso depois, romanos e conhecidas ignorados", () => {
    const r = undefinedAcronyms(
      [
        { sectionId: "s1", text: "Os Objetivos de Desenvolvimento Sustentável (ODS) orientam. O capítulo II e o DOI." },
        { sectionId: "s2", text: "Os ODS e a FAO. A UE (União Europeia) e o IEU." },
      ],
      new Set(["IEU"]),
    );
    expect(r.map((x) => x.acronym)).toEqual(["FAO"]);
  });
});

describe("auditoria académica", () => {
  const ids: Record<string, string> = {};
  it("prepara um projeto com problemas conhecidos", async () => {
    ids.ok = (await author.json("POST", `${P()}/references`, { type: "article", title: "Artigo completo", container_title: "Revista", issued_year: 2024, contributors: [{ family: "Silva", given: "Ana" }] })).id;
    ids.noAuthor = (await author.json("POST", `${P()}/references`, { type: "report", title: "Relatório sem autor", issued_year: 2021 })).id;
    ids.noDate = (await author.json("POST", `${P()}/references`, { type: "book", title: "Livro sem data", contributors: [{ family: "Costa" }] })).id;
    ids.web = (await author.json("POST", `${P()}/references`, { type: "webpage", title: "Página", no_date: true, url: "https://exemplo.org", contributors: [{ family: "Lima" }] })).id;
    ids.uncited = (await author.json("POST", `${P()}/references`, { type: "book", title: "Leitura de apoio", issued_year: 2020, contributors: [{ family: "Moura" }] })).id;
    ids.dup = (await author.json("POST", `${P()}/references`, { type: "article", title: "Artigo completo", issued_year: 2024, contributors: [{ family: "Silva" }] })).id;
    ids.archived = (await author.json("POST", `${P()}/references`, { type: "book", title: "Fonte depois arquivada", issued_year: 2019, contributors: [{ family: "Neto" }] })).id;
    // DOI malformado introduzido diretamente (ex.: dados antigos), já que a API o recusa
    await env.pool.query("update reference set doi = 'doi-invalido' where id = $1", [ids.ok]);
    const sections = await author.json("GET", `${P()}/sections`);
    ids.sec = sections.find((s: any) => s.template_key === "intro_context").id;
    const long = Array.from({ length: 42 }, (_, i) => `p${i}`).join(" ");
    await author.json("PUT", `${P()}/sections/${ids.sec}/content`, {
      baseVersion: 0,
      doc: {
        type: "doc",
        content: [
          para(text("A FAO publica dados "), cite(ids.ok), text(" e "), cite(ids.noAuthor), text(" e "), cite(ids.noDate), text(" e "), cite(ids.web), text(" e "), cite(ids.dup), text(" e "), cite(ids.archived), text(".")),
          para(text("Citação sem página: "), cite(ids.ok, { mode: "quote_short", quote: "trecho curto" }), text(".")),
          para(text("Longa em formato curto: "), cite(ids.ok, { mode: "quote_short", quote: long, items: [{ referenceId: ids.ok, locator: "3", locatorLabel: "page" }] }), text(".")),
          para(text("Secundária "), cite(ids.ok, { mode: "secondary" }), text(".")),
          heading(2, "Nível dois"),
          heading(4, "Nível quatro saltado"),
          para(text("Os Objetivos de Desenvolvimento Sustentável (ODS) e os ODS.")),
        ],
      },
    });
    await author.json("POST", `${P()}/references/${ids.archived}/archive`, { archived: true });
  });

  let audit: any;
  const has = (check: string, pred: (f: any) => boolean = () => true) => audit.findings.some((f: any) => f.check === check && pred(f));
  it("encontra e classifica os problemas", async () => {
    audit = await author.json("GET", `${P()}/audit/academic`);
    expect(audit.disclaimer).toMatch(/não garante conformidade/);
    expect(has("quote_missing_locator")).toBe(true);
    expect(has("quote_short_too_long")).toBe(true);
    expect(has("secondary_missing_author")).toBe(true);
    expect(has("reference_missing_author", (f) => f.target.id === ids.noAuthor)).toBe(true);
    expect(has("reference_missing_date", (f) => f.target.id === ids.noDate)).toBe(true);
    expect(has("webpage_nodate_accessed", (f) => f.target.id === ids.web)).toBe(true);
    expect(has("doi_malformed", (f) => f.target.id === ids.ok)).toBe(true);
    expect(has("reference_uncited", (f) => f.target.id === ids.uncited)).toBe(true);
    expect(has("reference_uncited", (f) => f.target.id === ids.ok)).toBe(false);
    expect(has("reference_duplicate")).toBe(true);
    expect(has("citation_archived_source")).toBe(true);
    expect(has("heading_skipped", (f) => /nível 2 para o nível 4/.test(f.message))).toBe(true);
    expect(has("acronym_undefined", (f) => f.key === "acronym_undefined:FAO")).toBe(true);
    expect(has("acronym_undefined", (f) => f.key === "acronym_undefined:ODS")).toBe(false);
    expect(has("institutional_required_empty", (f) => f.key === "institutional_required_empty:institution")).toBe(true);
    // gravidade
    const sev = (c: string) => audit.findings.find((f: any) => f.check === c).severity;
    expect(sev("quote_missing_locator")).toBe("structural");
    expect(sev("reference_missing_date")).toBe("incomplete");
    expect(sev("reference_uncited")).toBe("review");
    expect(audit.summary.structural).toBeGreaterThanOrEqual(5);
    // verificação não aplicável é declarada, não omitida
    expect(audit.checks.find((c: any) => c.code === "table_figure_unmentioned").applicable).toBe(false);
  });

  it("corrigir a causa remove o aviso", async () => {
    await env.pool.query("update reference set doi = null where id = $1", [ids.ok]);
    await env.pool.query("update project set institution = 'Instituição Fictícia' where id = $1", [projectId]);
    audit = await author.json("GET", `${P()}/audit/academic`);
    expect(has("doi_malformed")).toBe(false);
    expect(has("institutional_required_empty", (f) => f.key === "institutional_required_empty:institution")).toBe(false);
  });

  it("permite justificar uma exceção (auditada) e revogá-la", async () => {
    const f = audit.findings.find((x: any) => x.check === "reference_uncited");
    const bad = await author.req("POST", `${P()}/audit/academic/exceptions`, { findingKey: f.key, justification: "curta" });
    expect(bad.statusCode).toBe(400);
    const gone = await author.req("POST", `${P()}/audit/academic/exceptions`, { findingKey: "reference_uncited:inexistente", justification: "Justificação suficientemente longa." });
    expect(gone.statusCode).toBe(400);
    const before = audit.summary.review;
    const ex = await author.json("POST", `${P()}/audit/academic/exceptions`, { findingKey: f.key, justification: "Leitura de apoio mantida na biblioteca, sem citação prevista." });
    audit = await author.json("GET", `${P()}/audit/academic`);
    expect(audit.summary.review).toBe(before - 1);
    expect(audit.summary.justified).toBe(1);
    expect(audit.findings.find((x: any) => x.key === f.key).exception.justification).toMatch(/Leitura de apoio/);
    const dup = await author.req("POST", `${P()}/audit/academic/exceptions`, { findingKey: f.key, justification: "Outra justificação qualquer." });
    expect(dup.statusCode).toBe(400);
    const hist = await author.json("GET", `${P()}/audit?entityType=audit_exception`);
    expect(hist[0].action).toBe("justify");
    await author.json("POST", `${P()}/audit/academic/exceptions/${ex.id}/revoke`);
    audit = await author.json("GET", `${P()}/audit/academic`);
    expect(audit.summary.justified).toBe(0);
  });

  it("revisor consulta mas não justifica; painel mostra a auditoria", async () => {
    const rev = await new Client(env.app).login("revisor@exemplo.org");
    expect((await rev.req("GET", `${P()}/audit/academic`)).statusCode).toBe(200);
    const f = audit.findings[0];
    expect((await rev.req("POST", `${P()}/audit/academic/exceptions`, { findingKey: f.key, justification: "Tentativa do revisor, recusada." })).statusCode).toBe(403);
    const dash = await author.json("GET", `${P()}/dashboard`);
    expect(dash.audit.structural).toBe(audit.summary.structural);
    expect(dash.actions[0].link).toBe("/app/bibliografia/auditoria");
  });
});

describe("Guia APA", () => {
  it("regras com origem, versão e data; exemplos gerados pelo motor sem tocar na biblioteca", async () => {
    const before = (await author.json("GET", `${P()}/references`)).length;
    const g = await author.json("GET", `${P()}/apa-guide`);
    expect(g.locale).toBe("pt-PT");
    expect(g.officialHome).toMatch(/^https:\/\/apastyle\.apa\.org\//);
    for (const r of g.rules) {
      expect(r.origin).toBeTruthy();
      expect(r.version).toMatch(/APA 7/);
      expect(r.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const ex = (id: string) => g.rules.find((r: any) => r.id === id).examples.map((e: any) => e.text);
    expect(ex("autor-data")).toEqual(["(Silva, 2024)", "Silva (2024)", "(Silva & Costa, 2024)", "Silva e Costa (2024)", "(Lima et al., 2023)"]);
    expect(ex("mesmo-autor-ano")).toEqual(["(Rocha, 2022b)", "(Rocha, 2022a, 2022b)"]);
    expect(ex("autor-institucional")).toEqual(["(Instituto de Estudos Urbanos [IEU], 2024)", "(IEU, 2024)"]);
    expect(ex("sem-data-sem-autor")[0]).toBe("(Silva, s.d.)");
    expect(ex("fonte-secundaria")[0]).toBe("(Almeida, 1998, como citado em Costa, 2019)");
    expect(ex("comunicacao-pessoal")[0]).toBe("(A. B. Silva, comunicação pessoal, 12 de março de 2025)");
    const refs = g.rules.find((r: any) => r.id === "lista-referencias").references.map((b: any) => b.text).join("\n");
    expect(refs).toContain("Autor19, X., … Autor21, X.");
    // perfil inglês
    const en = await author.json("GET", `${P()}/apa-guide?locale=en-US`);
    expect(en.rules.find((r: any) => r.id === "autor-data").examples[3].text).toBe("Silva and Costa (2024)");
    expect(en.rules.find((r: any) => r.id === "sem-data-sem-autor").examples[0].text).toBe("(Silva, n.d.)");
    // exemplos didáticos nunca entram na biblioteca real
    expect((await author.json("GET", `${P()}/references`)).length).toBe(before);
  });
});
