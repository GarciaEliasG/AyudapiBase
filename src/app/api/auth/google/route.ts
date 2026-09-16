import { parseJsonBody } from "@/lib/api/http";
import { jsonError, jsonOk } from "@/lib/auth/session";
import { createAnonServerClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/utils";

export const runtime = "nodejs";

interface GoogleAuthRequest {
  redirectTo?: string;
}

/**
 * Inicia OAuth con Google. `redirectTo` debe estar en la lista de Redirect
 * URLs del proyecto Supabase. Se resuelve con `getSiteUrl()` para que funcione
 * tanto en local (`http://localhost:3000`) como en el dominio de producción de
 * Vercel (`https://ayudapi-base.vercel.app`).
 */
/**
 * Convierte los errores de Supabase/OAuth en mensajes comprensibles para el
 * usuario final. En particular distingue el caso de proveedor no habilitado o
 * mal configurado (típico en entornos de desarrollo).
 */
function mensajeAmigableGoogle(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (
    m.includes("not supported") ||
    m.includes("not enabled") ||
    m.includes("unsupported provider") ||
    m.includes("provider is not") ||
    m.includes("no provider") ||
    m.includes("not configured")
  ) {
    return "El inicio de sesión con Google no está habilitado en esta app. Comunicate con el administrador o usá email y contraseña.";
  }
  if (m.includes("redirect") || m.includes("url")) {
    return "Hubo un problema con la URL de redirección. Comunicate con el administrador de la plataforma.";
  }
  return mensaje;
}

export async function POST(req: Request) {
  const parsed = await parseJsonBody<GoogleAuthRequest>(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const siteUrl = getSiteUrl();
  const redirectTo = parsed.data.redirectTo ?? `${siteUrl}/auth/callback`;

  const { data, error } = await createAnonServerClient().auth.signInWithOAuth({
    options: { redirectTo },
    provider: "google",
  });

  if (error) {
    return jsonError(
      `No se pudo iniciar la autenticación con Google. ${mensajeAmigableGoogle(error.message)}`,
      400,
      error.message,
    );
  }

  return jsonOk({ message: "Redirigiendo a Google.", url: data.url });
}