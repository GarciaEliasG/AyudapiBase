import type { TipoActividadSesion } from "@/lib/auth/actividad";

import { parseJsonBody } from "@/lib/api/http";
import {
  ipDeRequest,
  registrarActividadSesion,
} from "@/lib/auth/actividad-servidor";
import {
  getBearerToken,
  getSessionUser,
  jsonError,
  jsonOk,
} from "@/lib/auth/session";
import { createAdminServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const TIPOS_VALIDOS: TipoActividadSesion[] = ["inicio_sesion", "registro"];

interface NotificarActividadRequest {
  tipo?: TipoActividadSesion;
}

/**
 * Registra actividad de sesión (inicio de sesión o registro nuevo) para el
 * usuario del Bearer token: auditoría en `logs_auditoria` + aviso por correo
 * a la cuenta asociada cuando hay proveedor configurado. Deduplica por
 * ventana temporal para no duplicar avisos ante reintentos o eventos
 * repetidos de `onAuthStateChange`. Nunca bloquea el flujo de auth.
 */
export async function POST(req: Request) {
  const token = getBearerToken(req.headers.get("authorization"));
  if (!token) {
    return jsonError("Autenticación requerida.", 401);
  }
  let usuario: Awaited<ReturnType<typeof getSessionUser>>;
  try {
    usuario = await getSessionUser(token);
  } catch {
    return jsonError("No se pudo validar la sesión. Reintentá.", 500);
  }
  if (!usuario) {
    return jsonError("Sesión inválida o expirada.", 401);
  }

  const parsed = await parseJsonBody<NotificarActividadRequest>(req);
  if (!parsed.ok) {
    return parsed.response;
  }
  const tipo = parsed.data.tipo;
  if (!tipo || !TIPOS_VALIDOS.includes(tipo)) {
    return jsonError("Tipo de actividad inválido.", 400);
  }

  const resultado = await registrarActividadSesion(createAdminServerClient(), {
    accion: tipo,
    detalles: { canal: "notificar-actividad" },
    direccionIp: ipDeRequest(req),
    email: usuario.email ?? null,
    usuarioId: usuario.id,
  });

  return jsonOk({
    email_enviado: resultado.emailEnviado,
    message: "Actividad registrada.",
  });
}
