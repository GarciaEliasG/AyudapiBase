import type { Session } from "@supabase/supabase-js";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiFetch<T>(
  path: string,
  session: Session | null,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (session) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(path, {
    // Datos clínicos/sesión: nunca servir desde caché del navegador.
    // Evita pantallas precargadas del usuario anterior al ir atrás o
    // cambiar de cuenta. Se puede sobrescribir pasando `cache` en `init`.
    cache: "no-store",
    ...init,
    headers,
  });
  const payload = (await res.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;

  if (!res.ok) {
    const message = payload?.error?.message ?? "Error inesperado del servidor.";
    throw new ApiError(res.status, message);
  }

  return payload as T;
}