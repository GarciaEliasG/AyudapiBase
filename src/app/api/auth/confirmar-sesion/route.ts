import type { RolUsuario } from "@/lib/supabase/database";

import { parseJsonBody } from "@/lib/api/http";
import { confirmarYProvisionar } from "@/lib/auth/registro";
import { getBearerToken, getSessionUser, jsonError, jsonOk } from "@/lib/auth/session";
import { createAdminServerClient } from "@/lib/supabase/server";
import { esEmailValido } from "@/lib/validation/profile";

export const runtime = "nodejs";

const ROLES_VALIDOS: RolUsuario[] = ["paciente", "medico", "institucion"];

interface ConfirmarSesionRequest {
  email?: string;
  /** Rol elegido al crear la cuenta con Google (paciente / medico / institucion). */
  rol?: RolUsuario;
  /** Datos del perfil elegidos en el formulario (matrícula, especialidad…). */
  datos?: Record<string, unknown>;
}

/**
 * Confirma el email de la sesión actual (flujo de magic-link/callback) y da de
 * alta el perfil definitivo en la base de datos si todavía no existía. Devuelve
 * el rol principal para que el cliente enrute la UI correctamente.
 */
export async function POST(req: Request) {
  const token = getBearerToken(req.headers.get("authorization"));
  if (!token) {
    return jsonError("Autenticación requerida.", 401);
  }
  const usuario = await getSessionUser(token);
  if (!usuario) {
    return jsonError("Sesión inválida o expirada.", 401);
  }

  const parsed = await parseJsonBody<ConfirmarSesionRequest>(req);
  if (!parsed.ok) {
    return parsed.response;
  }
  const emailParam = parsed.data.email?.trim();
  if (emailParam) {
    if (!esEmailValido(emailParam)) {
      return jsonError("Email inválido en el cuerpo de la solicitud.", 400);
    }
    if (emailParam.toLowerCase() !== (usuario.email ?? "").toLowerCase()) {
      return jsonError("El email no corresponde a la sesión actual.", 403);
    }
  }

  // Rol/datos pedidos durante "Crear cuenta con Google": se usan para dar el
  // alta con ese perfil en lugar del default "paciente".
  const rolSolicitado =
    parsed.data.rol && ROLES_VALIDOS.includes(parsed.data.rol)
      ? parsed.data.rol
      : undefined;
  const datosSolicitados =
    parsed.data.datos &&
    typeof parsed.data.datos === "object" &&
    !Array.isArray(parsed.data.datos)
      ? parsed.data.datos
      : undefined;

  let rol: RolUsuario | null = null;
  try {
    const resultado = await confirmarYProvisionar(
      createAdminServerClient(),
      usuario,
      {
        appDatos: datosSolicitados,
        appRol: rolSolicitado,
      },
    );
    rol = resultado.rol;
  } catch (err) {
    console.error("[confirmar-sesion] No se pudo dar de alta el perfil:", err);
    return jsonError("No se pudo completar el alta del perfil. Reintentá.", 500);
  }

  return jsonOk({ rol });
}