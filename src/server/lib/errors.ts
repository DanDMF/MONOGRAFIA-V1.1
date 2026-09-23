export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "Registo") => new AppError(404, "not_found", `${what} não encontrado.`);
export const forbidden = (msg = "Sem permissão para esta operação.") => new AppError(403, "forbidden", msg);
export const unauthorized = () => new AppError(401, "unauthorized", "Autenticação necessária.");
export const badRequest = (msg: string, details?: unknown) => new AppError(400, "bad_request", msg, details);
export const conflict = (msg: string, details?: unknown) => new AppError(409, "conflict", msg, details);
