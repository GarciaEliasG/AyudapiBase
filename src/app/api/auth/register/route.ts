import type { SupabaseClient } from "@supabase/supabase-js";

import type { RolUsuario } from "@/lib/supabase/database";

import { parseJsonBody } from "@/lib/api/http";
import { ipDeRequest, registrarActividadSesion } from "@/lib/auth/actividad-servidor";
import {
  CODIGO_BYPASS_REQUERIDO,
  isDevBypassActiveFor,
  motivoBloqueoMatriculaDePrueba,
  verificacionPara,
} from "@/lib/auth/dev-bypass";
import {
  CODIGO_INSTITUCION_INVALIDO,
  verificarCodigoInvitacionInstitucion,
  verificarCuitInstitucion,
} from "@/lib/auth/institucion";
import {
  CODIGO_MEDICO_INVALIDO,
  invitacionMedicaHabilitada,
  verificarCodigoInvitacionMedico,
  type ModoInvitacion,
} from "@/lib/auth/invitacion";
import { confirmarYProvisionar } from "@/lib/auth/registro";
import { jsonError, jsonOk } from "@/lib/auth/session";
import { verificarProfesionalSisa } from "@/lib/auth/sisa";
import {
  verificarDniGlobal,
  verificarUnicidadMedico,
} from "@/lib/auth/verificacion-medico";
import { createAdminServerClient, createAnonServerClient } from "@/lib/supabase/server";
import { esEmailValido, esMatriculaProvisoria, esTelefonoValido, normalizarJurisdiccionSisa, normalizarMatricula } from "@/lib/validation/profile";
import {
  detalle400DesdeZod,
  dniSchema,
  institucionAltaSchema,
  medicoAltaInvitacionSchema,
  medicoAltaSchema,
  MENSAJE_CUIT_DUPLICADO,
  MENSAJE_DNI_DUPLICADO,
  normalizarInstitucionCruda,
} from "@/lib/validation/schemas";

export const runtime = "nodejs";

const MIN_PASSWORD_LENGTH = 8;
const ROLES_REGISTRABLES: RolUsuario[] = ["paciente", "medico", "institucion"];
/** Usuario inexistente: ningún `usuario_id` real coincide, el DNI debe estar libre. */
const SIN_USUARIO = "00000000-0000-0000-0000-000000000000";

interface RegisterRequest {
  alias?: string;
  codigo_invitacion?: string;
  cuit?: string;
  direccion?: string;
  dni?: string;
  documentacion?: unknown;
  email: string;
  email_contacto?: string;
  especialidad?: string;
  jurisdiccion?: string;
  matricula?: string;
  nombre?: string;
  nombre_completo?: string;
  password: string;
  rol?: RolUsuario;
  telefono?: string;
  telefono_contacto?: string;
}

async function dniOcupado(admin: SupabaseClient, dni: string): Promise<boolean> {
  const { conflicto } = await verificarDniGlobal(admin, { dni, usuarioId: SIN_USUARIO });
  return conflicto !== null;
}

/**
 * Alta de cuenta por email y contraseña con estándar SISA/REFEPS.
 *
 * - Paciente: DNI obligatorio (Zod estricto 7-8 dígitos) y único en todo el
 *   sistema (409 si ya existe). Formato inválido → 400 con el campo detallado.
 * - Médico: DNI + jurisdicción oficial + matrícula + teléfono + especialidad,
 *   todos obligatorios (400 por campo). La credencial se contrasta contra el
 *   padrón SISA: sin coincidencia se bloquea con 403 ("Médico no registrado…").
 *   Las matrículas `TEST-...` solo pasan con email en `DEV_ADMIN_EMAILS`
 *   (403 para usuarios comunes). Matrícula o DNI ya registrados → 409.
 * - Médico por invitación (opcional, `MEDICO_INVITE_CODE` configurado):
 *   matrícula ausente o en trámite + código válido → alta con matrícula
 *   provisoria `PENDIENTE-...` y `estado_verificacion = "pendiente"` (sin
 *   contraste SISA). Código ausente/inválido → 403 fail-closed. Sin secreto
 *   configurado rige la vía estricta (matrícula obligatoria, 400).
 * - Institución: nombre + CUIT (11 dígitos con checksum AFIP) +
 *   documentación (≥1 referencia) + `codigo_invitacion` obligatorio contra
 *   `INSTITUCION_INVITE_CODE` (403 si falta o no coincide). CUIT duplicado →
 *   409. Mismo patrón Zod estricto que médico/paciente.
 * - El usuario queda habilitado de inmediato y la respuesta incluye la sesión.
 */
export async function POST(req: Request) {
  const parsed = await parseJsonBody<RegisterRequest>(req);
  if (!parsed.ok) {
    return parsed.response;
  }
  const input = parsed.data;

  const email = input.email?.trim() ?? "";
  if (!esEmailValido(email)) {
    return jsonError("Ingresá un email válido.", 400);
  }
  if (!input.password || input.password.length < MIN_PASSWORD_LENGTH) {
    return jsonError(
      `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
      400,
    );
  }

  const rol = input.rol ?? "paciente";
  if (!ROLES_REGISTRABLES.includes(rol)) {
    return jsonError("No podés registrarte con el rol seleccionado.", 400);
  }

  const admin = createAdminServerClient();

  // ── Validación estricta por rol (Zod) ──────────────────────────────────
  let dniNormalizado: string | undefined;
  let jurisdiccionNormalizada: string | undefined;
  let matriculaNormalizada: string | undefined;
  let telefonoNormalizado: string | undefined;
  let especialidadNormalizada: string | undefined;
  let verificacionMedica = "pendiente";
  /** Modo de la vía de invitación médica, si se usó. */
  let inviteMedicoModo: ModoInvitacion | null = null;

  if (rol === "medico") {
    const matriculaCruda = input.matricula?.trim() ?? "";
    // Bypass: las matrículas de prueba exigen email autorizado. Se rechaza
    // ANTES de crear la cuenta para no dejar usuarios huérfanos sin perfil.
    const bloqueo = motivoBloqueoMatriculaDePrueba(email, matriculaCruda);
    if (bloqueo) {
      return jsonError(bloqueo, 403);
    }
    const esBypass = isDevBypassActiveFor(email);
    // Vía de invitación: matrícula ausente o en trámite + mecanismo habilitado
    // (`MEDICO_INVITE_CODE`). Sin secreto configurado rige la vía estricta
    // clásica (matrícula obligatoria, 400). Con secreto, el código se exige
    // (403 fail-closed) y suple al padrón SISA: sin matrícula no hay qué
    // contrastar; el perfil nace `pendiente` con matrícula provisoria
    // `PENDIENTE-...` generada al provisionar.
    const porInvitacion = !esBypass && esMatriculaProvisoria(matriculaCruda) && invitacionMedicaHabilitada();
    if (porInvitacion) {
      const validacion = medicoAltaInvitacionSchema.safeParse({
        codigo_invitacion: input.codigo_invitacion,
        dni: input.dni,
        especialidad: input.especialidad,
        jurisdiccion: input.jurisdiccion,
        matricula: matriculaCruda.length > 0 ? matriculaCruda : undefined,
        telefono_contacto: input.telefono_contacto,
      });
      if (!validacion.success) {
        const { detalles, mensaje } = detalle400DesdeZod(validacion.error);
        return jsonError(mensaje, 400, detalles);
      }
      const invitacion = verificarCodigoInvitacionMedico(validacion.data.codigo_invitacion);
      if (!invitacion.ok) {
        return jsonError(
          invitacion.mensaje,
          invitacion.status,
          invitacion.code === CODIGO_MEDICO_INVALIDO
            ? [{ campo: "codigo_invitacion", mensaje: invitacion.mensaje }]
            : { code: invitacion.code },
        );
      }
      dniNormalizado = validacion.data.dni.trim();
      jurisdiccionNormalizada =
        normalizarJurisdiccionSisa(validacion.data.jurisdiccion) ?? validacion.data.jurisdiccion.trim().toUpperCase();
      // Sin matrícula real no hay unicidad de matrícula ni SISA que verificar:
      // solo la unicidad global del DNI (409). La provisoria `PENDIENTE-...`
      // la genera `confirmarYProvisionar` (única por usuario).
      const dniRes = await verificarDniGlobal(admin, { dni: dniNormalizado, usuarioId: SIN_USUARIO });
      if (dniRes.conflicto) {
        return jsonError(MENSAJE_DNI_DUPLICADO, 409);
      }
      matriculaNormalizada = undefined;
      telefonoNormalizado = validacion.data.telefono_contacto.trim();
      especialidadNormalizada = validacion.data.especialidad.trim();
      verificacionMedica = "pendiente";
      inviteMedicoModo = invitacion.modo;
    } else {
      const validacion = medicoAltaSchema.safeParse({
        dni: input.dni,
        especialidad: input.especialidad,
        jurisdiccion: input.jurisdiccion,
        matricula: input.matricula,
        telefono_contacto: input.telefono_contacto,
      });
      if (!validacion.success) {
        const { detalles, mensaje } = detalle400DesdeZod(validacion.error);
        return jsonError(mensaje, 400, detalles);
      }
      dniNormalizado = validacion.data.dni.trim();
      jurisdiccionNormalizada =
        normalizarJurisdiccionSisa(validacion.data.jurisdiccion) ?? validacion.data.jurisdiccion.trim().toUpperCase();
      matriculaNormalizada = normalizarMatricula(validacion.data.matricula);
      telefonoNormalizado = validacion.data.telefono_contacto.trim();
      especialidadNormalizada = validacion.data.especialidad.trim();

      // Unicidad (409) y padrón SISA (403): consultas independientes en paralelo.
      const [dniRes, matriculaRes, sisaRes] = await Promise.all([
        verificarDniGlobal(admin, { dni: dniNormalizado, usuarioId: SIN_USUARIO }),
        verificarUnicidadMedico(admin, {
          dni: dniNormalizado,
          jurisdiccion: jurisdiccionNormalizada,
          matricula: matriculaNormalizada,
          usuarioId: SIN_USUARIO,
        }),
        esBypass
          ? Promise.resolve({ ok: true as const })
          : verificarProfesionalSisa(admin, {
              dni: dniNormalizado,
              jurisdiccion: jurisdiccionNormalizada,
              matricula: matriculaNormalizada,
            }),
      ]);
      if (dniRes.conflicto) {
        return jsonError(MENSAJE_DNI_DUPLICADO, 409);
      }
      if (matriculaRes.conflicto) {
        return jsonError(matriculaRes.conflicto, 409);
      }
      if (!sisaRes.ok) {
        return jsonError(sisaRes.mensaje, 403);
      }
      verificacionMedica = verificacionPara(email);
    }
  }

  if (rol === "paciente") {
    const validacion = dniSchema.safeParse(input.dni);
    if (!validacion.success) {
      const { detalles, mensaje } = detalle400DesdeZod(validacion.error);
      return jsonError(mensaje, 400, detalles);
    }
    dniNormalizado = validacion.data.trim();
    if (await dniOcupado(admin, dniNormalizado)) {
      return jsonError(MENSAJE_DNI_DUPLICADO, 409);
    }
    if (input.telefono_contacto !== undefined && input.telefono_contacto !== null) {
      const tel = String(input.telefono_contacto).trim();
      if (tel.length > 0) {
        if (!esTelefonoValido(tel)) {
          return jsonError(
            "Datos inválidos. telefono_contacto: El teléfono de contacto es obligatorio y debe contener entre 8 y 15 dígitos.",
            400,
            [{ campo: "telefono_contacto", mensaje: "El teléfono debe contener entre 8 y 15 dígitos." }],
          );
        }
        telefonoNormalizado = tel;
      }
    }
  }

  // ── Institución: mismo patrón Zod estricto que médico/paciente ──────────
  // Gate de seguridad ANTES de crear la cuenta (no dejar usuarios huérfanos):
  // 1) esquema (400 por campo), 2) invitación (403), 3) CUIT único (409).
  let institucionNormalizada: {
    cuit: string;
    direccion?: string;
    documentacion: Array<{ referencia: string }>;
    email_contacto?: string;
    inviteModo: "codigo" | "dev-sin-codigo";
    nombre: string;
    telefono?: string;
  } | null = null;

  if (rol === "institucion") {
    const validacion = institucionAltaSchema.safeParse(
      normalizarInstitucionCruda({
        codigo_invitacion: input.codigo_invitacion,
        cuit: input.cuit,
        direccion: input.direccion,
        documentacion: input.documentacion,
        email_contacto: input.email_contacto,
        nombre: input.nombre,
        telefono: input.telefono ?? input.telefono_contacto,
      }),
    );
    if (!validacion.success) {
      const { detalles, mensaje } = detalle400DesdeZod(validacion.error);
      return jsonError(mensaje, 400, detalles);
    }
    const invitacion = verificarCodigoInvitacionInstitucion(
      validacion.data.codigo_invitacion,
    );
    if (!invitacion.ok) {
      return jsonError(
        invitacion.mensaje,
        invitacion.status,
        invitacion.code === CODIGO_INSTITUCION_INVALIDO
          ? [{ campo: "codigo_invitacion", mensaje: invitacion.mensaje }]
          : { code: invitacion.code },
      );
    }
    const cuitRes = await verificarCuitInstitucion(admin, validacion.data.cuit, SIN_USUARIO);
    if (cuitRes.error) {
      return jsonError("No se pudo verificar el CUIT. Reintentá.", 500, cuitRes.error.code);
    }
    if (cuitRes.conflicto) {
      return jsonError(cuitRes.conflicto ?? MENSAJE_CUIT_DUPLICADO, 409);
    }
    institucionNormalizada = {
      cuit: validacion.data.cuit,
      direccion: validacion.data.direccion,
      documentacion: validacion.data.documentacion,
      email_contacto: validacion.data.email_contacto,
      inviteModo: invitacion.modo,
      nombre: validacion.data.nombre.trim(),
      telefono: validacion.data.telefono,
    };
  }

  // `crear_perfil_inicial` solo lee claves conocidas por rol: para institución
  // se persisten los valores NORMALIZADOS (Zod), no el crudo del formulario.
  // `invite_modo` marca la excepción médica por invitación para el RPC.
  const datos: Record<string, unknown> = {
    alias: input.alias,
    cuit: institucionNormalizada?.cuit ?? input.cuit,
    direccion: institucionNormalizada?.direccion,
    dni: dniNormalizado,
    documentacion: institucionNormalizada?.documentacion ?? input.documentacion,
    email,
    email_contacto: institucionNormalizada?.email_contacto,
    especialidad: especialidadNormalizada ?? input.especialidad,
    estado_verificacion: rol === "medico" ? verificacionMedica : undefined,
    invite_modo: inviteMedicoModo ?? undefined,
    jurisdiccion: jurisdiccionNormalizada ?? input.jurisdiccion,
    matricula: matriculaNormalizada ?? input.matricula,
    nombre: institucionNormalizada?.nombre ?? input.nombre,
    nombre_completo: input.nombre_completo,
    telefono: institucionNormalizada?.telefono,
    telefono_contacto:
      telefonoNormalizado ?? institucionNormalizada?.telefono ?? input.telefono_contacto,
  };

  // 1. Se crea la cuenta ya confirmada. Sin confirmar por email, el usuario
  // quedaría atrapado dependiendo de un SMTP que puede no estar disponible.
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: input.password,
    user_metadata: {
      app_datos: datos,
      app_rol: rol,
    },
  });
  if (authError) {
    if (authError.code === "email_exists") {
      return jsonError("Ya existe una cuenta con ese email. Iniciá sesión.", 409);
    }
    if (authError.status === 422 || authError.code === "weak_password") {
      return jsonError(
        "No se pudo crear la cuenta: revisá el email y la contraseña.",
        400,
      );
    }
    return jsonError(authError.message, authError.status ?? 400);
  }
  if (!authData.user) {
    return jsonError("No se pudo crear la cuenta. Reintentá.", 400);
  }
  const userId = authData.user.id;

  // 2. Alta definitiva del perfil (roles_usuario / perfiles_*).
  try {
    await confirmarYProvisionar(admin, {
      email,
      emailVerificado: true,
      id: userId,
      appDatos: datos,
      appRol: rol,
    });
  } catch (err) {
    // Defensa en profundidad: el guard central también rechaza TEST- sin
    // permiso (p. ej. condición de carrera con el chequeo previo).
    if ((err as { code?: string } | null)?.code === CODIGO_BYPASS_REQUERIDO) {
      return jsonError(err instanceof Error ? err.message : "Matrícula de prueba no autorizada.", 403);
    }
    // El perfil pendiente se auto-provisiona en el siguiente acceso
    // (/api/auth/rol). No se bloquea el ingreso por un fallo transitorio.
    console.error("[register] No se pudo provisionar el perfil:", err);
  }

  // Aviso de actividad: cuenta recién creada (best-effort, no bloquea).
  // Para institución/médico por invitación se audita el modo (`codigo` vs
  // bypass dev) como registro de la excepción.
  await registrarActividadSesion(admin, {
    accion: "registro",
    detalles: {
      canal: "register-email",
      ...(institucionNormalizada ? { invite_modo: institucionNormalizada.inviteModo } : {}),
      ...(inviteMedicoModo ? { invite_modo: inviteMedicoModo } : {}),
      rol,
    },
    direccionIp: ipDeRequest(req),
    email,
    usuarioId: userId,
  });

  // 3. Sesión completa para que el usuario quede logueado en el acto.
  const { data: signInData, error: signInError } =
    await createAnonServerClient().auth.signInWithPassword({
      email,
      password: input.password,
    });
  if (signInError) {
    console.error("[register] Cuenta creada pero no se pudo autenticar:", signInError.message);
    return jsonOk(
      {
        message: "Tu cuenta se creó correctamente. Ahora iniciá sesión.",
        requiere_login: true,
        rol,
        session: { access_token: null, refresh_token: null },
        user: { email, id: userId },
      },
      201,
    );
  }

  return jsonOk(
    {
      message: "Tu cuenta fue creada correctamente.",
      rol,
      requiere_verificacion: false,
      session: {
        access_token: signInData.session?.access_token ?? null,
        refresh_token: signInData.session?.refresh_token ?? null,
      },
      user: {
        email,
        id: userId,
      },
    },
    201,
  );
}
