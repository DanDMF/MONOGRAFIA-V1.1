import { useState } from "react";
import { loadPrefs, savePrefs, type Prefs } from "../../prefs";

export function ReadingPrefs() {
  const [p, setP] = useState<Prefs>(loadPrefs());
  const upd = (x: Partial<Prefs>) => {
    const n = { ...p, ...x };
    setP(n);
    savePrefs(n);
  };
  return (
    <section style={{ maxWidth: 520, marginTop: "1.5rem" }}>
      <h1>Preferências de leitura</h1>
      <p className="muted">Guardadas apenas neste navegador.</p>
      <fieldset>
        <legend>Tema</legend>
        {(["auto", "light", "dark"] as const).map((t) => (
          <label key={t} className="check">
            <input type="radio" checked={p.theme === t} onChange={() => upd({ theme: t })} /> {t === "auto" ? "Automático (sistema)" : t === "light" ? "Claro" : "Escuro"}
          </label>
        ))}
      </fieldset>
      <div className="field">
        <label htmlFor="fs">Tamanho da letra: {Math.round(p.fontScale * 100)}%</label>
        <input id="fs" type="range" min={0.9} max={1.4} step={0.05} value={p.fontScale} onChange={(e) => upd({ fontScale: Number(e.target.value) })} />
      </div>
      <label className="check">
        <input type="checkbox" checked={p.readingMode} onChange={(e) => upd({ readingMode: e.target.checked })} /> Modo de leitura (texto maior e mais espaçado)
      </label>
      <label className="check">
        <input type="checkbox" checked={p.reduceMotion} onChange={(e) => upd({ reduceMotion: e.target.checked })} /> Reduzir movimento
      </label>
    </section>
  );
}
