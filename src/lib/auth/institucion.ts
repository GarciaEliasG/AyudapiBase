import {
  getBearerToken,
  getRolesForUser,
  getSessionUser,
  jsonError,
  type SessionUser,
} from "@/lib/auth/session";
import { createAdminServerClient } from "@/lib/supabase/server";

export interface AccesoInstitucional {
  ok: true;
  institucionId: string | null;
  user: SessionUser;
}

export type AccesoInstitucionalResultado =
  | AccesoInstitucional
  | { ok: false; response: Response };

/**
 * Autentica la request y exige rol `institucion` o `admin` (verificado con
 * `getRolesForUser`, admitiendo usuarios con roles múltiples). Devuelve el
 * `institucion_id` resuelto para cuentas con rol `institucion`, usándolo
 * también al registrar las consultas en `logs_auditoria`.
 */
export async function autenticarInstitucional(
  req: Request,
): Promise<AccesoInstitucionalResultado> {
  const token = getBearerToken(req.headers.get("authorization"));
  if (!token) {
    return { ok: false, response: jsonError("Autenticación requerida.", 401) };
  }
  const user = await getSessionUser(token);
  if (!user) {
    return { ok: false, response: jsonError("Sesión inválida o expirada.", 401) };
  }

  const roles = await getRolesForUser(user.id);
  if (!roles.includes("institucion") && !roles.includes("admin")) {
    return {
      ok: false,
      response: jsonError(
        "Acceso denegado: este módulo es exclusivo de instituciones y administradores.",
        403,
      ),
    };
  }

  let institucionId: string | null = null;
  if (roles.includes("institucion")) {
    const { data, error } = await createAdminServerClient()
      .from("perfiles_institucion")
      .select("id")
      .eq("usuario_id", user.id)
      .maybeSingle();
    if (error) {
      return { ok: false, response: jsonError(error.message, 500, error.code) };
    }
    institucionId = data?.id ?? null;
  }

  return { ok: true, institucionId, user };
}

/**
 * Insert en `logs_auditoria` para cada consulta del panel institucional. No
 * registra PII del paciente: solo el operador, la institución, la acción y los
 * parámetros de la consulta.
 */
export async function registrarConsultaAuditoria(opts: {
  accion: string;
  detalles?: Record<string, unknown>;
  institucionId?: string | null;
  userId: string;
}) {
  return createAdminServerClient().from("logs_auditoria").insert({
    accion: opts.accion,
    detalles: opts.detalles ?? {},
    institucion_id: opts.institucionId ?? null,
    usuario_id: opts.userId,
  });
}