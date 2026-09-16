import type { RolUsuario } from "@/lib/supabase/database";

/**
 * Destino interno válido para redirecciones post-autenticación. Se rechazan
 * URLs externas, protocol-relative y la propia página actual (evita bucles).
 */
export function esDestinoInternoValido(
  destino: string | null | undefined,
  actual?: string,
): destino is string {
  return (
    typeof destino === "string" &&
    destino.startsWith("/") &&
    !destino.startsWith("//") &&
    destino !== actual
  );
}

/** Rutas del panel médico (requieren rol médico para operar). */
export function esRutaMedica(destino: string | null | undefined): boolean {
  return (
    typeof destino === "string" &&
    (destino === "/medico" || destino.startsWith("/medico/"))
  );
}

/**
 * Ruta por defecto según el rol principal. El `destino` pendiente (p. ej. un
 * panel de paciente escaneado) tiene prioridad cuando es una ruta interna.
 */
export function rutaPorRol(
  rol: RolUsuario | null,
  perfilPacienteOk: boolean,
  destino: string | null | undefined,
  actual?: string,
): string {
  if (esDestinoInternoValido(destino, actual)) {
    return destino;
  }
  if (rol === "institucion") {
    return "/institucional";
  }
  if (rol === "medico") {
    return "/medico/escanear";
  }
  if (rol === "paciente") {
    return perfilPacienteOk ? "/mi-perfil" : "/crear-perfil";
  }
  return "/mi-perfil";
}
