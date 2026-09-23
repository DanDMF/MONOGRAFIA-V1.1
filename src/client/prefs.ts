// Preferências de leitura por visitante (conveniência local; nunca estado essencial).
export interface Prefs {
  theme: "auto" | "light" | "dark";
  fontScale: number; // 0.9 – 1.4
  reduceMotion: boolean;
  readingMode: boolean;
}
const KEY = "vrban.prefs";
const DEFAULT: Prefs = { theme: "auto", fontScale: 1, reduceMotion: false, readingMode: false };

export function loadPrefs(): Prefs {
  try {
    return { ...DEFAULT, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Prefs>) };
  } catch {
    return DEFAULT;
  }
}
export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* armazenamento indisponível: preferências só nesta sessão */
  }
  applyPreferences(p);
}
export function applyPreferences(p = loadPrefs()) {
  const root = document.documentElement;
  if (p.theme === "auto") delete root.dataset.theme;
  else root.dataset.theme = p.theme;
  root.style.setProperty("--font-scale", String(p.fontScale));
  root.dataset.reduceMotion = String(p.reduceMotion);
  root.dataset.reading = String(p.readingMode);
}
