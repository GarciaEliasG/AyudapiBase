import type { RolUsuario } from "@/lib/supabase/database";

import { confirmarYProvisionar } from "@/lib/auth/registro";
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

  // Auto-provisión para usuarios que todavía no tienen rol (p. ej. OAuth/Google
  // o registros con alta diferida). La cuenta se confirma en el proceso para que
  // el acceso sea siempre fluido.
  if (!rol) {
    try {
      const resultado = await confirmarYProvisionar(createAdminServerClient(), user);
      rol = resultado.rol;
    } catch (error) {
      console.error("[auth/rol] No se pudo provisionar el rol:", error);
      return jsonError("No se pudo completar el alta del perfil. Reintentá.", 500);
    }
  }

  return jsonOk({ rol: rol as RolUsuario });
}