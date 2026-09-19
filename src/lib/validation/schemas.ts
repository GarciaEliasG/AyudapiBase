import { z } from "zod";

import {
  DNI_REGEX_ESTRICTO,
  esCuitEstrictoValido,
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
 * - Médico sin matrícula (ausente o en trámite): vía de invitación opcional
 *   `MEDICO_INVITE_CODE` (`medicoAltaInvitacionSchema` + gate 403
 *   fail-closed). Sin secreto configurado rige la vía estricta (400).
 * - Institución: se identifica por CUIT, nunca por DNI. El `dni` se ignora
 *   por completo en su alta/vinculación (frontend y backend).
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
export const MENSAJE_INSTITUCION_NOMBRE =
  "El nombre de la institución es obligatorio (mínimo 3 caracteres, máximo 120).";
export const MENSAJE_INSTITUCION_CUIT =
  "El CUIT es obligatorio: 11 dígitos con dígito verificador AFIP válido (ej: 30-12345678-9).";
export const MENSAJE_INSTITUCION_DOCUMENTACION =
  "La documentación de respaldo es obligatoria: al menos una referencia (habilitación, inscripción RENIS, etc.).";
export const MENSAJE_INSTITUCION_INVITACION =
  "El código de invitación institucional es obligatorio y no es válido. Solicitá el alta a un administrador.";
export const MENSAJE_CUIT_DUPLICADO =
  "Ese CUIT ya está registrado en otra institución. Verificá el número ingresado o iniciá sesión.";
export const MENSAJE_MEDICO_INVITACION =
  "El código de invitación de médico es obligatorio cuando la matrícula está ausente o en trámite. Solicitalo a tu institución o a un administrador.";

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
 * `codigo_invitacion` se acepta (opcional) y se ignora en la vía normal: solo
 * la usa la vía de invitación (`medicoAltaInvitacionSchema`) cuando la
 * matrícula está ausente o en trámite.
 */
export const medicoAltaSchema = z.strictObject({
  codigo_invitacion: z.string().trim().optional(),
  dni: dniSchema,
  especialidad: especialidadSchema,
  jurisdiccion: jurisdiccionSchema,
  matricula: matriculaSchema,
  telefono_contacto: telefonoSchema,
});

export type MedicoAltaInput = z.infer<typeof medicoAltaSchema>;

/**
 * Alta médica por invitación (`MEDICO_INVITE_CODE`): mismo rigor que
 * `medicoAltaSchema` EXCEPTO la matrícula, que puede estar ausente o en
 * trámite. El endpoint que la acepta debe verificar el código con
 * `verificarCodigoInvitacionMedico` (403 fail-closed), omitir el padrón SISA
 * (sin matrícula no hay qué contrastar) y persistir matrícula provisoria
 * `PENDIENTE-...` con `estado_verificacion = "pendiente"`.
 */
export const medicoAltaInvitacionSchema = z.strictObject({
  codigo_invitacion: z.string({ error: MENSAJE_MEDICO_INVITACION }).trim().min(1, MENSAJE_MEDICO_INVITACION),
  dni: dniSchema,
  especialidad: especialidadSchema,
  jurisdiccion: jurisdiccionSchema,
  matricula: matriculaSchema.optional(),
  telefono_contacto: telefonoSchema,
});

export type MedicoAltaInvitacionInput = z.infer<typeof medicoAltaInvitacionSchema>;

/** Alta de paciente: DNI obligatorio + datos base del perfil. */
export const pacienteAltaSchema = z.strictObject({
  alias: z.string().trim().min(2, "El alias es obligatorio y debe tener al menos 2 caracteres.").optional(),
  dni: dniSchema,
  nombre_completo: z.string().trim().min(1, "El nombre completo es inválido.").optional(),
});

export type PacienteAltaInput = z.infer<typeof pacienteAltaSchema>;

/**
 * Referencia documental individual (una línea de habilitación, inscripción
 * RENIS, constancia, etc.). El frontend puede enviar texto multilínea; el
 * helper `normalizarDocumentacionInstitucion` lo convierte a este formato
 * antes del `safeParse` (mismo patrón que médico normaliza jurisdicción).
 */
export const institucionDocumentacionSchema = z.strictObject({
  referencia: z.string().trim().min(3, MENSAJE_INSTITUCION_DOCUMENTACION).max(280, MENSAJE_INSTITUCION_DOCUMENTACION),
});

export const cuitSchema = z
  .string({ error: MENSAJE_INSTITUCION_CUIT })
  .trim()
  .min(1, MENSAJE_INSTITUCION_CUIT)
  .refine((valor) => esCuitEstrictoValido(valor), MENSAJE_INSTITUCION_CUIT)
  .transform((valor) => valor.replace(/\D/g, ""));

/**
 * Alta institucional estricta: mismo patrón que `medicoAltaSchema`
 * (Zod estricto + 400 por campo + normalización en el endpoint).
 * Mapea 1:1 a `perfiles_institucion` (nombre, cuit, direccion, telefono,
 * email_contacto, documentacion) sin requerir migración.
 * `codigo_invitacion` es el gate de seguridad: se valida contra el secreto
 * server-only `INSTITUCION_INVITE_CODE` (ver `@/lib/auth/institucion`).
 */
export const institucionAltaSchema = z.strictObject({
  codigo_invitacion: z.string({ error: MENSAJE_INSTITUCION_INVITACION }).trim().min(1, MENSAJE_INSTITUCION_INVITACION),
  cuit: cuitSchema,
  direccion: z.string().trim().max(200, "La dirección no puede superar 200 caracteres.").optional(),
  documentacion: z.array(institucionDocumentacionSchema).min(1, MENSAJE_INSTITUCION_DOCUMENTACION),
  email_contacto: z.string().trim().email("El email de contacto no es válido.").optional(),
  nombre: z
    .string({ error: MENSAJE_INSTITUCION_NOMBRE })
    .trim()
    .min(3, MENSAJE_INSTITUCION_NOMBRE)
    .max(120, MENSAJE_INSTITUCION_NOMBRE),
  telefono: telefonoSchema.optional(),
});

export type InstitucionAltaInput = z.infer<typeof institucionAltaSchema>;

/**
 * Normaliza el payload crudo del formulario a la forma del esquema:
 * - `documentacion`: acepta string multilínea ("una referencia por línea"),
 *   array de strings o array de `{ referencia }` → array de objetos.
 * - `telefono_contacto` (legacy del form) como alias de `telefono`.
 * - `nombreInstitucion` (legacy del form elegir-rol) como alias de `nombre`.
 * - Whitelist explícita: `dni` y cualquier otra clave ajena se IGNORAN (las
 *   instituciones se identifican por CUIT; un `dni` espurio no debe tumbar el
 *   alta estricta con un 400 por clave no reconocida).
 */
export function normalizarInstitucionCruda(
  crudo: Record<string, unknown>,
): Record<string, unknown> {
  const lineas: string[] = [];
  const doc = crudo.documentacion;
  if (typeof doc === "string") {
    lineas.push(...doc.split(/\r?\n/));
  } else if (Array.isArray(doc)) {
    for (const item of doc) {
      if (typeof item === "string") {
        lineas.push(item);
      } else if (item !== null && typeof item === "object") {
        const ref = (item as { referencia?: unknown }).referencia;
        if (typeof ref === "string") {
          lineas.push(ref);
        }
      }
    }
  }
  const documentacion = lineas
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((referencia) => ({ referencia }));

  const telefonoCrudo =
    crudo.telefono ?? crudo.telefono_contacto ?? undefined;
  const nombreCrudo = crudo.nombre ?? crudo.nombreInstitucion ?? undefined;

  return {
    codigo_invitacion: crudo.codigo_invitacion,
    cuit: crudo.cuit,
    direccion: crudo.direccion,
    documentacion,
    email_contacto: crudo.email_contacto,
    nombre: nombreCrudo,
    telefono: telefonoCrudo,
  };
}

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
