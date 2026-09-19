import type { SupabaseClient } from "@supabase/supabase-js";

import {
  verificarCodigoInvitacion,
  type ResultadoInvitacion,
} from "@/lib/auth/invitacion";
import {
  getBearerToken,
  getRolesForUser,
  getSessionUser,
  jsonError,
  type SessionUser,
} from "@/lib/auth/session";
import { createAdminServerClient } from "@/lib/supabase/server";
import { normalizarCuit } from "@/lib/validation/profile";
import { MENSAJE_INSTITUCION_INVITACION } from "@/lib/validation/schemas";

/** Secreto server-only que habilita el alta institucional. Nunca `NEXT_PUBLIC_`. */
export const INSTITUCION_INVITE_ENV = "INSTITUCION_INVITE_CODE";
export const CODIGO_INSTITUCION_INVALIDO = "INVITACION_INSTITUCION_INVALIDA";
export const CODIGO_INSTITUCION_DESHABILITADA = "ALTA_INSTITUCIONAL_DESHABILITADA";

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

/**
 * Gate de seguridad del alta institucional (anti self-registro público).
 * Delega en el núcleo compartido `@/lib/auth/invitacion` (fail-closed):
 *
 * - Si `INSTITUCION_INVITE_CODE` está configurado: el `codigo` debe coincidir
 *   exacto (comparación con trim). Desacierto → 403 con
 *   `CODIGO_INSTITUCION_INVALIDO`. Falla cerrado.
 * - Si NO está configurado: en producción el alta queda deshabilitada (403
 *   `CODIGO_INSTITUCION_DESHABILITADA`); fuera de producción se permite para
 *   no frenar el desarrollo, pero el endpoint debe auditarlo con
 *   `detalles.invite_bypass = true`.
 *
 * El secreto vive solo en el servidor (env sin prefijo `NEXT_PUBLIC_`).
 * Rotarlo invalida invitaciones pendientes sin migrar datos.
 */
export function verificarCodigoInvitacionInstitucion(
  codigo: unknown,
): ResultadoInvitacion {
  // eslint-disable-next-line security/detect-object-injection -- acceso a env por constante conocida, no input de usuario.
  const secreto = (process.env[INSTITUCION_INVITE_ENV] ?? "").trim();
  return verificarCodigoInvitacion(codigo, secreto, {
    deshabilitado: "El alta institucional está deshabilitada. Contactá a un administrador.",
    deshabilitadoCode: CODIGO_INSTITUCION_DESHABILITADA,
    invalido: MENSAJE_INSTITUCION_INVITACION,
    invalidoCode: CODIGO_INSTITUCION_INVALIDO,
  });
}

/**
 * Unicidad de CUIT en `perfiles_institucion` (normalizado a 11 dígitos).
 * Devuelve mensaje de conflicto 409 o `null` si está libre. Patrón idéntico
 * a `verificarDniGlobal` para médicos/pacientes.
 */
export async function verificarCuitInstitucion(
  admin: SupabaseClient,
  cuit: string | null | undefined,
  excluidoUsuarioId?: string,
): Promise<{ conflicto: string | null; error?: { code?: string; message: string } }> {
  const digitos = normalizarCuit(cuit ?? "");
  if (!digitos) {
    return { conflicto: null };
  }
  // El CUIT puede persistirse con guiones históricos ("30-...-9"): se comparan
  // ambas formas para no dejar duplicados por formato.
  const variantes = new Set<string>([digitos]);
  const conGuiones = `${digitos.slice(0, 2)}-${digitos.slice(2, 10)}-${digitos.slice(10)}`;
  variantes.add(conGuiones);
  const { data, error } = await admin
    .from("perfiles_institucion")
    .select("usuario_id, cuit")
    .in("cuit", [...variantes]);
  if (error) {
    return { conflicto: null, error: { code: error.code, message: error.message } };
  }
  const filas = (data ?? []) as Array<{ cuit: string | null; usuario_id: string }>;
  const ocupado = filas.some(
    (f) =>
      normalizarCuit(f.cuit ?? "") === digitos &&
      (!excluidoUsuarioId || f.usuario_id !== excluidoUsuarioId),
  );
  if (ocupado) {
    const { MENSAJE_CUIT_DUPLICADO } = await import("@/lib/validation/schemas");
    return { conflicto: MENSAJE_CUIT_DUPLICADO };
  }
  return { conflicto: null };
}