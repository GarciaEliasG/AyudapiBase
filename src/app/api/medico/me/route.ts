import type { PerfilMedicoRow } from "@/lib/supabase/database";

import {
  getBearerToken,
  getRolesForUser,
  getSessionUser,
  jsonError,
  jsonOk,
} from "@/lib/auth/session";
import { createAdminServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const token = getBearerToken(req.headers.get("authorization"));
  if (!token) {
    return jsonError("Autenticación requerida.", 401);
  }
  const user = await getSessionUser(token);
  if (!user) {
    return jsonError("Sesión inválida o expirada.", 401);
  }
  const roles = await getRolesForUser(user.id);
  if (!roles.includes("medico")) {
    return jsonError("Solo el personal médico puede acceder a este recurso.", 403);
  }

  const admin = createAdminServerClient();

  const { data: perfil, error } = await admin
    .from("perfiles_medico")
    .select("*")
    .eq("usuario_id", user.id)
    .maybeSingle();
  if (error) {
    return jsonError(error.message, 500, error.code);
  }
  if (!perfil) {
    return jsonError("Perfil de médico no encontrado.", 404);
  }

  return jsonOk({
    email: user.email ?? null,
    perfil: perfil as PerfilMedicoRow,
  });
}