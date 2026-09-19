import type { SupabaseClient } from "@supabase/supabase-js";

import { parseJsonBody } from "@/lib/api/http";
import { ipDeRequest, registrarActividadSesion } from "@/lib/auth/actividad-servidor";
import { isDevBypassActiveFor } from "@/lib/auth/dev-bypass";
import { jsonError, jsonOk } from "@/lib/auth/session";
import { createAdminServerClient, createAnonServerClient } from "@/lib/supabase/server";
import { esMatriculaProvisoria, esMatriculaDePrueba } from "@/lib/validation/profile";
import { esEmailValido } from "@/lib/validation/profile";
import { MENSAJE_BYPASS_DENEGADO, MENSAJE_SISA } from "@/lib/validation/schemas";

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
 * Control de acceso del panel médico (etapa de desarrollo): el estado
 * "pendiente" —incluida la matrícula provisoria `PENDIENTE-...`— posee los
 * mismos permisos que "verificado", sin bloqueos. Solo se bloquea:
 * - Matrícula `TEST-...` sin bypass → 403 (canal de prueba exclusivo dev).
 * - `estado_verificacion = "rechazado"` → 403 ("Médico no registrado…").
 * - Sin fila o con matrícula provisoria → se permite (completa el alta en
 *   `/medico/completar-perfil` o `/api/auth/vincular-rol`).
 */
async function bloqueoPanelMedico(
  admin: SupabaseClient,
  usuarioId: string,
  email: string | null,
): Promise<Response | null> {
  const { data: roles } = await admin
    .from("roles_usuario")
    .select("rol")
    .eq("usuario_id", usuarioId);
  const esMedico = (roles ?? []).some(
    (r) => (r as { rol?: string }).rol === "medico",
  );
  if (!esMedico) {
    return null;
  }
  const bypass = isDevBypassActiveFor(email);
  const { data: perfil } = await admin
    .from("perfiles_medico")
    .select("matricula, estado_verificacion")
    .eq("usuario_id", usuarioId)
    .maybeSingle();
  if (!perfil) {
    return null;
  }
  const matricula =
    typeof (perfil as { matricula?: unknown }).matricula === "string"
      ? String((perfil as { matricula?: unknown }).matricula)
      : "";
  // Sin credencial real todavía: a completar el alta (mismo rigor allí).
  if (esMatriculaProvisoria(matricula) || matricula.trim().length === 0) {
    return null;
  }
  if (esMatriculaDePrueba(matricula) && !bypass) {
    return jsonError(MENSAJE_BYPASS_DENEGADO, 403);
  }
  const estadoRaw = (perfil as { estado_verificacion?: unknown })
    .estado_verificacion;
  const estado =
    typeof estadoRaw === "string" ? estadoRaw.trim().toLowerCase() : "";
  // Etapa de desarrollo: "pendiente" opera igual que "verificado". Solo el
  // rechazo explícito bloquea el inicio de sesión como médico.
  if (!bypass && estado === "rechazado") {
    return jsonError(MENSAJE_SISA, 403);
  }
  return null;
}

/**
 * Login por email y contraseña.
 *
 * Si la cuenta existe pero aparece como "email no confirmado" (p. ej. cuentas
 * creadas antes de simplificar el flujo, o con SMTP sin despachar), se confirma
 * en el servidor y se reintenta el inicio de sesión de inmediato. Así ninguna
 * cuenta real queda inhabilitada por depender de un correo que no llega.
 *
 * El acceso como médico exige credencial verificada (SISA o bypass
 * autorizado); de lo contrario se responde 403 e impide el panel médico.
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
    if (reintento.error || !reintento.data.session || !reintento.data.user) {
      return jsonError("Email o contraseña incorrectos.", 401);
    }
    const bloqueo = await bloqueoPanelMedico(
      admin,
      reintento.data.user.id,
      reintento.data.user.email ?? email,
    );
    if (bloqueo) {
      return bloqueo;
    }
    await registrarActividadSesion(admin, {
      accion: "inicio_sesion",
      detalles: { canal: "login-email" },
      direccionIp: ipDeRequest(req),
      email: reintento.data.user.email ?? email,
      usuarioId: reintento.data.user.id,
    });
    return jsonOk({ session: tokensDe(reintento.data.session) });
  }

  if (error || !data.session) {
    return jsonError("Email o contraseña incorrectos.", 401);
  }

  const adminFinal = createAdminServerClient();
  const bloqueo = await bloqueoPanelMedico(
    adminFinal,
    data.user.id,
    data.user.email ?? email,
  );
  if (bloqueo) {
    return bloqueo;
  }

  await registrarActividadSesion(adminFinal, {
    accion: "inicio_sesion",
    detalles: { canal: "login-email" },
    direccionIp: ipDeRequest(req),
    email: data.user.email ?? email,
    usuarioId: data.user.id,
  });

  return jsonOk({ session: tokensDe(data.session) });
}

function tokensDe(session: { access_token: string; refresh_token: string }) {
  return { access_token: session.access_token, refresh_token: session.refresh_token };
}
