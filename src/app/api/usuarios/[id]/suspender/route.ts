import { mapDbError, parseJsonBody } from "@/lib/api/http";
import {
  getBearerToken,
  getRoleForUser,
  getSessionUser,
  jsonError,
  jsonOk,
} from "@/lib/auth/session";
import { createAdminServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface SuspenderRequest {
  motivo?: string;
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = getBearerToken(req.headers.get("authorization"));
  if (!token) {
    return jsonError("Autenticación requerida.", 401);
  }
  const admin = createAdminServerClient();

  const adminUser = await getSessionUser(token);
  if (!adminUser) {
    return jsonError("Sesión inválida o expirada.", 401);
  }
  const adminRol = await getRoleForUser(adminUser.id);
  if (adminRol !== "admin") {
    return jsonError("Solo un administrador puede suspender usuarios.", 403);
  }

  const { id: targetId } = await params;
  if (!targetId) {
    return jsonError("El id de usuario es obligatorio.", 400);
  }

  const targetRol = await getRoleForUser(targetId);
  if (targetRol === "admin") {
    return jsonError("No se puede suspender a otro administrador.", 403);
  }

  const parsed = await parseJsonBody<SuspenderRequest>(req);
  const motivo = parsed.ok ? parsed.data.motivo : undefined;

  const { error: authError } = await admin.auth.admin.updateUserById(targetId, {
    ban_duration: "876000h",
  });
  if (authError) {
    return jsonError(authError.message, authError.status ?? 400);
  }

  const { error: auditError } = await admin.from("logs_auditoria").insert({
    accion: "suspender_usuario",
    detalles: motivo ? { motivo, usuario_suspendido: targetId } : { usuario_suspendido: targetId },
    usuario_id: adminUser.id,
  });
  if (auditError) {
    return mapDbError(auditError);
  }

  return jsonOk({ message: "Usuario suspendido.", suspendido: true, usuario_id: targetId });
}