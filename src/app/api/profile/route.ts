import type {
  Medicamento,
  PerfilPacienteRow,
  RolUsuario,
} from "@/lib/supabase/database";

import { parseJsonBody } from "@/lib/api/http";
import {
  getBearerToken,
  getRoleForUser,
  getSessionUser,
  jsonError,
  jsonOk,
} from "@/lib/auth/session";
import { decryptSensitiveValue, encryptSensitiveValue } from "@/lib/security/cipher";
import { createAdminServerClient } from "@/lib/supabase/server";
import { normalizarFecha, validarPerfilObligatorios } from "@/lib/validation/profile";

export const runtime = "nodejs";

type PerfilPacienteConSensibles = PerfilPacienteRow & {
  medicacion: Medicamento[] | null;
  notas_medicas: string | null;
};

interface ProfileGetResponse {
  perfil: PerfilPacienteConSensibles | null;
  perfil_institucion: unknown | null;
  perfil_medico: unknown | null;
  rol: RolUsuario;
}

function descifrarLista<T>(valor: string | null): T[] | null {
  if (!valor || valor.length === 0) {
    return null;
  }
  try {
    return decryptSensitiveValue<T[]>(valor);
  } catch {
    try {
      return JSON.parse(valor) as T[];
    } catch {
      return null;
    }
  }
}

function descifrarTexto(valor: string | null): string | null {
  if (!valor || valor.length === 0) {
    return null;
  }
  try {
    return decryptSensitiveValue<string>(valor);
  } catch {
    try {
      const parsed = JSON.parse(valor) as unknown;
      return typeof parsed === "string" ? parsed : JSON.stringify(parsed);
    } catch {
      return null;
    }
  }
}

export async function GET(req: Request) {
  const token = getBearerToken(req.headers.get("authorization"));
  if (!token) {
    return jsonError("Autenticación requerida.", 401);
  }
  const user = await getSessionUser(token);
  if (!user) {
    return jsonError("Sesión inválida o expirada.", 401);
  }

  const admin = createAdminServerClient();

  let rol = await getRoleForUser(user.id);

  // Auto-provisión para usuarios creados por OAuth (Google): se les asigna el
  // rol paciente y un perfil mínimo en una sola transacción.
  if (!rol) {
    const { error: provError } = await admin.rpc("crear_perfil_inicial", {
      p_datos: { email: user.email },
      p_rol: "paciente",
      p_usuario_id: user.id,
    });
    if (provError) {
      return jsonError(provError.message, 500, provError.code);
    }
    rol = "paciente";
  }

  const respuesta: ProfileGetResponse = {
    perfil: null,
    perfil_institucion: null,
    perfil_medico: null,
    rol,
  };

  // Rol dual (médico-paciente): el médico también tiene su propio perfil de
  // paciente para generar y administrar su QR de emergencia. Se consulta
  // siempre; si no existe, `perfil` queda en null.
  const { data: perfilPaciente, error: perfilPacienteError } = await admin
    .from("perfiles_paciente")
    .select("*")
    .eq("usuario_id", user.id)
    .maybeSingle();
  if (perfilPacienteError) {
    return jsonError(perfilPacienteError.message, 500, perfilPacienteError.code);
  }
  if (perfilPaciente) {
    respuesta.perfil = {
      ...perfilPaciente,
      medicacion: descifrarLista<Medicamento>(perfilPaciente.medicacion),
      notas_medicas: descifrarTexto(perfilPaciente.notas_medicas),
    } as PerfilPacienteConSensibles;
  }

  if (rol === "medico") {
    const { data, error } = await admin
      .from("perfiles_medico")
      .select("*")
      .eq("usuario_id", user.id)
      .maybeSingle();
    if (error) {
      return jsonError(error.message, 500, error.code);
    }
    respuesta.perfil_medico = data;
  } else if (rol === "institucion") {
    const { data, error } = await admin
      .from("perfiles_institucion")
      .select("*")
      .eq("usuario_id", user.id)
      .maybeSingle();
    if (error) {
      return jsonError(error.message, 500, error.code);
    }
    respuesta.perfil_institucion = data;
  }

  return jsonOk(respuesta);
}

export async function PUT(req: Request) {
  const token = getBearerToken(req.headers.get("authorization"));
  if (!token) {
    return jsonError("Autenticación requerida.", 401);
  }
  const user = await getSessionUser(token);
  if (!user) {
    return jsonError("Sesión inválida o expirada.", 401);
  }

  const parsed = await parseJsonBody<Record<string, unknown>>(req);
  if (!parsed.ok) {
    return parsed.response;
  }
  const input = parsed.data;

  const alias = typeof input.alias === "string" ? input.alias.trim() : "";
  const fechaNacimiento = normalizarFecha(input.fecha_nacimiento);
  const genero = typeof input.genero === "string" ? input.genero.trim() : "";
  const grupoSanguineo =
    typeof input.grupo_sanguineo === "string" ? input.grupo_sanguineo.trim() : "";

  const errores = validarPerfilObligatorios({
    alias,
    fecha_nacimiento: fechaNacimiento,
    genero,
    grupo_sanguineo: grupoSanguineo,
  });

  if (errores.length > 0) {
    return jsonError(`Completá los campos obligatorios: ${errores.join(" ")}`, 400);
  }

  const admin = createAdminServerClient();
  const { data: fila, error: filaError } = await admin
    .from("perfiles_paciente")
    .select("id")
    .eq("usuario_id", user.id)
    .maybeSingle();
  if (filaError) {
    return jsonError(filaError.message, 500, filaError.code);
  }

  const payload: Record<string, unknown> = {
    alias,
    fecha_nacimiento: fechaNacimiento,
    genero: genero || null,
    grupo_sanguineo: grupoSanguineo || null,
  };

  if (input.nombre_completo !== undefined) {
    payload.nombre_completo = input.nombre_completo;
  }
  if (input.altura_cm !== undefined) {
    payload.altura_cm = input.altura_cm;
  }
  if (input.peso_kg !== undefined) {
    payload.peso_kg = input.peso_kg;
  }
  if (input.alergias !== undefined) {
    payload.alergias = input.alergias;
  }
  if (input.patologias !== undefined) {
    payload.patologias = input.patologias;
  }
  if (input.contactos_emergencia !== undefined) {
    payload.contactos_emergencia = input.contactos_emergencia;
  }
  if (input.share_location !== undefined) {
    payload.share_location = input.share_location;
  }
  if (input.public_profile !== undefined) {
    payload.public_profile = input.public_profile;
  }
  if (input.med_access !== undefined) {
    payload.med_access = input.med_access;
  }
  if (input.obra_reports !== undefined) {
    payload.obra_reports = input.obra_reports;
  }

  if (Array.isArray(input.medicacion)) {
    payload.medicacion = encryptSensitiveValue(input.medicacion);
  }
  if (typeof input.notas_medicas === "string") {
    payload.notas_medicas =
      input.notas_medicas.trim().length > 0
        ? encryptSensitiveValue(input.notas_medicas.trim())
        : null;
  }

  if (fila) {
    const { error } = await admin
      .from("perfiles_paciente")
      .update(payload)
      .eq("id", fila.id);
    if (error) {
      return jsonError(error.message, 500, error.code);
    }
  } else {
    const { error } = await admin.from("perfiles_paciente").insert({
      ...payload,
      usuario_id: user.id,
    });
    if (error) {
      return jsonError(error.message, 500, error.code);
    }
  }

  // Rol dual (médico-paciente): se asegura que el usuario tenga el rol
  // "paciente" para poder generar y administrar su QR de emergencia.
  const { error: rolError } = await admin
    .from("roles_usuario")
    .upsert({ usuario_id: user.id, rol: "paciente" }, { onConflict: "usuario_id, rol" });
  if (rolError) {
    return jsonError(rolError.message, 500, rolError.code);
  }

  return jsonOk({ message: "Perfil actualizado correctamente." });
}