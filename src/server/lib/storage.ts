// Interface de armazenamento de ficheiros. Implementação local persistente para desenvolvimento;
// uma implementação de armazenamento de objetos pode ser acrescentada sem alterar os módulos.
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export interface Storage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  describe(): string;
}

export class LocalStorage implements Storage {
  constructor(private readonly root: string) {
    fs.mkdirSync(root, { recursive: true });
  }
  private resolve(key: string): string {
    if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes("..")) throw new Error("Chave de armazenamento inválida.");
    return path.join(this.root, key);
  }
  async put(key: string, data: Buffer) {
    const file = this.resolve(key);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    await fsp.writeFile(tmp, data);
    await fsp.rename(tmp, file); // escrita atómica
  }
  get(key: string) {
    return fsp.readFile(this.resolve(key));
  }
  async exists(key: string) {
    return fsp.access(this.resolve(key)).then(() => true, () => false);
  }
  async delete(key: string) {
    await fsp.rm(this.resolve(key), { force: true });
  }
  describe() {
    return `local:${this.root}`;
  }
}

/** Nome seguro para cabeçalho Content-Disposition. */
export function safeFileName(name: string): string {
  const base = name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "_").slice(0, 120);
  return base || "ficheiro";
}
