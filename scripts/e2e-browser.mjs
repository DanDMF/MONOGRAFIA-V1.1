// Verificação em browser real (Playwright/Chromium) dos dois percursos da secção E.
// Pré-requisitos: servidor (com dist/client) e worker a correr; autor provisionado.
// Uso: BASE=http://localhost:3100 EMAIL=... PASSWORD=... node scripts/e2e-browser.mjs
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;
const SHOTS = process.env.SHOTS ?? "tmp/shots";
fs.mkdirSync(SHOTS, { recursive: true });
const log = (m) => console.log("✓", m);
/** Seleciona a opção cujo texto corresponde à expressão regular. */
async function selectByText(select, re) {
  const value = await select.evaluate((el, src) => {
    const r = new RegExp(src);
    return [...el.options].find((o) => r.test(o.textContent))?.value ?? null;
  }, re.source);
  if (!value) throw new Error(`opção ${re} inexistente`);
  await select.selectOption(value);
}

// CHROMIUM_PATH permite usar um Chromium pré-instalado quando a versão do Playwright difere.
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ acceptDownloads: true, locale: "pt-PT" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

// ---------- Acesso ----------
await page.goto(`${BASE}/app`);
await page.waitForURL(/entrar/);
await page.fill("#email", EMAIL);
await page.fill("#password", PASSWORD);
await page.click("button[type=submit]");
await page.waitForURL(/\/app$/);
await page.getByRole("heading", { name: "Painel" }).waitFor();
log("login e painel");

// ---------- Percurso académico ----------
await page.goto(`${BASE}/app/bibliografia`);
await page.getByRole("button", { name: "+ Nova fonte" }).click();
const dlg = page.locator("dialog[open]");
await dlg.getByLabel("Apelido(s)").fill("Exemplo");
await dlg.getByLabel("Nome(s) próprio(s)").fill("Ana");
await dlg.getByRole("button", { name: "+ Pessoa" }).click();
await dlg.getByLabel("Apelido(s)").nth(1).fill("Didático");
await dlg.getByLabel("Nome(s) próprio(s)").nth(1).fill("Bruno");
await dlg.locator("#r-year").fill("2024");
await dlg.locator("#r-title").fill("Fonte fictícia para verificação da interface");
await dlg.locator("#r-container_title").fill("Revista Fictícia");
await dlg.getByRole("button", { name: "Gravar" }).click();
await page.waitForURL(/bibliografia\/[0-9a-f-]{36}/);
log("fonte criada pela interface");

await page.goto(`${BASE}/app/escrita/estrutura`);
await page.getByRole("link", { name: "Contextualização" }).click();
await page.waitForURL(/editor/);
const editor = page.locator(".ProseMirror");
await editor.waitFor();
await editor.click();
await page.keyboard.type("A agricultura urbana vertical é tratada em estudos recentes ");
await page.getByRole("button", { name: "Inserir citação" }).click();
const cd = page.locator("dialog[open]");
await selectByText(cd.getByLabel("Adicionar fonte"), /Exemplo & Didático \(2024\)/);
await cd.getByText("Pré-visualização APA:").waitFor();
await cd.getByText("(Exemplo & Didático, 2024)").waitFor();
await cd.getByRole("button", { name: "Inserir" }).click();
await page.keyboard.type(".");
await page.getByText(/Gravado no servidor às/).waitFor({ timeout: 15000 });
await page.locator(".cite-chip", { hasText: "(Exemplo & Didático, 2024)" }).waitFor();
await page.screenshot({ path: `${SHOTS}/1-editor.png`, fullPage: true });
log("texto escrito, citação inserida e gravação confirmada pelo servidor");

// narrativa
await editor.press("End");
await page.keyboard.type(" Segundo ");
await page.getByRole("button", { name: "Inserir citação" }).click();
await cd.getByLabel("Narrativa").check();
await selectByText(cd.getByLabel("Adicionar fonte"), /Exemplo & Didático \(2024\)/);
await cd.getByText("Exemplo e Didático (2024)").waitFor();
await cd.getByRole("button", { name: "Inserir" }).click();
await page.getByText(/Gravado no servidor às/).waitFor({ timeout: 15000 });
log("citação narrativa com “e”");

// persistência após recarregar
await page.reload();
await page.locator(".cite-chip", { hasText: "Exemplo e Didático (2024)" }).waitFor();
log("conteúdo persistido após recarregar");

// publicação
await page.goto(`${BASE}/app/gestao/publicacao`);
await page.getByLabel(/Contextualização/).check();
await page.fill("#note", "Verificação em browser");
page.once("dialog", (d) => d.accept());
await page.getByRole("button", { name: /Publicar 1 secção/ }).click();
await page.getByText(/Publicada a versão v/).waitFor();
log("publicação criada");

const pub = await ctx.newPage();
await pub.goto(`${BASE}/p/vrban`);
await pub.getByRole("link", { name: "Explorar monografia" }).click();
await pub.getByText("(Exemplo & Didático, 2024)").first().waitFor();
await pub.screenshot({ path: `${SHOTS}/2-publico-monografia.png`, fullPage: true });
await pub.getByRole("link", { name: "Referências" }).click();
await pub.getByText(/Exemplo, A\., & Didático, B\. \(2024\)\. Fonte fictícia/).waitFor();
log("visitante lê a secção publicada e a bibliografia");

// alteração privada não altera o público
await page.goto(`${BASE}/app/escrita/estrutura`);
await page.getByRole("link", { name: "Contextualização" }).click();
await editor.waitFor();
await editor.click();
await page.keyboard.press("Control+End");
await page.keyboard.type(" Frase privada posterior.");
await page.getByText(/Gravado no servidor às/).waitFor({ timeout: 15000 });
await pub.goto(`${BASE}/p/vrban/monografia`);
await pub.getByText("A agricultura urbana vertical").waitFor();
if (await pub.getByText("Frase privada posterior").count()) throw new Error("rascunho apareceu no público");
log("rascunho posterior não altera a publicação");

// ---------- Próximo parágrafo (unidade de investigação → parágrafo integrado) ----------
await page.goto(`${BASE}/app`);
await page.fill("#new-idea", "Ideia fictícia para verificar a unidade de investigação");
await page.getByRole("button", { name: "Criar unidade" }).click();
await page.waitForURL(/unidades\/[0-9a-f-]{36}/);
await page.fill("#c-q", "Pergunta fictícia de verificação?");
await selectByText(page.locator("#c-sec"), /Contextualização/);
await page.fill("#src-search", "Exemplo");
await page.locator(".pick-list button", { hasText: /Exemplo \(2024\)/ }).click();
await page.fill("#loc-0", "5");
await page.getByRole("button", { name: "+ Novo excerto" }).click();
await page.fill("#ne-text", "Excerto literal fictício para verificação.");
await page.fill("#ne-loc", "5");
await page.getByRole("button", { name: "Registar e ligar" }).click();
await page.locator(".excerpt-literal", { hasText: "Excerto literal fictício" }).waitFor();
await page.fill("#c-int", "Interpretação fictícia.");
await page.locator(".stepper").getByRole("button", { name: "Redação" }).click();
await page.fill("#c-draft", "Parágrafo fictício integrado a partir da unidade.");
await page.getByRole("status").filter({ hasText: /^Gravado$/ }).waitFor({ timeout: 15000 });
await page.screenshot({ path: `${SHOTS}/6-cartao.png`, fullPage: true });
await page.getByRole("button", { name: /Integrar na secção|Gravar e integrar/ }).click();
await page.waitForURL(/\/unidades$/);
await page.getByText(/foi arquivada como evidência/).waitFor();
if (await page.locator(".unit-list a", { hasText: "verificar a unidade" }).count()) throw new Error("unidade integrada continua na lista de trabalho");
await page.getByText("Nenhuma unidade em curso").waitFor();
await page.screenshot({ path: `${SHOTS}/6b-depois-de-integrar.png`, fullPage: true });
log("unidade: ideia → fonte com localização → excerto literal → rascunho → integrada e arquivada; volta ao próximo passo");
await page.locator(".alert.ok").getByRole("link").first().click();
await page.waitForURL(/editor/);
const fromCard = page.locator(".ProseMirror p.from-card", { hasText: "Parágrafo fictício integrado a partir da unidade" });
await fromCard.waitFor();
await fromCard.locator(".cite-chip", { hasText: "(Exemplo & Didático, 2024, p. 5)" }).waitFor();
await fromCard.click();
await page.keyboard.press("End");
await page.keyboard.type(" Revisto no editor.");
await page.getByText(/Gravado no servidor às/).waitFor({ timeout: 15000 });
await page.reload();
await page.locator(".ProseMirror p.from-card", { hasText: "Revisto no editor." }).waitFor();
log("parágrafo integrado com citação e localização; ligação à unidade preservada após editar e recarregar");

// ---------- Percurso analítico ----------
async function create(slug, fill) {
  await page.goto(`${BASE}/app/dados/${slug}`);
  await page.getByRole("button", { name: "+ Novo registo" }).click();
  const d = page.locator("dialog[open]");
  await fill(d);
  await d.getByRole("button", { name: "Gravar" }).click();
  await d.waitFor({ state: "detached" }).catch(() => undefined);
  await page.locator("dialog[open]").waitFor({ state: "hidden" });
}
await create("locais", async (d) => {
  await d.locator("#f-name").fill("Local de verificação");
  await d.locator("#f-city").fill("Luanda");
});
await create("estruturas", async (d) => {
  await d.locator("#f-code").fill("E-UI");
  await d.locator("#f-location_id").selectOption({ label: "Local de verificação" });
  await d.locator("#f-footprint_area_m2").fill("10");
  await d.locator("#f-cultivation_area_m2").fill("30");
});
await create("culturas", async (d) => d.locator("#f-name").fill("Salsa"));
await create("ciclos", async (d) => {
  await d.locator("#f-code").fill("C-UI");
  await d.locator("#f-crop_id").selectOption({ label: "Salsa" });
  await d.locator("#f-structure_id").selectOption({ index: 1 });
  await d.locator("#f-start_date").fill("2026-01-01");
  await d.locator("#f-end_date").fill("2026-03-01");
});
await create("colheitas", async (d) => {
  await d.locator("#f-cycle_id").selectOption({ label: "C-UI" });
  await d.locator("#f-harvest_date").fill("2026-02-20");
  await d.locator("#f-gross_kg").fill("110");
  await d.locator("#f-marketable_kg").fill("100");
});
await create("despesas", async (d) => {
  await d.locator("#f-expense_date").fill("2026-01-05");
  await d.locator("#f-category").selectOption("seeds");
  await d.locator("#f-description").fill("Despesa didática de verificação");
  await d.locator("#f-amount").fill("50000");
});
await create("reparticoes", async (d) => {
  await d.locator("#f-expense_id").selectOption({ index: 1 });
  await d.locator("#f-cycle_id").selectOption({ label: "C-UI" });
  await d.locator("#f-method").selectOption("direct");
  await d.locator("#f-share").fill("1");
});
log("estrutura, ciclo, colheita, despesa e repartição criados por formulários");

await page.goto(`${BASE}/app/analise/indicadores`);
const row = page.locator("tr", { hasText: "Custo operacional por kg" }).first();
await row.getByText("500").waitFor();
await page.locator("tr", { hasText: "Produtividade por área de implantação" }).first().getByText("10").first().waitFor();
await page.screenshot({ path: `${SHOTS}/3-indicadores.png`, fullPage: true });
log("indicadores: 500 AOA/kg e 10 kg/m² (fixture didática)");

await page.goto(`${BASE}/app/gestao/exportacoes`);
await page.getByRole("button", { name: "Ver escopo antes de gerar" }).click();
await page.getByRole("button", { name: "Gerar XLSX" }).click();
await page.getByRole("button", { name: "Descarregar" }).first().waitFor({ timeout: 30000 });
const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Descarregar" }).first().click()]);
const out = `${SHOTS}/export-browser.xlsx`;
await dl.saveAs(out);
log(`XLSX gerado pela fila e descarregado: ${out}`);

// Documento académico (Word) pela interface
await page.getByRole("button", { name: "Gerar DOCX" }).click();
const docxRow = page.locator("tr", { hasText: ".docx" });
await docxRow.getByRole("button", { name: "Descarregar" }).waitFor({ timeout: 60000 });
const [dd] = await Promise.all([page.waitForEvent("download"), docxRow.getByRole("button", { name: "Descarregar" }).click()]);
const docxOut = `${SHOTS}/documento-browser.docx`;
await dd.saveAs(docxOut);
if (fs.readFileSync(docxOut).subarray(0, 2).toString() !== "PK") throw new Error("DOCX inválido");
log(`DOCX académico gerado pela fila e descarregado: ${docxOut}`);

// ---------- Telemóvel ----------
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const m = await mobile.newPage();
await m.goto(`${BASE}/p/vrban/monografia`);
await m.getByText("A agricultura urbana vertical").waitFor();
const overflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
if (overflow > 1) throw new Error(`deslocamento horizontal no telemóvel: ${overflow}px`);
await m.screenshot({ path: `${SHOTS}/4-telemovel-publico.png`, fullPage: true });
const mc = await mobile.newPage();
await mc.goto(`${BASE}/entrar`);
await mc.fill("#email", EMAIL);
await mc.fill("#password", PASSWORD);
await mc.click("button[type=submit]");
await mc.waitForURL(/\/app$/);
await mc.goto(`${BASE}/app/escrita/unidades`);
await mc.getByRole("heading", { name: "Próximo parágrafo" }).waitFor();
const ov2 = await mc.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
if (ov2 > 1) throw new Error(`deslocamento horizontal no próximo parágrafo (telemóvel): ${ov2}px`);
await mc.getByRole("button", { name: /Histórico \(1 integrada\)/ }).click();
await mc.locator(".unit-list a").first().click();
await mc.locator(".stepper").waitFor();
const ov3 = await mc.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
if (ov3 > 1) throw new Error(`deslocamento horizontal na ficha da unidade (telemóvel): ${ov3}px`);
await mc.screenshot({ path: `${SHOTS}/7-telemovel-unidade.png`, fullPage: true });
await mc.goto(`${BASE}/app`);
await mc.getByRole("button", { name: "☰ Menu" }).click();
await mc.getByRole("link", { name: "Colheitas" }).click();
await mc.getByRole("heading", { name: "Colheitas" }).waitFor();
await mc.screenshot({ path: `${SHOTS}/5-telemovel-privado.png`, fullPage: true });
log("apresentação móvel: sem deslocamento horizontal no público; menu recolhível na área privada");

// ---------- Teclado ----------
const k = await ctx.newPage();
await k.goto(`${BASE}/p/vrban`);
await k.getByRole("heading", { level: 1 }).waitFor();
await k.keyboard.press("Tab");
const focused = await k.evaluate(() => document.activeElement?.textContent);
if (!/Saltar para o conteúdo/.test(focused ?? "")) throw new Error("primeiro foco não é a ligação de salto");
log("navegação por teclado: ligação “Saltar para o conteúdo” recebe o primeiro foco");

await browser.close();
const relevant = errors.filter((e) => !/Failed to load resource.*(401|404)/.test(e));
if (relevant.length) {
  console.error("Erros na consola:", relevant);
  process.exit(1);
}
console.log("OK — percursos académico e analítico verificados em browser.");
