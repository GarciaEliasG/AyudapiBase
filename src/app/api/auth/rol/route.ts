import type { RolUsuario } from "@/lib/supabase/database";

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

  // Con roles múltiples (médico-paciente) se prioriza el rol más privilegiado
  // para que la UI muestre el acceso correcto (p. ej. "Ver mi perfil médico").
  const prioridad: RolUsuario[] = ["admin", "medico", "institucion", "paciente"];
  let rol: RolUsuario | null =
    prioridad.find((r) => roles.includes(r)) ?? null;

  // Auto-provisión para usuarios creados por OAuth (Google), igual que en
  // GET /api/profile: se garantiza que toda sesión válida tenga rol.
  if (!rol) {
    const admin = createAdminServerClient();
    const { error } = await admin.rpc("crear_perfil_inicial", {
      p_datos: { email: user.email },
      p_rol: "paciente",
      p_usuario_id: user.id,
    });
    if (error) {
      return jsonError(error.message, 500, error.code);
    }
    rol = "paciente";
  }

  return jsonOk({ rol: rol as RolUsuario });
}