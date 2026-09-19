import type { RolUsuario } from "@/lib/supabase/database";

import { parseJsonBody } from "@/lib/api/http";
import { ipDeRequest, registrarActividadSesion } from "@/lib/auth/actividad-servidor";
import { isDevBypassActiveFor, verificacionPara } from "@/lib/auth/dev-bypass";
import {
  CODIGO_INSTITUCION_INVALIDO,
  verificarCodigoInvitacionInstitucion,
  verificarCuitInstitucion,
} from "@/lib/auth/institucion";
import {
  invitacionMedicaHabilitada,
  verificarCodigoInvitacionMedico,
} from "@/lib/auth/invitacion";
import { getBearerToken, getRolesForUser, getSessionUser, jsonError, jsonOk } from "@/lib/auth/session";
import { verificarProfesionalSisa } from "@/lib/auth/sisa";
import {
  guardarPerfilMedico,
  mensajeConflictoMatricula,
  verificarDniGlobal,
  verificarUnicidadMedico,
} from "@/lib/auth/verificacion-medico";
import { createAdminServerClient } from "@/lib/supabase/server";
import {
  esMatriculaDePrueba,
  esMatriculaProvisoria,
  matriculaProvisoriaPara,
  normalizarDni,
  normalizarJurisdiccionSisa,
  normalizarMatricula,
} from "@/lib/validation/profile";
import {
  detalle400DesdeZod,
  dniSchema,
  institucionAltaSchema,
  medicoAltaInvitacionSchema,
  medicoAltaSchema,
  MENSAJE_CUIT_DUPLICADO,
  MENSAJE_DNI_DUPLICADO,
  MENSAJE_SISA,
  normalizarInstitucionCruda,
} from "@/lib/validation/schemas";

export const runtime = "nodejs";

const ROLES_VINCULABLES: RolUsuario[] = ["paciente", "medico", "institucion"];

interface VincularRolRequest {
  datos?: Record<string, unknown>;
  rol?: string;
}

interface DatosMedico {
  dni: string | null;
  especialidad: string;
  /** Presente solo en la vía de invitación (matrícula en trámite). */
  inviteModo?: "codigo";
  jurisdiccion: string | null;
  matricula: string;
  telefono_contacto: string;
}

interface DatosPaciente {
  alias?: string;
  nombre_completo?: string;
}

interface DatosInstitucion {
  cuit: string;
  direccion?: string;
  documentacion: Array<{ referencia: string }>;
  email_contacto?: string;
  nombre: string;
  telefono?: string;
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function validarDatosMedico(
  datos: Record<string, unknown>,
  opciones?: { bypass?: boolean; usuarioId?: string },
):
  | { error: null; status?: undefined; valores: DatosMedico }
  | { error: string; status: 400 | 403; valores: null } {
  const bypass = opciones?.bypass === true;
  const mutables: Record<string, unknown> = { ...datos };

  // Modo bypass: autogenerar matrícula de prueba y completar faltantes para
  // avanzar fluidamente en testing local (TEST-<8 chars del usuario).
  if (bypass) {
    if (esMatriculaProvisoria(normalizarMatricula(mutables.matricula)) || texto(mutables.matricula).length === 0) {
      const base = (opciones?.usuarioId ?? "").replace(/-/g, "").slice(0, 8).toUpperCase() || "GENERAL";
      mutables.matricula = `TEST-${base}`;
    }
    if (texto(mutables.especialidad).length < 3) {
      mutables.especialidad = "Medicina General";
    }
    if (texto(mutables.telefono_contacto ?? mutables.telefono).replace(/\D/g, "").length < 8) {
      mutables.telefono_contacto = "+54 11 0000-0000";
    }
    if (texto(mutables.jurisdiccion).length === 0) {
      mutables.jurisdiccion = "NACIONAL";
    }
  }

  // Sin bypass activo, la credencial de prueba es un intento de uso de un
  // canal privilegiado: 403 (prohibido), no 400 (dato malformado).
  const esPrueba = esMatriculaDePrueba(normalizarMatricula(mutables.matricula));
  if (esPrueba && !bypass) {
    return {
      error: "Las matrículas de prueba (TEST-...) solo están habilitadas para cuentas de desarrollo autorizadas.",
      status: 403,
      valores: null,
    };
  }

  // Vía de invitación: matrícula ausente o en trámite + mecanismo habilitado
  // (`MEDICO_INVITE_CODE`). Falla cerrada: sin código válido → 403. La
  // provisoria `PENDIENTE-...` (única por usuario) reemplaza a la matrícula
  // real hasta que el profesional la complete; el handler omite el padrón
  // SISA en este caso. Sin secreto configurado se cae a la validación
  // estricta clásica (matrícula obligatoria, 400).
  const sinMatricula =
    esMatriculaProvisoria(normalizarMatricula(mutables.matricula)) ||
    texto(mutables.matricula).length === 0;
  if (!bypass && sinMatricula && invitacionMedicaHabilitada()) {
    const invitacion = medicoAltaInvitacionSchema.safeParse({
      codigo_invitacion: mutables.codigo_invitacion,
      dni: mutables.dni,
      especialidad: mutables.especialidad,
      jurisdiccion: mutables.jurisdiccion,
      matricula:
        texto(mutables.matricula).length > 0 &&
        !esMatriculaProvisoria(normalizarMatricula(mutables.matricula))
          ? mutables.matricula
          : undefined,
      telefono_contacto: mutables.telefono_contacto ?? mutables.telefono,
    });
    if (!invitacion.success) {
      const { mensaje } = detalle400DesdeZod(invitacion.error);
      return { error: mensaje, status: 400, valores: null };
    }
    const gate = verificarCodigoInvitacionMedico(invitacion.data.codigo_invitacion);
    if (!gate.ok) {
      return {
        error: gate.mensaje,
        status: gate.status,
        valores: null,
      };
    }
    const dni = normalizarDni(invitacion.data.dni);
    const jurisdiccion = normalizarJurisdiccionSisa(invitacion.data.jurisdiccion);
    return {
      error: null,
      valores: {
        dni,
        especialidad: invitacion.data.especialidad.trim(),
        inviteModo: "codigo",
        jurisdiccion,
        matricula: matriculaProvisoriaPara(opciones?.usuarioId ?? ""),
        telefono_contacto: invitacion.data.telefono_contacto.trim(),
      },
    };
  }

  // Validación estricta Zod (SISA/REFEPS): DNI + jurisdicción oficial +
  // matrícula + teléfono + especialidad, todos obligatorios. El 400 detalla
  // exactamente qué campo falló.
  const validacion = medicoAltaSchema.safeParse({
    dni: mutables.dni,
    especialidad: mutables.especialidad,
    jurisdiccion: mutables.jurisdiccion,
    matricula: mutables.matricula,
    telefono_contacto: mutables.telefono_contacto ?? mutables.telefono,
  });
  if (!validacion.success) {
    const { mensaje } = detalle400DesdeZod(validacion.error);
    return { error: mensaje, status: 400, valores: null };
  }
  const dni = normalizarDni(validacion.data.dni);
  const jurisdiccion = normalizarJurisdiccionSisa(validacion.data.jurisdiccion);
  const matricula = normalizarMatricula(validacion.data.matricula);
  return {
    error: null,
    valores: {
      dni,
      especialidad: validacion.data.especialidad.trim(),
      jurisdiccion,
      matricula,
      telefono_contacto: validacion.data.telefono_contacto.trim(),
    },
  };
}

function validarDatosPaciente(datos: Record<string, unknown>): DatosPaciente {
  const resultado: DatosPaciente = {};
  const alias = texto(datos.alias);
  const nombreCompleto = texto(datos.nombre_completo);
  if (alias.length >= 2) {
    resultado.alias = alias;
  }
  if (nombreCompleto.length > 0) {
    resultado.nombre_completo = nombreCompleto;
  }
  return resultado;
}

/**
 * Valida el alta institucional con el MISMO esquema Zod que `/api/auth/register`
 * (`institucionAltaSchema` + `normalizarInstitucionCruda`): 400 por campo con
 * detalle. El gate de invitación y el 409 de CUIT los resuelve el handler
 * principal (necesitan env + admin client), no esta función pura.
 */
function validarDatosInstitucion(datos: Record<string, unknown>):
  | { error: null; valores: DatosInstitucion }
  | { detalles?: Array<{ campo: string; mensaje: string }>; error: string; valores: null } {
  const validacion = institucionAltaSchema.safeParse(normalizarInstitucionCruda(datos));
  if (!validacion.success) {
    const { detalles, mensaje } = detalle400DesdeZod(validacion.error);
    return { detalles, error: mensaje, valores: null };
  }
  const { codigo_invitacion: _invitacion, ...perfil } = validacion.data;
  void _invitacion;
  return {
    error: null,
    valores: {
      cuit: perfil.cuit,
      direccion: perfil.direccion,
      documentacion: perfil.documentacion,
      email_contacto: perfil.email_contacto,
      nombre: perfil.nombre.trim(),
      telefono: perfil.telefono,
    },
  };
}

function esConflictoUnico(codigo: string | undefined): boolean {
  return codigo === "23505";
}

/**
 * Vincula un rol al usuario autenticado (panel de selección post-Google) con
 * un patrón upsert robusto:
 * - Paciente/Institución: `crear_perfil_inicial` (idempotente por usuario).
 * - Médico: upsert directo por `usuario_id` con verificación previa de
 *   unicidad de matrícula (+jurisdicción/DNI) en paralelo con la lectura de la
 *   fila existente (409 amigable ante colisiones) y actualización de la fila
 *   provisoria cuando ya existe, evitando
 *   `duplicate key ... perfiles_medico_matricula_key`.
 * Seguridad del bypass: `isDevBypassActiveFor(usuario.email)` falla cerrado;
 * sin bypass, las matrículas `TEST-...` se rechazan con 403 y las provisorias
 * o vacías con 400. Solo desarrolladores autorizados reciben
 * `estado_verificacion = "verificado"`.
 * Vía de invitación médica (opcional, `MEDICO_INVITE_CODE` configurado):
 * matrícula ausente o en trámite + código válido → rol otorgado con matrícula
 * provisoria `PENDIENTE-...`, `estado_verificacion = "pendiente"` y SISA
 * omitido (auditado con `invite_modo`). Código inválido/ausente → 403
 * fail-closed. Sin secreto rige la vía estricta (matrícula obligatoria).
 * Si el rol ya estaba vinculado con datos reales, la operación es idempotente.
 */
export async function POST(req: Request) {
  const token = getBearerToken(req.headers.get("authorization"));
  if (!token) {
    return jsonError("Autenticación requerida.", 401);
  }
  const usuario = await getSessionUser(token);
  if (!usuario) {
    return jsonError("Sesión inválida o expirada.", 401);
  }

  const parsed = await parseJsonBody<VincularRolRequest>(req);
  if (!parsed.ok) {
    return parsed.response;
  }
  const rolSolicitado = parsed.data.rol;
  if (!rolSolicitado || !ROLES_VINCULABLES.includes(rolSolicitado as RolUsuario)) {
    return jsonError("El rol elegido no es válido.", 400);
  }
  const rol = rolSolicitado as RolUsuario;
  const datos = parsed.data.datos && typeof parsed.data.datos === "object" && !Array.isArray(parsed.data.datos)
    ? parsed.data.datos
    : {};

  const admin = createAdminServerClient();

  if (rol === "medico") {
    // `isDevBypassActiveFor` falla cerrado: solo `true` para emails listados
    // en `DEV_ADMIN_EMAILS` (y fuera de producción salvo flag explícito).
    const bypass = isDevBypassActiveFor(usuario.email ?? null);
    const validacion = validarDatosMedico(datos, { bypass, usuarioId: usuario.id });
    if (validacion.error || !validacion.valores) {
      return jsonError(
        validacion.error ?? "Datos del perfil médico inválidos.",
        validacion.status ?? 400,
      );
    }
    const valores = validacion.valores;

    // Unicidad rigurosa (matrícula + DNI global: una cuenta por DNI) + padrón
    // SISA + fila existente: consultas independientes en un único `Promise.all`.
    // Vía de invitación (`inviteModo`): la provisoria `PENDIENTE-...` es única
    // por construcción (no requiere chequeo de colisión real) y el padrón SISA
    // se omite (sin matrícula no hay qué contrastar); el DNI global sí se
    // exige siempre (409).
    const [unicidad, dniGlobal, sisaRes, existenteRes] = await Promise.all([
      verificarUnicidadMedico(admin, {
        dni: valores.dni,
        jurisdiccion: valores.jurisdiccion,
        matricula: valores.matricula,
        usuarioId: usuario.id,
      }),
      valores.dni
        ? verificarDniGlobal(admin, { dni: valores.dni, usuarioId: usuario.id })
        : Promise.resolve<{ conflicto: string | null; error?: { code?: string; message: string } }>({ conflicto: null }),
      bypass || valores.inviteModo === "codigo"
        ? Promise.resolve({ ok: true as const })
        : verificarProfesionalSisa(admin, {
            dni: valores.dni,
            jurisdiccion: valores.jurisdiccion,
            matricula: valores.matricula,
          }),
      admin
        .from("perfiles_medico")
        .select("id, matricula")
        .eq("usuario_id", usuario.id)
        .maybeSingle(),
    ]);
    if (unicidad.error) {
      return jsonError("No se pudo verificar la matrícula. Reintentá.", 500, unicidad.error.code);
    }
    if (unicidad.conflicto) {
      return jsonError(unicidad.conflicto, 409);
    }
    if (dniGlobal.error) {
      return jsonError("No se pudo verificar el DNI. Reintentá.", 500, dniGlobal.error.code);
    }
    if (dniGlobal.conflicto) {
      return jsonError(dniGlobal.conflicto, 409);
    }
    // Sin bypass, la credencial debe coincidir con el padrón SISA/REFEPS: si
    // el médico no está registrado o los datos no coinciden, alta bloqueada.
    if (!sisaRes.ok) {
      return jsonError(sisaRes.mensaje || MENSAJE_SISA, 403);
    }

    const { data: existente, error: existenteError } = existenteRes;
    if (existenteError) {
      return jsonError(existenteError.message, 500, existenteError.code);
    }

    // Fila con datos reales: vinculación idempotente, nada que cambiar.
    if (existente && !esMatriculaProvisoria((existente as { matricula?: unknown }).matricula)) {
      return jsonOk({ bypass, rol, verificacion: verificacionPara(usuario.email ?? null), yaExistia: true });
    }

    const verificacion = verificacionPara(usuario.email ?? null);
    const { error: persistError } = await guardarPerfilMedico(admin, usuario.id, {
      dni: valores.dni,
      especialidad: valores.especialidad,
      estadoVerificacion: verificacion,
      // Vía de invitación: marca la excepción; vía estricta con matrícula
      // real: la limpia (regularización, opera ya sin excepción).
      inviteModo: valores.inviteModo ?? null,
      jurisdiccion: valores.jurisdiccion,
      matricula: valores.matricula,
      telefonoContacto: valores.telefono_contacto,
    }, Boolean(existente));
    if (persistError) {
      if (esConflictoUnico(persistError.code)) {
        return jsonError(
          mensajeConflictoMatricula(valores.matricula, valores.jurisdiccion),
          409,
        );
      }
      return jsonError(persistError.message, 500, persistError.code);
    }

    // Rol + metadata: escrituras independientes en paralelo.
    const [rolRes, metaRes] = await Promise.all([
      admin
        .from("roles_usuario")
        .upsert({ rol: "medico", usuario_id: usuario.id }, { onConflict: "usuario_id, rol" }),
      admin.auth.admin.updateUserById(usuario.id, {
        user_metadata: { app_datos: valores, app_rol: rol },
      }),
    ]);
    if (rolRes.error) {
      return jsonError(rolRes.error.message, 500, rolRes.error.code);
    }
    if (metaRes.error) {
      return jsonError(metaRes.error.message, 500);
    }

    // Aviso de actividad: registro médico nuevo (best-effort, no bloquea).
    // La vía de invitación queda registrada como excepción (`invite_modo`).
    await registrarActividadSesion(admin, {
      accion: "registro",
      detalles: {
        bypass,
        canal: "vincular-rol",
        ...(valores.inviteModo ? { invite_modo: valores.inviteModo } : {}),
      },
      direccionIp: ipDeRequest(req),
      email: usuario.email ?? null,
      usuarioId: usuario.id,
    });

    return jsonOk({ bypass, rol, verificacion, yaExistia: false });
  }

  // `roles` solo se necesita en las ramas paciente/institución: se lee aquí
  // (y no antes) para no penalizar el camino médico con un RTT extra.
  const roles = await getRolesForUser(usuario.id);

  // Paciente/Institución con el rol ya vinculado: idempotente (el RPC
  // reescribiría el alias con el default, por eso se evita la llamada).
  if (roles.includes(rol)) {
    return jsonOk({ rol, yaExistia: true });
  }

  if (rol === "paciente") {
    // El DNI es obligatorio también para pacientes (Zod estricto) y único en
    // todo el sistema (una sola cuenta por DNI → 409).
    const dniParse = dniSchema.safeParse(datos.dni);
    if (!dniParse.success) {
      const { detalles, mensaje } = detalle400DesdeZod(dniParse.error);
      return jsonError(mensaje, 400, detalles);
    }
    const dniPaciente = dniParse.data.trim();
    const dniRes = await verificarDniGlobal(admin, { dni: dniPaciente, usuarioId: usuario.id });
    if (dniRes.error) {
      return jsonError("No se pudo verificar el DNI. Reintentá.", 500, dniRes.error.code);
    }
    if (dniRes.conflicto) {
      return jsonError(dniRes.conflicto ?? MENSAJE_DNI_DUPLICADO, 409);
    }
    const valores = { ...validarDatosPaciente(datos), dni: dniPaciente };
    if (!usuario.emailVerificado) {
      await admin.auth.admin.updateUserById(usuario.id, { email_confirm: true });
    }
    const { error } = await admin.rpc("crear_perfil_inicial", {
      p_datos: { ...valores, email: usuario.email },
      p_rol: "paciente",
      p_usuario_id: usuario.id,
    });
    if (error) {
      if (error.code === "23505") {
        return jsonError(MENSAJE_DNI_DUPLICADO, 409);
      }
      return jsonError("No se pudo vincular el rol de paciente. Reintentá.", 500, error.code);
    }
    await admin.auth.admin.updateUserById(usuario.id, {
      user_metadata: { app_datos: valores, app_rol: rol },
    });
    // Aviso de actividad: registro de paciente nuevo (best-effort).
    await registrarActividadSesion(admin, {
      accion: "registro",
      detalles: { canal: "vincular-rol" },
      direccionIp: ipDeRequest(req),
      email: usuario.email ?? null,
      usuarioId: usuario.id,
    });
    return jsonOk({ rol, yaExistia: false });
  }

  // Institución: esquema Zod estricto compartido con register (400 por campo),
  // gate de invitación (403) y CUIT único (409). Mismo orden que el registro
  // por email para respuestas consistentes entre ambos flujos.
  const validacion = validarDatosInstitucion(datos);
  if (validacion.error || !validacion.valores) {
    return jsonError(
      validacion.error ?? "Datos de la institución inválidos.",
      400,
      "detalles" in validacion ? validacion.detalles : undefined,
    );
  }
  const invitacion = verificarCodigoInvitacionInstitucion(datos.codigo_invitacion);
  if (!invitacion.ok) {
    return jsonError(
      invitacion.mensaje,
      invitacion.status,
      invitacion.code === CODIGO_INSTITUCION_INVALIDO
        ? [{ campo: "codigo_invitacion", mensaje: invitacion.mensaje }]
        : { code: invitacion.code },
    );
  }
  const cuitRes = await verificarCuitInstitucion(admin, validacion.valores.cuit, usuario.id);
  if (cuitRes.error) {
    return jsonError("No se pudo verificar el CUIT. Reintentá.", 500, cuitRes.error.code);
  }
  if (cuitRes.conflicto) {
    return jsonError(cuitRes.conflicto ?? MENSAJE_CUIT_DUPLICADO, 409);
  }
  if (!usuario.emailVerificado) {
    await admin.auth.admin.updateUserById(usuario.id, { email_confirm: true });
  }
  const { error } = await admin.rpc("crear_perfil_inicial", {
    p_datos: {
      ...validacion.valores,
      email: usuario.email,
      telefono_contacto: validacion.valores.telefono,
    },
    p_rol: "institucion",
    p_usuario_id: usuario.id,
  });
  if (error) {
    return jsonError("No se pudo vincular el rol de institución. Reintentá.", 500, error.code);
  }
  await admin.auth.admin.updateUserById(usuario.id, {
    user_metadata: { app_datos: validacion.valores, app_rol: rol },
  });
  // Aviso de actividad: registro de institución nuevo (best-effort).
  await registrarActividadSesion(admin, {
    accion: "registro",
    detalles: {
      canal: "vincular-rol",
      invite_modo: invitacion.modo,
    },
    direccionIp: ipDeRequest(req),
    email: usuario.email ?? null,
    usuarioId: usuario.id,
  });
  return jsonOk({ rol, yaExistia: false });
}
