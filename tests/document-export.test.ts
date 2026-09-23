// Exportação académica DOCX/PDF (secção 40): estilos reais, níveis APA, citações renderizadas, bibliografia do
// escopo com recuo francês, sumário atualizável; PDF com texto selecionável, fontes incorporadas e sumário preenchido.
import crypto from "node:crypto";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, createProject, createUser, setupTestApp } from "./helpers.js";
import { runOnce } from "../src/server/modules/jobs/queue.js";
import { documentJobHandler } from "../src/server/http/routes-data.js";

const has = (cmd: string) => {
  try {
    execFileSync("sh", ["-c", `command -v ${cmd}`]);
    return true;
  } catch {
    return false;
  }
};
const hasLibreOffice = has("soffice") && has("pdftotext");

let env: Awaited<ReturnType<typeof setupTestApp>>;
let author: Client;
let projectId: string;
const P = () => `/api/projects/${projectId}`;
const text = (t: string, marks?: unknown[]) => ({ type: "text", text: t, ...(marks ? { marks } : {}) });
const para = (...content: unknown[]) => ({ type: "paragraph", content });
const heading = (level: number, t: string) => ({ type: "heading", attrs: { level }, content: [text(t)] });
const cite = (referenceId: string, extra: Record<string, unknown> = {}) => ({
  type: "citation",
  attrs: { id: crypto.randomUUID(), mode: "parenthetical", items: [{ referenceId }], ...extra },
});
const LOREM =
  "Texto didático de teste para verificar a paginação do documento académico, com frases suficientemente longas para ocupar várias linhas e forçar quebras de página sem conteúdo real da investigação.";

async function runJobs() {
  const h = { "export.document": documentJobHandler({ pool: env.pool, config: env.config, storage: env.storage }) as any };
  while (await runOnce(env.pool, h)) {
    /* processar */
  }
}

beforeAll(async () => {
  env = await setupTestApp();
  const uid = await createUser(env.pool, "autor@exemplo.org");
  projectId = await createProject(env.pool, uid, "vrban-doc", "empirical_monograph");
  author = await new Client(env.app).login("autor@exemplo.org");
  await env.pool.query(
    "update project set academic_title = 'Título didático da monografia', institution = 'Instituição Fictícia', degree = 'Licenciatura (exemplo)', advisor = 'Orientação: Pessoa Fictícia', academic_year = '2026' where id = $1",
    [projectId],
  );
});
afterAll(async () => {
  await env.app.close();
  await env.pool.end();
});

describe("documento académico", () => {
  let docxBuf: Buffer;
  it("prepara conteúdo didático com todas as formas de citação", async () => {
    const a = await author.json("POST", `${P()}/references`, {
      type: "article",
      title: "Artigo fictício sobre cultivo vertical",
      container_title: "Revista Fictícia",
      issued_year: 2024,
      volume: "5",
      pages: "1-9",
      contributors: [{ family: "Silva", given: "Ana" }, { family: "Costa", given: "Bruno" }],
    });
    const many = await author.json("POST", `${P()}/references`, {
      type: "article",
      title: "Estudo fictício com muitos autores",
      container_title: "Revista Fictícia",
      issued_year: 2022,
      contributors: Array.from({ length: 21 }, (_, i) => ({ family: `Autor${i + 1}`, given: "X." })),
    });
    const inst = await author.json("POST", `${P()}/references`, {
      type: "report",
      title: "Relatório institucional fictício",
      issued_year: 2023,
      contributors: [{ literal: "Instituto de Estudos Urbanos", abbreviation: "IEU" }],
    });
    const pc = await author.json("POST", `${P()}/e/personal_communication`, { given_initials: "A. B.", family: "Silva", communication_date: "2025-03-12" });
    const sections = await author.json("GET", `${P()}/sections`);
    const ctxId = sections.find((s: any) => s.template_key === "intro_context").id;
    const methId = sections.find((s: any) => s.template_key === "met_approach").id;
    const block = Array.from({ length: 45 }, (_, i) => `palavra${i}`).join(" ") + ".";
    await author.json("PUT", `${P()}/sections/${ctxId}/content`, {
      baseVersion: 0,
      doc: {
        type: "doc",
        content: [
          para(text("A literatura discute o tema "), cite(a.id), text(" e "), cite(inst.id), text(". Segundo "), cite(a.id, { mode: "narrative" }), text(", há evidência.")),
          para(text("Uma citação curta: "), cite(a.id, { mode: "quote_short", quote: "trecho meramente ilustrativo", items: [{ referenceId: a.id, locator: "18", locatorLabel: "page" }] }), text(".")),
          { type: "citationBlock", attrs: { id: crypto.randomUUID(), mode: "quote_block", items: [{ referenceId: many.id, locator: "3-4", locatorLabel: "page" }] }, content: [para(text(block))] },
          heading(2, "Subtópico de segundo nível"),
          para(text("Fonte secundária "), cite(a.id, { mode: "secondary", secondaryAuthor: "Almeida", secondaryYear: "1998" }), text(" e comunicação "), { type: "citation", attrs: { id: crypto.randomUUID(), mode: "personal", items: [{ personalId: pc.id }] } }, text(".")),
          { type: "bulletList", content: [{ type: "listItem", content: [para(text("Primeiro item"))] }, { type: "listItem", content: [para(text("Segundo item"))] }] },
          heading(4, "Nível em linha"),
          para(text("O texto continua na mesma linha do título de nível quatro, com "), text("itálico", [{ type: "italic" }]), text(".")),
          ...Array.from({ length: 12 }, () => para(text(LOREM + " " + LOREM))),
          para(text("Ver "), { type: "xref", attrs: { id: crypto.randomUUID(), targetType: "section", targetId: methId } }, text(".")),
        ],
      },
    });
    await author.json("PUT", `${P()}/sections/${methId}/content`, {
      baseVersion: 0,
      doc: { type: "doc", content: [para(text("Abordagem descrita de forma didática.")), ...Array.from({ length: 6 }, () => para(text(LOREM)))] },
    });
  });

  it("gera DOCX pela fila com estilos reais, sumário e bibliografia com recuo francês", async () => {
    const job = await author.json("POST", `${P()}/exports/document`, { format: "docx" }, [202]);
    await runJobs();
    const done = await author.json("GET", `${P()}/jobs/${job.id}`);
    expect(done.status).toBe("succeeded");
    expect(done.result.summary.references).toBe(3);
    const r = await author.req("GET", `${P()}/files/${done.result.fileId}`);
    expect(r.headers["content-type"]).toContain("wordprocessingml");
    docxBuf = r.rawPayload;
    fs.mkdirSync("tmp", { recursive: true });
    fs.writeFileSync("tmp/doc-sample.docx", docxBuf);
    const zip = await JSZip.loadAsync(docxBuf);
    const xml = await zip.file("word/document.xml")!.async("string");
    const styles = await zip.file("word/styles.xml")!.async("string");
    const settings = await zip.file("word/settings.xml")!.async("string");
    const plain = xml.replace(/<[^>]+>/g, "");
    // estilos reais e níveis APA
    expect(styles).toContain('w:styleId="Heading1"');
    expect(styles).toMatch(/w:styleId="Heading1"[\s\S]*?<w:jc w:val="center"\/>/);
    expect(styles).toMatch(/w:styleId="Heading3"[\s\S]*?<w:i\/>/);
    expect(styles).toMatch(/w:styleId="Reference"[\s\S]*?w:hanging="720"/);
    expect(styles).toMatch(/w:line="480"/);
    expect(xml).toContain('w:pStyle w:val="Heading1"');
    expect(xml).toContain('w:pStyle w:val="Heading2"');
    // sumário atualizável + pedido de atualização de campos
    expect(xml).toMatch(/TOC \\h \\o &quot;1-3&quot;/);
    expect(settings).toContain("updateFields");
    // citações renderizadas e formas APA
    expect(plain).toContain("(Silva &amp; Costa, 2024)");
    expect(plain).toContain("Silva e Costa (2024)");
    expect(plain).toContain("(Instituto de Estudos Urbanos [IEU], 2023)");
    expect(plain).toContain("“trecho meramente ilustrativo” (Silva &amp; Costa, 2024, p. 18)");
    expect(plain).toContain("(Almeida, 1998, como citado em Silva &amp; Costa, 2024)");
    expect(plain).toContain("(A. B. Silva, comunicação pessoal, 12 de março de 2025)");
    expect(plain).toContain("Nível em linha. O texto continua na mesma linha");
    expect(plain).toMatch(/Ver Secção 3\.1\./);
    expect(xml).toMatch(/w:val="Heading3"\/>(?:<w:keepNext\/>)?<\/w:pPr><w:r><w:t xml:space="preserve">Subtópico de segundo nível/);
    // página de título e bibliografia (comunicação pessoal excluída; 21 autores)
    expect(plain).toContain("Título didático da monografia");
    expect(plain).toContain("Referências");
    expect(plain).toContain("Autor19, X., … Autor21, X. (2022)");
    expect(plain).not.toMatch(/Silva, A\. B\./);
    // itálico do nome da revista na referência
    expect(xml).toMatch(/<w:i\/>[\s\S]{0,200}Revista Fictícia/);
  });

  it.skipIf(!hasLibreOffice)("gera PDF com texto selecionável, fontes incorporadas e sumário preenchido", async () => {
    const job = await author.json("POST", `${P()}/exports/document`, { format: "pdf" }, [202]);
    await runJobs();
    const done = await author.json("GET", `${P()}/jobs/${job.id}`);
    expect(done.status, done.error).toBe("succeeded");
    const r = await author.req("GET", `${P()}/files/${done.result.fileId}`);
    expect(r.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    fs.writeFileSync("tmp/doc-sample.pdf", r.rawPayload);
    const txt = execFileSync("pdftotext", ["-layout", "tmp/doc-sample.pdf", "-"]).toString();
    expect(txt).toContain("Índice");
    // o sumário tem entradas com número de página (índice atualizado pelo LibreOffice)
    expect(txt).toMatch(/1 Introdução[ .]*\d+/);
    expect(txt).toContain("Referências");
    expect(txt).toContain("(Silva & Costa, 2024)");
    const fonts = execFileSync("pdffonts", ["tmp/doc-sample.pdf"]).toString();
    const rows = fonts.split("\n").slice(2).filter(Boolean);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((l) => /\byes\b/.test(l.split(/\s+/).slice(-5).join(" ")))).toBe(true); // coluna "emb"
    const pages = Number(/Pages:\s+(\d+)/.exec(execFileSync("pdfinfo", ["tmp/doc-sample.pdf"]).toString())?.[1]);
    expect(pages).toBeGreaterThanOrEqual(4);
  }, 240_000);

  it("exporta a partir de uma publicação fixa (a mesma versão de origem)", async () => {
    const sections = await author.json("GET", `${P()}/sections`);
    const ctxId = sections.find((s: any) => s.template_key === "intro_context").id;
    const pub = await author.json("POST", `${P()}/publications`, { sectionIds: [ctxId] });
    const job = await author.json("POST", `${P()}/exports/document`, { source: "publication", publicationNumber: pub.number, format: "docx", titlePage: false, toc: false }, [202]);
    await runJobs();
    const done = await author.json("GET", `${P()}/jobs/${job.id}`);
    expect(done.status).toBe("succeeded");
    expect(done.result.summary.scope).toMatch(/Publicação v1/);
    const zip = await JSZip.loadAsync((await author.req("GET", `${P()}/files/${done.result.fileId}`)).rawPayload);
    const plain = (await zip.file("word/document.xml")!.async("string")).replace(/<[^>]+>/g, "");
    expect(plain).toContain("(Silva &amp; Costa, 2024)");
    expect(plain).not.toContain("Abordagem descrita"); // secção não publicada fora do escopo
    const core = await zip.file("docProps/core.xml")!.async("string");
    expect(core).toContain("Publicação v1");
    // o JSON interno não é servido ao público
    const pubSec = await new Client(env.app).json("GET", `/api/public/vrban-doc/sections/${ctxId}`);
    expect(pubSec.doc).toBeUndefined();
  });
});
