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
import { getBearerToken, getSessionUser, jsonError, jsonOk } from "@/lib/auth/session";
import { verificarProfesionalSisa } from "@/lib/auth/sisa";
import {
  verificarDniGlobal,
  verificarUnicidadMedico,
} from "@/lib/auth/verificacion-medico";
import { createAdminServerClient } from "@/lib/supabase/server";
import { normalizarJurisdiccionSisa, normalizarMatricula } from "@/lib/validation/profile";
import { esEmailValido } from "@/lib/validation/profile";
import {
  detalle400DesdeZod,
  dniSchema,
  medicoAltaSchema,
  MENSAJE_DNI_DUPLICADO,
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
    const bypass = isDevBypassActiveFor(usuario.email ?? null);
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
    // Aviso de actividad: registro nuevo vía OAuth (best-effort).
    await registrarActividadSesion(admin, {
      accion: "registro",
      detalles: { canal: "confirmar-sesion", rol },
      direccionIp: ipDeRequest(req),
      email: usuario.email ?? null,
      usuarioId: usuario.id,
    });
  }

  return jsonOk({ rol });
}
