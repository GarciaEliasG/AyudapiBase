import type { RolUsuario } from "@/lib/supabase/database";

import { parseJsonBody } from "@/lib/api/http";
import { getBearerToken, getRolesForUser, getSessionUser, jsonError, jsonOk } from "@/lib/auth/session";
import { createAdminServerClient } from "@/lib/supabase/server";
import {
  esCuitValido,
  esMatriculaProvisoria,
  esMatriculaValida,
} from "@/lib/validation/profile";

export const runtime = "nodejs";

const ROLES_VINCULABLES: RolUsuario[] = ["paciente", "medico", "institucion"];

interface VincularRolRequest {
  datos?: Record<string, unknown>;
  rol?: string;
}

interface DatosMedico {
  especialidad: string;
  matricula: string;
  telefono_contacto: string;
}

interface DatosPaciente {
  alias?: string;
  nombre_completo?: string;
}

interface DatosInstitucion {
  cuit: string;
  documentacion: Array<{ referencia: string }>;
  nombre: string;
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function normalizarDocumentacion(valor: unknown): Array<{ referencia: string }> {
  const lineas: string[] = [];
  if (typeof valor === "string") {
    lineas.push(...valor.split(/\r?\n/));
  } else if (Array.isArray(valor)) {
    for (const item of valor) {
      if (typeof item === "string") {
        lineas.push(item);
      } else if (item !== null && typeof item === "object") {
        const referencia = (item as { referencia?: unknown }).referencia;
        if (typeof referencia === "string") {
          lineas.push(referencia);
        }
      }
    }
  }
  return lineas
    .map((linea) => linea.trim())
    .filter((linea) => linea.length > 0)
    .map((referencia) => ({ referencia }));
}

function validarDatosMedico(datos: Record<string, unknown>):
  | { error: null; valores: DatosMedico }
  | { error: string; valores: null } {
  const matricula = texto(datos.matricula).toUpperCase();
  const especialidad = texto(datos.especialidad);
  const telefono = texto(datos.telefono_contacto ?? datos.telefono);
  if (esMatriculaProvisoria(matricula) || !esMatriculaValida(matricula)) {
    return { error: "La matrícula profesional es obligatoria (mínimo 4 caracteres).", valores: null };
  }
  if (especialidad.length < 3) {
    return { error: "La especialidad es obligatoria (mínimo 3 caracteres).", valores: null };
  }
  if (telefono.replace(/\D/g, "").length < 8) {
    return { error: "El teléfono de contacto es obligatorio.", valores: null };
  }
  return { error: null, valores: { especialidad, matricula, telefono_contacto: telefono } };
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

function validarDatosInstitucion(datos: Record<string, unknown>):
  | { error: null; valores: DatosInstitucion }
  | { error: string; valores: null } {
  const cuit = texto(datos.cuit);
  const documentacion = normalizarDocumentacion(datos.documentacion);
  const nombre = texto(datos.nombre);
  if (nombre.length < 3) {
    return { error: "El nombre de la institución es obligatorio.", valores: null };
  }
  if (!esCuitValido(cuit)) {
    return { error: "El CUIT debe tener 11 dígitos.", valores: null };
  }
  if (documentacion.length === 0) {
    return { error: "La documentación de respaldo es obligatoria.", valores: null };
  }
  return { error: null, valores: { cuit, documentacion, nombre } };
}

function esConflictoUnico(codigo: string | undefined): boolean {
  return codigo === "23505";
}

/**
 * Vincula un rol al usuario autenticado (panel de selección post-Google) con
 * un patrón upsert robusto:
 * - Paciente/Institución: `crear_perfil_inicial` (idempotente por usuario).
 * - Médico: upsert directo por `usuario_id` con verificación previa de
 *   unicidad de matrícula (409 amigable) y actualización de la fila provisoria
 *   cuando ya existe, evitando `duplicate key ... perfiles_medico_matricula_key`.
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
  const roles = await getRolesForUser(usuario.id);

  if (rol === "medico") {
    const validacion = validarDatosMedico(datos);
    if (validacion.error || !validacion.valores) {
      return jsonError(validacion.error ?? "Datos del perfil médico inválidos.", 400);
    }
    const valores = validacion.valores;

    // La matrícula identifica al profesional: no puede pertenecer a otra cuenta.
    const { data: ocupada, error: ocupadaError } = await admin
      .from("perfiles_medico")
      .select("usuario_id")
      .eq("matricula", valores.matricula)
      .neq("usuario_id", usuario.id)
      .maybeSingle();
    if (ocupadaError) {
      return jsonError(ocupadaError.message, 500, ocupadaError.code);
    }
    if (ocupada) {
      return jsonError(
        "Esa matrícula ya está registrada en otra cuenta. Verificá el número ingresado.",
        409,
      );
    }

    const { data: existente, error: existenteError } = await admin
      .from("perfiles_medico")
      .select("id, matricula")
      .eq("usuario_id", usuario.id)
      .maybeSingle();
    if (existenteError) {
      return jsonError(existenteError.message, 500, existenteError.code);
    }

    // Fila con datos reales: vinculación idempotente, nada que cambiar.
    if (existente && !esMatriculaProvisoria((existente as { matricula?: unknown }).matricula)) {
      return jsonOk({ rol, yaExistia: true });
    }

    const fila = {
      especialidad: valores.especialidad,
      matricula: valores.matricula,
      telefono_contacto: valores.telefono_contacto,
      usuario_id: usuario.id,
    };
    const { error: persistError } = existente
      ? await admin
        .from("perfiles_medico")
        .update({
          especialidad: fila.especialidad,
          matricula: fila.matricula,
          telefono_contacto: fila.telefono_contacto,
        })
        .eq("usuario_id", usuario.id)
      : await admin.from("perfiles_medico").insert(fila);
    if (persistError) {
      if (esConflictoUnico(persistError.code)) {
        return jsonError(
          "Esa matrícula ya está registrada en otra cuenta. Verificá el número ingresado.",
          409,
        );
      }
      return jsonError(persistError.message, 500, persistError.code);
    }

    const { error: rolError } = await admin
      .from("roles_usuario")
      .upsert({ rol: "medico", usuario_id: usuario.id }, { onConflict: "usuario_id, rol" });
    if (rolError) {
      return jsonError(rolError.message, 500, rolError.code);
    }

    await admin.auth.admin.updateUserById(usuario.id, {
      user_metadata: { app_datos: valores, app_rol: rol },
    });

    return jsonOk({ rol, yaExistia: false });
  }

  // Paciente/Institución con el rol ya vinculado: idempotente (el RPC
  // reescribiría el alias con el default, por eso se evita la llamada).
  if (roles.includes(rol)) {
    return jsonOk({ rol, yaExistia: true });
  }

  if (rol === "paciente") {
    const valores = validarDatosPaciente(datos);
    if (!usuario.emailVerificado) {
      await admin.auth.admin.updateUserById(usuario.id, { email_confirm: true });
    }
    const { error } = await admin.rpc("crear_perfil_inicial", {
      p_datos: { ...valores, email: usuario.email },
      p_rol: "paciente",
      p_usuario_id: usuario.id,
    });
    if (error) {
      return jsonError("No se pudo vincular el rol de paciente. Reintentá.", 500, error.code);
    }
    await admin.auth.admin.updateUserById(usuario.id, {
      user_metadata: { app_datos: valores, app_rol: rol },
    });
    return jsonOk({ rol, yaExistia: false });
  }

  const validacion = validarDatosInstitucion(datos);
  if (validacion.error || !validacion.valores) {
    return jsonError(validacion.error ?? "Datos de la institución inválidos.", 400);
  }
  if (!usuario.emailVerificado) {
    await admin.auth.admin.updateUserById(usuario.id, { email_confirm: true });
  }
  const { error } = await admin.rpc("crear_perfil_inicial", {
    p_datos: { ...validacion.valores, email: usuario.email },
    p_rol: "institucion",
    p_usuario_id: usuario.id,
  });
  if (error) {
    return jsonError("No se pudo vincular el rol de institución. Reintentá.", 500, error.code);
  }
  await admin.auth.admin.updateUserById(usuario.id, {
    user_metadata: { app_datos: validacion.valores, app_rol: rol },
  });
  return jsonOk({ rol, yaExistia: false });
}
