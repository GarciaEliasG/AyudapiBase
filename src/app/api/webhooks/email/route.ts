import { parseJsonBody } from "@/lib/api/http";
import { jsonError, jsonOk } from "@/lib/auth/session";
import { esEmailValido } from "@/lib/validation/profile";

export const runtime = "nodejs";

const ASUNTO_MAX = 200;
const TEXTO_MAX = 10000;
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

/**
 * Cuerpo esperado por este webhook. `ip` y `tipo` son opcionales y solo
 * informativos (los envía `registrarActividadSesion`); el envío solo requiere
 * `destino`, `asunto` y `texto`.
 */
interface EmailWebhookRequest {
  asunto?: string;
  destino?: string;
  ip?: string | null;
  texto?: string;
  tipo?: string;
}

interface Remitente {
  email: string;
  nombre: string;
}

/**
 * Remitente verificado en Brevo. Fuente: `BREVO_FROM_EMAIL` (+ nombre
 * opcional en `BREVO_FROM_NAME`, por defecto "AyudAPI"). Por compatibilidad
 * con la configuración anterior se acepta el formato legacy de
 * `RESEND_FROM_EMAIL` ("Nombre <email>" o email plano).
 */
function remitente(): Remitente | null {
  const nombre = process.env.BREVO_FROM_NAME?.trim() || "AyudAPI";
  const directo = process.env.BREVO_FROM_EMAIL?.trim();
  if (directo && esEmailValido(directo)) {
    return { email: directo, nombre };
  }
  const legacy = process.env.RESEND_FROM_EMAIL?.trim() ?? "";
  const entreCorchetes = legacy.match(/<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/)?.[1];
  const email = entreCorchetes ?? (esEmailValido(legacy) ? legacy : null);
  if (!email) {
    return null;
  }
  return { email, nombre };
}

/**
 * Webhook de envío de correos transaccionales (avisos de actividad de
 * sesión) mediante la API SMTP de Brevo.
 *
 * - `POST` con `{ destino, asunto, texto }`.
 * - Se autentica con la cabecera `api-key` (`BREVO_API_KEY` o `SIB_API_KEY`).
 * - Valida el email de destino y los límites de tamaño antes de enviar.
 * - Si `NOTIFICACIONES_EMAIL_SECRETO` está configurado, exige el encabezado
 *   `x-webhook-secreto` con el mismo valor para evitar que terceros usen este
 *   endpoint como retransmisor de spam.
 * - Responde siempre JSON: éxito (`{ message, id }`) o error
 *   (`{ error: { message } }`) según la convención del proyecto.
 */
export async function POST(req: Request) {
  const apiKey =
    process.env.BREVO_API_KEY?.trim() || process.env.SIB_API_KEY?.trim();
  if (!apiKey) {
    return jsonError("Servicio de correo no configurado.", 500);
  }

  const secreto = process.env.NOTIFICACIONES_EMAIL_SECRETO?.trim();
  if (secreto) {
    const recibido = req.headers.get("x-webhook-secreto")?.trim();
    if (recibido !== secreto) {
      return jsonError("No autorizado.", 401);
    }
  }

  const parsed = await parseJsonBody<EmailWebhookRequest>(req);
  if (!parsed.ok) {
    return parsed.response;
  }
  const destino = parsed.data.destino?.trim() ?? "";
  const asunto = parsed.data.asunto?.trim() ?? "";
  const texto = parsed.data.texto?.trim() ?? "";

  if (!esEmailValido(destino)) {
    return jsonError("El email de destino es inválido.", 400);
  }
  if (asunto.length === 0 || asunto.length > ASUNTO_MAX) {
    return jsonError(`El asunto es obligatorio (máximo ${ASUNTO_MAX} caracteres).`, 400);
  }
  if (texto.length === 0 || texto.length > TEXTO_MAX) {
    return jsonError(`El texto es obligatorio (máximo ${TEXTO_MAX} caracteres).`, 400);
  }

  const desde = remitente();
  if (!desde) {
    return jsonError("Servicio de correo no configurado.", 500);
  }

  try {
    const res = await fetch(BREVO_API_URL, {
      body: JSON.stringify({
        sender: { email: desde.email, name: desde.nombre },
        subject: asunto,
        textContent: texto,
        to: [{ email: destino }],
      }),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      method: "POST",
    });
    if (!res.ok) {
      const detalle = (await res.json().catch(() => null)) as {
        message?: string;
      } | null;
      console.error(
        "[webhooks/email] Brevo rechazó el envío:",
        detalle?.message ?? `HTTP ${res.status}`,
      );
      return jsonError("No se pudo enviar el correo. Reintentá más tarde.", 502);
    }
    const payload = (await res.json().catch(() => null)) as {
      messageId?: string;
    } | null;
    return jsonOk({ id: payload?.messageId ?? null, message: "Correo enviado." });
  } catch (err) {
    console.error("[webhooks/email] Error inesperado enviando el correo:", err);
    return jsonError("No se pudo enviar el correo. Reintentá más tarde.", 500);
  }
}
