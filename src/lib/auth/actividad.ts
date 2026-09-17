/**
 * Notificación de actividad de sesión (inicio de sesión / registro).
 *
 * Helper seguro para el cliente: nunca lanza excepciones ni bloquea la UI.
 * El servidor (`/api/auth/notificar-actividad`) valida el Bearer token,
 * registra la actividad en `logs_auditoria` (trazabilidad Ley 25.326),
 * deduplica por ventana temporal e intenta el envío del correo de aviso.
 */

export type TipoActividadSesion = "inicio_sesion" | "registro";

/**
 * Informa una actividad de sesión al servidor. Fire-and-forget: los errores
 * de red o de servidor se silencian para no interrumpir el flujo de auth.
 */
export async function notificarActividadSesion(
  accessToken: string | null | undefined,
  tipo: TipoActividadSesion,
): Promise<void> {
  if (!accessToken) {
    return;
  }
  try {
    await fetch("/api/auth/notificar-actividad", {
      body: JSON.stringify({ tipo }),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
  } catch {
    // La notificación es best-effort: nunca debe romper el login/registro.
  }
}
