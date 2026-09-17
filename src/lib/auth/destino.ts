/**
 * Claves para la persistencia de intención entre la app y el retorno de un
 * flujo OAuth. `sessionStorage` sobrevive a la redirección externa del
 * navegador hacia el proveedor (misma pestaña y mismo origen); la cookie de
 * sesión actúa como respaldo si la pestaña se cierra durante el flujo.
 */

/** Ruta a la que volver después de la autenticación (p. ej. panel del paciente escaneado). */
export const RUTA_DESTINO_KEY = "ayudapi:destino-posterior";

/** Opción elegida en el panel de acceso: iniciar sesión o crear cuenta. */
export type ModoGoogle = "login" | "registro";

/** Modo del flujo Google OAuth en curso ("login" o "registro"). */
export const MODO_GOOGLE_KEY = "ayudapi:modo-google";

const CLAVE_COOKIE_MODO = "ayudapi:modo-google";

/**
 * Ventana de validez de la bandera de modo (segundos). Cubre el viaje de ida
 * y vuelta al proveedor OAuth. La cookie persistente (con `max-age`) es el
 * respaldo si `sessionStorage` se pierde (p. ej. restauración de pestaña);
 * `sessionStorage` sigue siendo la fuente primaria.
 */
const MAX_AGE_MODO_SEGUNDOS = 600;

function leerCookieModo(): string | null {
  try {
    const patron = new RegExp(`(?:^|; )${CLAVE_COOKIE_MODO}=([^;]+)`);
    const match = document.cookie.match(patron);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

/**
 * Guarda la opción elegida ("Iniciar sesión con Google" o "Crear cuenta con
 * Google") para que el callback la conozca al volver del proveedor. Se
 * persiste de forma redundante en `sessionStorage` (fuente primaria) y en
 * cookie persistente de corta vida (respaldo ante pérdida del storage).
 */
export function guardarModoGoogle(modo: ModoGoogle): void {
  if (typeof document === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(MODO_GOOGLE_KEY, modo);
    document.cookie = `${CLAVE_COOKIE_MODO}=${encodeURIComponent(modo)}; path=/; max-age=${MAX_AGE_MODO_SEGUNDOS}; SameSite=Lax`;
  } catch {
    // El flujo continúa igual; el modo por defecto es "login".
  }
}

/** Lee el modo del flujo en curso ("registro" solo si se eligió crear cuenta). */
export function leerModoGoogle(): ModoGoogle {
  if (typeof document === "undefined") {
    return "login";
  }
  try {
    const desdeStorage = window.sessionStorage.getItem(MODO_GOOGLE_KEY);
    if (desdeStorage === "registro" || desdeStorage === "login") {
      return desdeStorage;
    }
  } catch {
    // Se intenta el respaldo en cookie.
  }
  return leerCookieModo() === "registro" ? "registro" : "login";
}

export function limpiarModoGoogle(): void {
  if (typeof document === "undefined") {
    return;
  }
  try {
    window.sessionStorage.removeItem(MODO_GOOGLE_KEY);
  } catch {
    // Nada que limpiar.
  }
  document.cookie = `${CLAVE_COOKIE_MODO}=; path=/; max-age=0; SameSite=Lax`;
}
