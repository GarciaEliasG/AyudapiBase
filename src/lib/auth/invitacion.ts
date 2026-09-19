import type { SupabaseClient } from "@supabase/supabase-js";

import { MENSAJE_MEDICO_INVITACION } from "@/lib/validation/schemas";

/**
 * Gates de invitación (códigos server-only, nunca `NEXT_PUBLIC_`).
 *
 * Patrón fail-closed compartido por institución y médico:
 * - Secreto configurado + código exacto → `{ ok: true, modo: "codigo" }`.
 * - Secreto configurado + código ausente/distinto → 403. Nunca se permite el
 *   alta por la vía de invitación sin el código, en ningún entorno.
 * - Secreto NO configurado → el mecanismo no existe: el llamador decide
 *   (institución bloquea en producción / permite en dev; médico cae a la
 *   validación estricta clásica con 400). Llamar al gate sin secreto
 *   configurado también falla cerrado con 403 (defensa en profundidad).
 */

export type ModoInvitacion = "codigo" | "dev-sin-codigo";

export type ResultadoInvitacion =
  | { modo: ModoInvitacion; ok: true }
  | { code: string; mensaje: string; ok: false; status: 403 };

/** Secreto server-only que habilita la vía de invitación médica. */
export const MEDICO_INVITE_ENV = "MEDICO_INVITE_CODE";
export const CODIGO_MEDICO_INVALIDO = "INVITACION_MEDICO_INVALIDA";
export const CODIGO_MEDICO_DESHABILITADO = "INVITACION_MEDICO_DESHABILITADA";

function leerSecreto(nombreEnv: string): string {
  // eslint-disable-next-line security/detect-object-injection -- acceso a env por constante conocida, no input de usuario.
  return (process.env[nombreEnv] ?? "").trim();
}

/**
 * Núcleo genérico del gate. `mensajes` aporta los textos/códigos propios de
 * cada rol para no duplicar la lógica de comparación y falla cerrada.
 */
export function verificarCodigoInvitacion(
  codigo: unknown,
  secreto: string,
  mensajes: {
    deshabilitado: string;
    deshabilitadoCode: string;
    invalido: string;
    invalidoCode: string;
  },
): ResultadoInvitacion {
  const entregado = typeof codigo === "string" ? codigo.trim() : "";
  if (!secreto) {
    if (process.env.NODE_ENV === "production") {
      return {
        code: mensajes.deshabilitadoCode,
        mensaje: mensajes.deshabilitado,
        ok: false,
        status: 403,
      };
    }
    return { modo: "dev-sin-codigo", ok: true };
  }
  if (!entregado || entregado !== secreto) {
    return {
      code: mensajes.invalidoCode,
      mensaje: mensajes.invalido,
      ok: false,
      status: 403,
    };
  }
  return { modo: "codigo", ok: true };
}

/**
 * `true` si la vía de invitación médica está habilitada
 * (`MEDICO_INVITE_CODE` configurado). Los endpoints la consultan ANTES de
 * ofrecer la vía sin matrícula; sin secreto rige la validación estricta
 * clásica (matrícula obligatoria, 400).
 */
export function invitacionMedicaHabilitada(): boolean {
  return leerSecreto(MEDICO_INVITE_ENV).length > 0;
}

/**
 * Gate de la vía médica sin matrícula (matrícula ausente o en trámite).
 * Falla cerrado: sin secreto configurado o con código inválido → 403.
 */
export function verificarCodigoInvitacionMedico(codigo: unknown): ResultadoInvitacion {
  return verificarCodigoInvitacion(codigo, leerSecreto(MEDICO_INVITE_ENV), {
    deshabilitado: "La invitación médica está deshabilitada. Ingresá tu matrícula profesional.",
    deshabilitadoCode: CODIGO_MEDICO_DESHABILITADO,
    invalido: MENSAJE_MEDICO_INVITACION,
    invalidoCode: CODIGO_MEDICO_INVALIDO,
  });
}

/**
 * Lee el marcador de excepción por invitación del médico
 * (`perfiles_medico.invite_modo`). Devuelve `'codigo'` si opera bajo
 * excepción, `null` en caso contrario. Pre-migración (columna ausente) o
 * ante cualquier error degrada a `null` sin romper: la auditoría simplemente
 * no etiqueta y los guards usan el criterio clásico.
 */
export async function inviteModoMedico(
  admin: SupabaseClient,
  usuarioId: string,
): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from("perfiles_medico")
      .select("invite_modo")
      .eq("usuario_id", usuarioId)
      .maybeSingle();
    if (error || !data) {
      return null;
    }
    const modo = (data as { invite_modo?: unknown }).invite_modo;
    return typeof modo === "string" && modo.trim().length > 0 ? modo.trim() : null;
  } catch {
    return null;
  }
}
