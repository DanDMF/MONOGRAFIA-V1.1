// Cliente HTTP: cabeçalho anti-CSRF, JSON, erros compreensíveis.
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: any,
  ) {
    super(message);
  }
}

export async function api<T = any>(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: { "X-Requested-With": "vrban", ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Sem ligação ao servidor. Nada foi gravado.");
  }
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) throw new ApiError(res.status, (data && data.message) || `Erro ${res.status}`, data?.details);
  return data as T;
}

export const get = <T = any>(url: string) => api<T>("GET", url);
export const post = <T = any>(url: string, body?: unknown, headers?: Record<string, string>) => api<T>("POST", url, body ?? {}, headers);
export const put = <T = any>(url: string, body: unknown) => api<T>("PUT", url, body);
export const patch = <T = any>(url: string, body: unknown) => api<T>("PATCH", url, body);
export const del = <T = any>(url: string) => api<T>("DELETE", url);

/** Descarrega um ficheiro autenticado (ou gerado por POST) sem expor URLs públicos. */
export async function download(url: string, fileName: string, method: "GET" | "POST" = "GET", body?: unknown) {
  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: { "X-Requested-With": "vrban", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new ApiError(res.status, (() => { try { return JSON.parse(t).message; } catch { return t; } })());
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
