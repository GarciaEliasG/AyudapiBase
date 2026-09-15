import { jsonError } from "@/lib/auth/session";

export type ParseResult<T> =
  | { data: T; ok: true }
  | { ok: false; response: Response };

export async function parseJsonBody<T>(req: Request): Promise<ParseResult<T>> {
  try {
    const text = await req.text();
    if (!text) {
      return { data: {} as T, ok: true };
    }
    return { data: JSON.parse(text) as T, ok: true };
  } catch {
    return { ok: false, response: jsonError("Cuerpo JSON inválido.", 400) };
  }
}

export function mapDbError(
  error: { code?: string; message?: string },
  fallback = "Error de base de datos.",
) {
  if (error.code === "23505") {
    return jsonError("Ya existe un registro con esos datos.", 409, error.message);
  }
  return jsonError(error.message ?? fallback, 500);
}