import { parseJsonBody } from "@/lib/api/http";
import { jsonError, jsonOk } from "@/lib/auth/session";
import { createAdminServerClient, createAnonServerClient } from "@/lib/supabase/server";
import { esEmailValido } from "@/lib/validation/profile";

export const runtime = "nodejs";

interface LoginRequest {
  email: string;
  password: string;
}

function esEmailNoConfirmado(mensaje: string): boolean {
  const m = mensaje.toLowerCase();
  return (
    m.includes("not confirm") ||
    m.includes("email not confirmed") ||
    m.includes("unconfirmed") ||
    m.includes("verificar tu email") ||
    m.includes("confirm your email")
  );
}

/**
 * Login por email y contraseña.
 *
 * Si la cuenta existe pero aparece como "email no confirmado" (p. ej. cuentas
 * creadas antes de simplificar el flujo, o con SMTP sin despachar), se confirma
 * en el servidor y se reintenta el inicio de sesión de inmediato. Así ninguna
 * cuenta real queda inhabilitada por depender de un correo que no llega.
 */
export async function POST(req: Request) {
  const parsed = await parseJsonBody<LoginRequest>(req);
  if (!parsed.ok) {
    return parsed.response;
  }
  const email = parsed.data.email?.trim() ?? "";
  const password = parsed.data.password ?? "";

  if (!esEmailValido(email)) {
    return jsonError("Ingresá un email válido.", 400);
  }
  if (!password) {
    return jsonError("Ingresá tu contraseña.", 400);
  }

  const anon = createAnonServerClient();
  const { data, error } = await anon.auth.signInWithPassword({ email, password });

  if (error && esEmailNoConfirmado(error.message)) {
    // Auto-confirmación de cuentas preexistentes con email sin confirmar.
    const admin = createAdminServerClient();
    const { data: linkData, error: linkError } =
      await admin.auth.admin.generateLink({
        email,
        password,
        type: "signup",
      });
    if (linkError || !linkData.user) {
      return jsonError("No existe una cuenta con ese email.", 400);
    }
    const { error: confirmError } = await admin.auth.admin.updateUserById(
      linkData.user.id,
      { email_confirm: true },
    );
    if (confirmError) {
      console.error("[login] No se pudo confirmar la cuenta:", confirmError.message);
      return jsonError(
        "Tu cuenta está sin confirmar y no pudimos habilitarla. Intentalo en unos minutos o escribinos.",
        401,
      );
    }

    const reintento = await anon.auth.signInWithPassword({ email, password });
    if (reintento.error || !reintento.data.session) {
      return jsonError("Email o contraseña incorrectos.", 401);
    }
    return jsonOk({ session: tokensDe(reintento.data.session) });
  }

  if (error || !data.session) {
    return jsonError("Email o contraseña incorrectos.", 401);
  }

  return jsonOk({ session: tokensDe(data.session) });
}

function tokensDe(session: { access_token: string; refresh_token: string }) {
  return { access_token: session.access_token, refresh_token: session.refresh_token };
}