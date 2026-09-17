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
import { confirmarYProvisionar } from "@/lib/auth/registro";
import { jsonError, jsonOk } from "@/lib/auth/session";
import { verificarProfesionalSisa } from "@/lib/auth/sisa";
import {
  verificarDniGlobal,
  verificarUnicidadMedico,
} from "@/lib/auth/verificacion-medico";
import { createAdminServerClient, createAnonServerClient } from "@/lib/supabase/server";
import { esTelefonoValido, normalizarJurisdiccionSisa, normalizarMatricula } from "@/lib/validation/profile";
import { esCuitValido, esEmailValido } from "@/lib/validation/profile";
import {
  detalle400DesdeZod,
  dniSchema,
  medicoAltaSchema,
  MENSAJE_DNI_DUPLICADO,
} from "@/lib/validation/schemas";

export const runtime = "nodejs";

const MIN_PASSWORD_LENGTH = 8;
const ROLES_REGISTRABLES: RolUsuario[] = ["paciente", "medico", "institucion"];
/** Usuario inexistente: ningún `usuario_id` real coincide, el DNI debe estar libre. */
const SIN_USUARIO = "00000000-0000-0000-0000-000000000000";

interface RegisterRequest {
  alias?: string;
  cuit?: string;
  dni?: string;
  documentacion?: unknown[];
  email: string;
  especialidad?: string;
  jurisdiccion?: string;
  matricula?: string;
  nombre?: string;
  nombre_completo?: string;
  password: string;
  rol?: RolUsuario;
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

  if (rol === "medico") {
    const matriculaCruda = input.matricula?.trim() ?? "";
    // Bypass: las matrículas de prueba exigen email autorizado. Se rechaza
    // ANTES de crear la cuenta para no dejar usuarios huérfanos sin perfil.
    const bloqueo = motivoBloqueoMatriculaDePrueba(email, matriculaCruda);
    if (bloqueo) {
      return jsonError(bloqueo, 403);
    }
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

    const esBypass = isDevBypassActiveFor(email);
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

  if (rol === "institucion") {
    const nombre = input.nombre?.trim() ?? "";
    const cuit = input.cuit?.trim() ?? "";
    const documentacion = input.documentacion ?? [];
    if (nombre.length < 3) {
      return jsonError("El nombre de la institución es obligatorio.", 400);
    }
    if (!esCuitValido(cuit)) {
      return jsonError("El CUIT es obligatorio y debe tener 11 dígitos.", 400);
    }
    if (!Array.isArray(documentacion) || documentacion.length === 0) {
      return jsonError("La documentación de respaldo es obligatoria.", 400);
    }
  }

  const datos: Record<string, unknown> = {
    alias: input.alias,
    cuit: input.cuit,
    dni: dniNormalizado,
    documentacion: input.documentacion,
    email,
    especialidad: especialidadNormalizada ?? input.especialidad,
    estado_verificacion: rol === "medico" ? verificacionMedica : undefined,
    jurisdiccion: jurisdiccionNormalizada ?? input.jurisdiccion,
    matricula: matriculaNormalizada ?? input.matricula,
    nombre: input.nombre,
    nombre_completo: input.nombre_completo,
    telefono_contacto: telefonoNormalizado ?? input.telefono_contacto,
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
  await registrarActividadSesion(admin, {
    accion: "registro",
    detalles: { canal: "register-email", rol },
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
