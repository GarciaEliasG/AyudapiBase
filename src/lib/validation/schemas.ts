import { z } from "zod";

import {
  DNI_REGEX_ESTRICTO,
  esJurisdiccionSisaValida,
  esTelefonoValido,
  JURISDICCIONES_SISA,
  MATRICULA_PRUEBA_REGEX,
  MATRICULA_REAL_REGEX,
} from "@/lib/validation/profile";

/**
 * Esquemas Zod — alta y validación de usuarios (estándar SISA/REFEPS).
 *
 * Reglas de oro:
 * - DNI obligatorio para pacientes Y médicos: exactamente 7 u 8 dígitos
 *   numéricos, sin puntos ni letras. Cada DNI es único (una cuenta por DNI);
 *   el duplicado responde HTTP 409.
 * - Médico: DNI + jurisdicción oficial + matrícula + teléfono + especialidad,
 *   todos obligatorios. Formato incorrecto o faltante → HTTP 400 con el campo
 *   detallado. La verificación contra el padrón SISA vive en
 *   `@/lib/auth/sisa` y bloquea con 403 si no hay coincidencia.
 * - Matrículas `TEST-...` solo pasan el formato; el permiso lo decide
 *   `DEV_ADMIN_EMAILS` (403 para usuarios comunes).
 */

export const MENSAJE_DNI =
  "El DNI es obligatorio y debe tener exactamente 7 u 8 dígitos numéricos, sin puntos ni letras.";
export const MENSAJE_JURISDICCION = `La jurisdicción es obligatoria y debe ser una emisora oficial SISA/REFEPS (${JURISDICCIONES_SISA.join(", ")}).`;
export const MENSAJE_MATRICULA =
  "La matrícula profesional es obligatoria: 4 a 8 dígitos (con o sin prefijo MN/MP/ME) o matrícula de prueba TEST-... para desarrollo autorizado.";
export const MENSAJE_TELEFONO =
  "El teléfono de contacto es obligatorio y debe contener entre 8 y 15 dígitos.";
export const MENSAJE_ESPECIALIDAD =
  "La especialidad es obligatoria (mínimo 3 caracteres).";
export const MENSAJE_SISA =
  "Médico no registrado o datos de matrícula inválidos en el sistema. Verificá DNI, jurisdicción y matrícula o contactá al colegio profesional correspondiente.";
export const MENSAJE_DNI_DUPLICADO =
  "Ese DNI ya está registrado en otra cuenta. Cada DNI puede tener una sola cuenta: verificá el número ingresado o iniciá sesión.";
export const MENSAJE_BYPASS_DENEGADO =
  "Las matrículas de prueba (TEST-...) solo están habilitadas para cuentas de desarrollo autorizadas (DEV_ADMIN_EMAILS). Si sos profesional, ingresá tu DNI y matrícula real validada.";

/** DNI estricto: string crudo del formulario, sin normalizar antes. */
export const dniSchema = z
  .string({ error: MENSAJE_DNI })
  .trim()
  .regex(DNI_REGEX_ESTRICTO, MENSAJE_DNI);

export const jurisdiccionSchema = z
  .string({ error: MENSAJE_JURISDICCION })
  .trim()
  .min(1, MENSAJE_JURISDICCION)
  .refine((valor) => esJurisdiccionSisaValida(valor), MENSAJE_JURISDICCION);

export const matriculaSchema = z
  .string({ error: MENSAJE_MATRICULA })
  .trim()
  .min(1, MENSAJE_MATRICULA)
  .refine((valor) => {
    const upper = valor.trim().toUpperCase();
    return MATRICULA_REAL_REGEX.test(upper) || MATRICULA_PRUEBA_REGEX.test(upper);
  }, MENSAJE_MATRICULA);

export const telefonoSchema = z
  .string({ error: MENSAJE_TELEFONO })
  .trim()
  .min(1, MENSAJE_TELEFONO)
  .refine((valor) => esTelefonoValido(valor), MENSAJE_TELEFONO);

export const especialidadSchema = z
  .string({ error: MENSAJE_ESPECIALIDAD })
  .trim()
  .min(3, MENSAJE_ESPECIALIDAD);

/**
 * Alta médica estricta: DNI + jurisdicción + matrícula + teléfono +
 * especialidad, todos obligatorios. También cubre la transición
 * paciente→médico (mismo rigor) y el completar-perfil.
 */
export const medicoAltaSchema = z.strictObject({
  dni: dniSchema,
  especialidad: especialidadSchema,
  jurisdiccion: jurisdiccionSchema,
  matricula: matriculaSchema,
  telefono_contacto: telefonoSchema,
});

export type MedicoAltaInput = z.infer<typeof medicoAltaSchema>;

/** Alta de paciente: DNI obligatorio + datos base del perfil. */
export const pacienteAltaSchema = z.strictObject({
  alias: z.string().trim().min(2, "El alias es obligatorio y debe tener al menos 2 caracteres.").optional(),
  dni: dniSchema,
  nombre_completo: z.string().trim().min(1, "El nombre completo es inválido.").optional(),
});

export type PacienteAltaInput = z.infer<typeof pacienteAltaSchema>;

/** Actualización del perfil de paciente: el DNI sigue siendo obligatorio. */
export const pacientePerfilUpdateSchema = z.strictObject({
  alias: z.string().trim().min(2, "El alias es obligatorio y debe tener al menos 2 caracteres."),
  dni: dniSchema,
  fecha_nacimiento: z
    .string()
    .trim()
    .min(1, "La fecha de nacimiento es obligatoria."),
  genero: z.string().trim().min(1, "El género es obligatorio."),
  grupo_sanguineo: z.string().trim().min(1, "El grupo sanguíneo es obligatorio."),
});

export interface CampoConError {
  campo: string;
  mensaje: string;
}

/**
 * Convierte un `ZodError` en detalle por campo para respuestas HTTP 400:
 * cada entrada indica exactamente qué campo falló y por qué.
 */
export function erroresZodPorCampo(error: z.ZodError): CampoConError[] {
  return error.issues.map((issue) => ({
    campo: issue.path.map(String).join(".") || "body",
    mensaje: issue.message,
  }));
}

/** Mensaje 400 agregado + detalle por campo para `jsonError`. */
export function detalle400DesdeZod(error: z.ZodError): {
  detalles: CampoConError[];
  mensaje: string;
} {
  const campos = erroresZodPorCampo(error);
  const resumen = campos.map((c) => `${c.campo}: ${c.mensaje}`).join(" ");
  return {
    detalles: campos,
    mensaje: `Datos inválidos. ${resumen}`,
  };
}
