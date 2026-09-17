/**
 * Persistencia de sesión de alcance "pestaña".
 *
 * Contexto: el cliente de navegador (`@supabase/ssr`) persiste la sesión en
 * cookies para mantenerla sincronizada con el middleware y los Server
 * Components, e ignora cualquier `auth.storage` personalizado. Por eso no se
 * puede "cambiar localStorage por sessionStorage" a nivel de cliente Supabase
 * sin romper el SSR.
 *
 * Para cumplir la política de seguridad (cerrar la pestaña o el navegador
 * destruye la sesión), cada pestaña escribe un marcador en `sessionStorage`
 * —que el navegador elimina automáticamente al cerrarse—. Si al iniciar la app
 * existe una sesión persistida en cookies pero NO hay marcador, significa que
 * es una pestaña nueva tras un cierre (o una pestaña duplicada): la sesión
 * heredada se destruye de inmediato con `signOut()` y el usuario debe
 * autenticarse de nuevo.
 *
 * Recargas y navegaciones dentro de la misma pestaña conservan el marcador,
 * por lo que no provocan cierres de sesión. El retorno de OAuth (Google) ocurre
 * en la misma pestaña, de modo que tampoco se ve afectado.
 */

/** Marcador de "pestaña con sesión viva" en `sessionStorage`. */
export const MARCADOR_PESTANA_KEY = "ayudapi:sesion-pestana";

function almacenamientoDisponible(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

/** `true` si esta pestaña ya marcó su sesión como viva anteriormente. */
export function pestanaYaMarcada(): boolean {
  if (!almacenamientoDisponible()) {
    return false;
  }
  try {
    return window.sessionStorage.getItem(MARCADOR_PESTANA_KEY) === "1";
  } catch {
    return false;
  }
}

/** Marca esta pestaña como viva. No lanza excepciones. */
export function marcarPestanaActiva(): void {
  if (!almacenamientoDisponible()) {
    return;
  }
  try {
    window.sessionStorage.setItem(MARCADOR_PESTANA_KEY, "1");
  } catch {
    // Sin almacenamiento de pestaña no se puede marcar; el flujo continúa.
  }
}

/** Elimina el marcador de la pestaña actual. No lanza excepciones. */
export function limpiarMarcadorPestana(): void {
  if (!almacenamientoDisponible()) {
    return;
  }
  try {
    window.sessionStorage.removeItem(MARCADOR_PESTANA_KEY);
  } catch {
    // Nada que limpiar.
  }
}
