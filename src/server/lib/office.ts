// Conversão DOCX → PDF com LibreOffice (processo externo, perfil isolado). Opcional: sem LibreOffice,
// a exportação PDF falha com mensagem clara e o DOCX continua disponível.
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const PYTHON = process.env.LIBREOFFICE_PYTHON ?? "python3";
const SCRIPT = path.resolve(process.env.LO_CONVERT_SCRIPT ?? "scripts/lo_convert.py");

export async function docxToPdf(docx: Buffer, timeoutMs = 180_000): Promise<Buffer> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vrban-pdf-"));
  const src = path.join(dir, "documento.docx");
  const dst = path.join(dir, "documento.pdf");
  try {
    await fs.writeFile(src, docx);
    await new Promise<void>((resolve, reject) =>
      execFile(PYTHON, [SCRIPT, src, dst], { timeout: timeoutMs }, (err, _stdout, stderr) =>
        err ? reject(new Error(`Conversão para PDF falhou (é necessário LibreOffice Writer com Python UNO): ${stderr || err.message}`)) : resolve(),
      ),
    );
    return await fs.readFile(dst);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
