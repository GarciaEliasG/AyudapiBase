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
import { getBearerToken, getSessionUser, jsonError, jsonOk } from "@/lib/auth/session";
import { verificarProfesionalSisa } from "@/lib/auth/sisa";
import {
  verificarDniGlobal,
  verificarUnicidadMedico,
} from "@/lib/auth/verificacion-medico";
import { createAdminServerClient } from "@/lib/supabase/server";
import { normalizarJurisdiccionSisa, normalizarMatricula } from "@/lib/validation/profile";
import { esEmailValido, esMatriculaProvisoria } from "@/lib/validation/profile";
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

const ROLES_VALIDOS: RolUsuario[] = ["paciente", "medico", "institucion"];

interface ConfirmarSesionRequest {
  email?: string;
  /** Rol elegido al crear la cuenta con Google (paciente / medico / institucion). */
  rol?: RolUsuario;
  /** Datos del perfil elegidos en el formulario (matrícula, especialidad…). */
  datos?: Record<string, unknown>;
}

/**
 * Confirma el email de la sesión actual (flujo de magic-link/callback) y da de
 * alta el perfil definitivo en la base de datos si todavía no existía. Devuelve
 * el rol principal para que el cliente enrute la UI correctamente.
 *
 * Rigor SISA/REFEPS: el alta como médico exige DNI + jurisdicción + matrícula
 * + teléfono + especialidad (400 por campo), unicidad global del DNI y de la
 * matrícula (409) y coincidencia con el padrón SISA (403 "Médico no
 * registrado…"). Las `TEST-...` solo pasan con `DEV_ADMIN_EMAILS` (403).
 * El alta como paciente exige DNI único (400/409).
 * El alta como institución exige el esquema Zod compartido (400 por campo),
 * código de invitación `INSTITUCION_INVITE_CODE` (403) y CUIT único (409):
 * sin invitación válida no hay auto-provisión institucional por este canal.
 * El alta como médico admite la vía de invitación (`MEDICO_INVITE_CODE`):
 * matrícula ausente o en trámite + código válido → provisoria `PENDIENTE-...`
 * y `pendiente` sin contraste SISA (403 fail-closed sin código válido).
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

  const parsed = await parseJsonBody<ConfirmarSesionRequest>(req);
  if (!parsed.ok) {
    return parsed.response;
  }
  const emailParam = parsed.data.email?.trim();
  if (emailParam) {
    if (!esEmailValido(emailParam)) {
      return jsonError("Email inválido en el cuerpo de la solicitud.", 400);
    }
    if (emailParam.toLowerCase() !== (usuario.email ?? "").toLowerCase()) {
      return jsonError("El email no corresponde a la sesión actual.", 403);
    }
  }

  // Rol/datos pedidos durante "Crear cuenta con Google": se usan para dar el
  // alta con ese perfil en lugar del default "paciente".
  const rolSolicitado =
    parsed.data.rol && ROLES_VALIDOS.includes(parsed.data.rol)
      ? parsed.data.rol
      : undefined;
  const datosSolicitados =
    parsed.data.datos &&
    typeof parsed.data.datos === "object" &&
    !Array.isArray(parsed.data.datos)
      ? { ...(parsed.data.datos as Record<string, unknown>) }
      : undefined;

  const admin = createAdminServerClient();

  /** Modo de la vía de invitación médica, si se usó. */
  let inviteMedicoModo: ModoInvitacion | null = null;

  // Bypass: los datos controlados por el cliente no pueden traer una
  // matrícula de prueba sin email autorizado (se persistiría como real).
  if (rolSolicitado === "medico" && datosSolicitados) {
    const bloqueo = motivoBloqueoMatriculaDePrueba(
      usuario.email ?? null,
      (datosSolicitados as Record<string, unknown>).matricula,
    );
    if (bloqueo) {
      return jsonError(bloqueo, 403);
    }
    const bypass = isDevBypassActiveFor(usuario.email ?? null);
    const matriculaCruda =
      typeof datosSolicitados.matricula === "string"
        ? datosSolicitados.matricula.trim()
        : "";
    // Vía de invitación: matrícula ausente o en trámite + mecanismo habilitado.
    // Suple al padrón SISA y deja el perfil `pendiente` con provisoria
    // `PENDIENTE-...` (generada por `confirmarYProvisionar`). Sin secreto
    // configurado rige la vía estricta clásica (matrícula obligatoria, 400).
    if (!bypass && esMatriculaProvisoria(matriculaCruda) && invitacionMedicaHabilitada()) {
      const invitacionParse = medicoAltaInvitacionSchema.safeParse({
        codigo_invitacion: datosSolicitados.codigo_invitacion,
        dni: datosSolicitados.dni,
        especialidad: datosSolicitados.especialidad,
        jurisdiccion: datosSolicitados.jurisdiccion,
        matricula: matriculaCruda.length > 0 ? matriculaCruda : undefined,
        telefono_contacto:
          datosSolicitados.telefono_contacto ?? datosSolicitados.telefono,
      });
      if (!invitacionParse.success) {
        const { detalles, mensaje } = detalle400DesdeZod(invitacionParse.error);
        return jsonError(mensaje, 400, detalles);
      }
      const gate = verificarCodigoInvitacionMedico(invitacionParse.data.codigo_invitacion);
      if (!gate.ok) {
        return jsonError(
          gate.mensaje,
          gate.status,
          gate.code === CODIGO_MEDICO_INVALIDO
            ? [{ campo: "codigo_invitacion", mensaje: gate.mensaje }]
            : { code: gate.code },
        );
      }
      const dni = invitacionParse.data.dni.trim();
      const dniRes = await verificarDniGlobal(admin, { dni, usuarioId: usuario.id });
      if (dniRes.conflicto) {
        return jsonError(dniRes.conflicto, 409);
      }
      datosSolicitados.dni = dni;
      datosSolicitados.jurisdiccion =
        normalizarJurisdiccionSisa(invitacionParse.data.jurisdiccion) ??
        invitacionParse.data.jurisdiccion.trim().toUpperCase();
      datosSolicitados.matricula = undefined;
      datosSolicitados.telefono_contacto = invitacionParse.data.telefono_contacto.trim();
      datosSolicitados.especialidad = invitacionParse.data.especialidad.trim();
      datosSolicitados.estado_verificacion = "pendiente";
      // Marca la excepción para el RPC (`crear_perfil_inicial` la persiste).
      datosSolicitados.invite_modo = gate.modo;
      inviteMedicoModo = gate.modo;
    } else {
      // Alta médica estricta: Zod (400) → unicidad global (409) → SISA (403).
      const validacion = medicoAltaSchema.safeParse({
        dni: datosSolicitados.dni,
        especialidad: datosSolicitados.especialidad,
        jurisdiccion: datosSolicitados.jurisdiccion,
        matricula: datosSolicitados.matricula,
        telefono_contacto:
          datosSolicitados.telefono_contacto ?? datosSolicitados.telefono,
      });
      if (!validacion.success) {
        const { detalles, mensaje } = detalle400DesdeZod(validacion.error);
        return jsonError(mensaje, 400, detalles);
      }
      const dni = validacion.data.dni.trim();
      const jurisdiccion =
        normalizarJurisdiccionSisa(validacion.data.jurisdiccion) ??
        validacion.data.jurisdiccion.trim().toUpperCase();
      const matricula = normalizarMatricula(validacion.data.matricula);
      const [dniRes, matriculaRes, sisaRes] = await Promise.all([
        verificarDniGlobal(admin, { dni, usuarioId: usuario.id }),
        verificarUnicidadMedico(admin, { dni, jurisdiccion, matricula, usuarioId: usuario.id }),
        bypass
          ? Promise.resolve({ ok: true as const })
          : verificarProfesionalSisa(admin, { dni, jurisdiccion, matricula }),
      ]);
      if (dniRes.conflicto) {
        return jsonError(dniRes.conflicto, 409);
      }
      if (matriculaRes.conflicto) {
        return jsonError(matriculaRes.conflicto, 409);
      }
      if (!sisaRes.ok) {
        return jsonError(sisaRes.mensaje, 403);
      }
      datosSolicitados.dni = dni;
      datosSolicitados.jurisdiccion = jurisdiccion;
      datosSolicitados.matricula = matricula;
      datosSolicitados.telefono_contacto = validacion.data.telefono_contacto.trim();
      datosSolicitados.especialidad = validacion.data.especialidad.trim();
      datosSolicitados.estado_verificacion = verificacionPara(usuario.email ?? null);
    }
  }

  if (rolSolicitado === "institucion") {
    // Sin datos no hay alta institucional por este canal: se deriva al panel
    // de vinculación (`/auth/elegir-rol` → `/api/auth/vincular-rol`), que sí
    // exige esquema + invitación + CUIT. Esto evita auto-provisión con el
    // default 'Institución' del RPC.
    if (!datosSolicitados) {
      return jsonError(
        "El alta institucional requiere completar los datos y el código de invitación.",
        400,
      );
    }
    const validacion = institucionAltaSchema.safeParse(
      normalizarInstitucionCruda(datosSolicitados),
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
    const cuitRes = await verificarCuitInstitucion(admin, validacion.data.cuit, usuario.id);
    if (cuitRes.error) {
      return jsonError("No se pudo verificar el CUIT. Reintentá.", 500, cuitRes.error.code);
    }
    if (cuitRes.conflicto) {
      return jsonError(cuitRes.conflicto ?? MENSAJE_CUIT_DUPLICADO, 409);
    }
    const { codigo_invitacion: _inv, ...perfilNormalizado } = validacion.data;
    void _inv;
    Object.assign(datosSolicitados, {
      ...perfilNormalizado,
      nombre: perfilNormalizado.nombre.trim(),
      telefono_contacto: perfilNormalizado.telefono,
    });
  }

  if (rolSolicitado === "paciente" && datosSolicitados?.dni !== undefined) {
    const dniParse = dniSchema.safeParse(datosSolicitados.dni);
    if (!dniParse.success) {
      const { detalles, mensaje } = detalle400DesdeZod(dniParse.error);
      return jsonError(mensaje, 400, detalles);
    }
    const dni = dniParse.data.trim();
    const dniRes = await verificarDniGlobal(admin, { dni, usuarioId: usuario.id });
    if (dniRes.conflicto) {
      return jsonError(dniRes.conflicto ?? MENSAJE_DNI_DUPLICADO, 409);
    }
    datosSolicitados.dni = dni;
  }

  let rol: RolUsuario | null = null;
  let altaNueva = false;
  try {
    const resultado = await confirmarYProvisionar(
      admin,
      usuario,
      {
        appDatos: datosSolicitados,
        appRol: rolSolicitado,
      },
    );
    rol = resultado.rol;
    altaNueva = !resultado.yaExistia;
  } catch (err) {
    if ((err as { code?: string } | null)?.code === CODIGO_BYPASS_REQUERIDO) {
      return jsonError(err instanceof Error ? err.message : "Matrícula de prueba no autorizada.", 403);
    }
    console.error("[confirmar-sesion] No se pudo dar de alta el perfil:", err);
    return jsonError("No se pudo completar el alta del perfil. Reintentá.", 500);
  }

  if (altaNueva && rol) {
    // Aviso de actividad: registro nuevo vía OAuth (best-effort). La vía de
    // invitación médica queda registrada como excepción (`invite_modo`).
    await registrarActividadSesion(admin, {
      accion: "registro",
      detalles: {
        canal: "confirmar-sesion",
        ...(inviteMedicoModo ? { invite_modo: inviteMedicoModo } : {}),
        rol,
      },
      direccionIp: ipDeRequest(req),
      email: usuario.email ?? null,
      usuarioId: usuario.id,
    });
  }

  return jsonOk({ rol });
}
