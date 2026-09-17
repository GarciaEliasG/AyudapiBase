import type { SupabaseClient } from "@supabase/supabase-js";

import type { TipoActividadSesion } from "@/lib/auth/actividad";

/**
 * Registro y aviso de actividad de sesión desde el servidor.
 *
 * Inserta una fila en `logs_auditoria` (trazabilidad, Ley 25.326) e intenta
 * enviar el correo de aviso a la cuenta asociada cuando hay un proveedor
 * configurado (`NOTIFICACIONES_EMAIL_WEBHOOK_URL`). Si no hay proveedor, la
 * auditoría queda registrada igualmente y el flujo de auth NUNCA se bloquea:
 * todas las funciones son best-effort y nunca lanzan excepciones.
 */

const VENTANA_DEDUPE_MS = 15 * 60 * 1000;

function asuntoPara(tipo: TipoActividadSesion): string {
  return tipo === "registro"
    ? "Tu cuenta de AyudAPI fue creada"
    : "Nuevo inicio de sesión en AyudAPI";
}

function cuerpoPara(
  tipo: TipoActividadSesion,
  email: string | null,
  ip: string | null,
): string {
  const fecha = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
  const encabezado =
    tipo === "registro"
      ? `Hola${email ? ` (${email})` : ""}: se creó una cuenta de AyudAPI asociada a este correo el ${fecha}.`
      : `Hola${email ? ` (${email})` : ""}: se detectó un inicio de sesión en tu cuenta de AyudAPI el ${fecha}.`;
  const origen = ip ? ` Origen aproximado (IP): ${ip}.` : "";
  return `${encabezado}${origen} Si no fuiste vos, cambiá tu contraseña de inmediato y comunicate con el administrador de la plataforma.`;
}

async function intentarEnvioCorreo(
  destino: string,
  tipo: TipoActividadSesion,
  ip: string | null,
): Promise<boolean> {
  const webhook = process.env.NOTIFICACIONES_EMAIL_WEBHOOK_URL?.trim();
  if (!webhook) {
    return false;
  }
  const secreto = process.env.NOTIFICACIONES_EMAIL_SECRETO?.trim();
  try {
    const res = await fetch(webhook, {
      body: JSON.stringify({
        asunto: asuntoPara(tipo),
        destino,
        ip,
        texto: cuerpoPara(tipo, destino, ip),
        tipo,
      }),
      headers: {
        "Content-Type": "application/json",
        ...(secreto ? { "x-webhook-secreto": secreto } : {}),
      },
      method: "POST",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface ActividadSesion {
  accion: TipoActividadSesion;
  detalles?: Record<string, unknown>;
  direccionIp?: string | null;
  email?: string | null;
  usuarioId: string;
}

/**
 * Registra la actividad en `logs_auditoria` (con deduplicación por ventana
 * temporal) e intenta el aviso por correo. Nunca lanza excepciones.
 */
export async function registrarActividadSesion(
  admin: SupabaseClient,
  actividad: ActividadSesion,
): Promise<{ duplicada: boolean; emailEnviado: boolean }> {
  const resultado = { duplicada: false, emailEnviado: false };
  try {
    const desde = new Date(Date.now() - VENTANA_DEDUPE_MS).toISOString();
    const { data: previa } = await admin
      .from("logs_auditoria")
      .select("id")
      .eq("usuario_id", actividad.usuarioId)
      .eq("accion", actividad.accion)
      .gte("creado_en", desde)
      .limit(1)
      .maybeSingle();
    if (previa) {
      resultado.duplicada = true;
      return resultado;
    }

    const emailEnviado = actividad.email
      ? await intentarEnvioCorreo(actividad.email, actividad.accion, actividad.direccionIp ?? null)
      : false;
    resultado.emailEnviado = emailEnviado;

    await admin.from("logs_auditoria").insert({
      accion: actividad.accion,
      detalles: {
        ...(actividad.detalles ?? {}),
        email_enviado: emailEnviado,
      },
      direccion_ip: actividad.direccionIp ?? null,
      usuario_id: actividad.usuarioId,
    });
  } catch {
    // Best-effort: la auditoría nunca bloquea el flujo de autenticación.
  }
  return resultado;
}

/** Extrae la IP del cliente desde los encabezados del request. */
export function ipDeRequest(req: Request): string | null {
  const directa =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim();
  return directa && directa.length > 0 ? directa : null;
}
