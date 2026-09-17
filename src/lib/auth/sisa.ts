import type { SupabaseClient } from "@supabase/supabase-js";

import {
  esMatriculaDePrueba,
  normalizarDni,
  normalizarJurisdiccionSisa,
  normalizarMatricula,
} from "@/lib/validation/profile";
import { MENSAJE_SISA } from "@/lib/validation/schemas";

/**
 * Verificación formal de profesionales contra el padrón SISA/REFEPS.
 *
 * Fuentes del padrón (en orden):
 * 1. Tabla `public.padron_profesionales` (entorno real / producción).
 * 2. Variable `SISA_PADRON_JSON`: array JSON `[{dni, matricula, jurisdiccion}]`
 *    para seed local o CI sin base dedicada.
 *
 * Regla de oro: falla cerrado. Si el trío (DNI, matrícula, jurisdicción) no
 * coincide exactamente con el padrón, el alta se bloquea con el mensaje
 * oficial "Médico no registrado o datos de matrícula inválidos en el
 * sistema". Las matrículas `TEST-...` nunca se consultan al padrón: las
 * autoriza (o deniega con 403) el bypass de `DEV_ADMIN_EMAILS`.
 */

export interface CredencialProfesional {
  dni: string;
  jurisdiccion: string;
  matricula: string;
}

interface FilaPadron {
  dni: string;
  jurisdiccion: string;
  matricula: string;
}

function esErrorRelacionInexistente(code: string | undefined, message: string): boolean {
  if (code === "PGRST204" || code === "42703" || code === "42P01") {
    return true;
  }
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("could not find") ||
    m.includes("does not exist") ||
    m.includes("no existe") ||
    m.includes("schema cache")
  );
}

function normalizarCredencial(raw: {
  dni: unknown;
  jurisdiccion: unknown;
  matricula: unknown;
}): CredencialProfesional | null {
  const dni = normalizarDni(raw.dni);
  const jurisdiccion = normalizarJurisdiccionSisa(raw.jurisdiccion);
  const matricula = normalizarMatricula(raw.matricula);
  if (!dni || !jurisdiccion || !matricula) {
    return null;
  }
  return { dni, jurisdiccion, matricula };
}

/** Padrón embebido vía `SISA_PADRON_JSON` (seed local/CI). */
export function getPadronDesdeEnv(): FilaPadron[] {
  const raw = process.env.SISA_PADRON_JSON ?? "";
  if (!raw.trim()) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const filas: FilaPadron[] = [];
    for (const item of parsed) {
      if (item === null || typeof item !== "object") {
        continue;
      }
      const cred = normalizarCredencial(
        item as { dni: unknown; jurisdiccion: unknown; matricula: unknown },
      );
      if (cred) {
        filas.push(cred);
      }
    }
    return filas;
  } catch {
    return [];
  }
}

function coincideEnMemoria(padron: FilaPadron[], cred: CredencialProfesional): boolean {
  return padron.some(
    (fila) =>
      fila.dni === cred.dni &&
      fila.matricula === cred.matricula &&
      fila.jurisdiccion === cred.jurisdiccion,
  );
}

async function coincideEnTabla(
  admin: SupabaseClient,
  cred: CredencialProfesional,
): Promise<{ chequeado: boolean; coincide: boolean }> {
  const { data, error } = await admin
    .from("padron_profesionales")
    .select("id")
    .eq("dni", cred.dni)
    .eq("matricula", cred.matricula)
    .eq("jurisdiccion", cred.jurisdiccion)
    .maybeSingle();
  if (error) {
    if (esErrorRelacionInexistente(error.code, error.message)) {
      return { chequeado: false, coincide: false };
    }
    throw error;
  }
  return { chequeado: true, coincide: Boolean(data) };
}

export type ResultadoSisa =
  | { mensaje: string; ok: false }
  | { ok: true };

/**
 * Verifica la credencial contra el padrón. Falla cerrado: sin coincidencia
 * exacta devuelve `ok: false` con el mensaje oficial de bloqueo. Las
 * matrículas de prueba nunca llegan al padrón (las gobierna el bypass).
 */
export async function verificarProfesionalSisa(
  admin: SupabaseClient,
  raw: { dni: unknown; jurisdiccion: unknown; matricula: unknown },
): Promise<ResultadoSisa> {
  const cred = normalizarCredencial(raw);
  if (!cred) {
    return { mensaje: MENSAJE_SISA, ok: false };
  }
  if (esMatriculaDePrueba(cred.matricula)) {
    return { mensaje: MENSAJE_SISA, ok: false };
  }

  let tablaChequeada = false;
  try {
    const enTabla = await coincideEnTabla(admin, cred);
    tablaChequeada = enTabla.chequeado;
    if (enTabla.chequeado && enTabla.coincide) {
      return { ok: true };
    }
    if (enTabla.chequeado && !enTabla.coincide) {
      // La tabla es la fuente oficial: si existe y no coincide, se bloquea
      // sin mirar el seed de entorno.
      return { mensaje: MENSAJE_SISA, ok: false };
    }
  } catch (error) {
    console.error("[sisa] No se pudo consultar el padrón:", error);
    return {
      mensaje: "No se pudo verificar la matrícula con el padrón. Reintentá.",
      ok: false,
    };
  }

  // Sin tabla (migración pendiente): el seed `SISA_PADRON_JSON` es la fuente.
  const padronEnv = getPadronDesdeEnv();
  if (padronEnv.length > 0) {
    return coincideEnMemoria(padronEnv, cred)
      ? { ok: true }
      : { mensaje: MENSAJE_SISA, ok: false };
  }

  // Sin ninguna fuente de padrón configurada: bloqueo terminante. En local
  // esto obliga a usar el bypass autorizado (`DEV_ADMIN_EMAILS` + `TEST-...`)
  // o a sembrar el padrón; en producción impide altas con datos no
  // contrastados. Nunca se deja pasar una credencial sin verificar.
  if (!tablaChequeada) {
    console.warn(
      "[sisa] Sin padrón configurado (ni tabla ni SISA_PADRON_JSON): bloqueo fail-closed.",
    );
  }
  return { mensaje: MENSAJE_SISA, ok: false };
}
