import { prioridadPrincipal } from "@/lib/auth/registro";
import { getBearerToken, getRolesForUser, getSessionUser, jsonError, jsonOk } from "@/lib/auth/session";

export const runtime = "nodejs";

/**
 * Reconoce al usuario autenticado en base de datos sin crear nada: devuelve
 * los roles vinculados y el rol principal. A diferencia de `/api/auth/rol`,
 * nunca provisiona, por lo que el callback puede distinguir una cuenta nueva
 * (sin roles → panel de vinculación) de una existente (→ su panel).
 */
export async function GET(req: Request) {
  const token = getBearerToken(req.headers.get("authorization"));
  if (!token) {
    return jsonError("Autenticación requerida.", 401);
  }
  const usuario = await getSessionUser(token);
  if (!usuario) {
    return jsonError("Sesión inválida o expirada.", 401);
  }

  const roles = await getRolesForUser(usuario.id);

  return jsonOk({ email: usuario.email ?? null, rol: prioridadPrincipal(roles), roles });
}
