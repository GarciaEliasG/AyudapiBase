import type { RolUsuario } from "@/lib/supabase/database";

import { mapDbError, parseJsonBody } from "@/lib/api/http";
import { jsonError, jsonOk } from "@/lib/auth/session";
import { createAdminServerClient } from "@/lib/supabase/server";
import {
  esCuitValido,
  esEmailValido,
  esMatriculaValida,
} from "@/lib/validation/profile";

export const runtime = "nodejs";

const MIN_PASSWORD_LENGTH = 8;
const ROLES_REGISTRABLES: RolUsuario[] = ["paciente", "medico", "institucion"];

interface RegisterRequest {
  alias?: string;
  cuit?: string;
  documentacion?: unknown[];
  email: string;
  especialidad?: string;
  matricula?: string;
  nombre?: string;
  nombre_completo?: string;
  password: string;
  rol?: RolUsuario;
  telefono_contacto?: string;
}

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

  if (rol === "medico") {
    const matricula = input.matricula?.trim() ?? "";
    const especialidad = input.especialidad?.trim() ?? "";
    if (!esMatriculaValida(matricula)) {
      return jsonError("La matrícula profesional es obligatoria y debe ser válida.", 400);
    }
    if (especialidad.length < 3) {
      return jsonError("La especialidad es obligatoria.", 400);
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

  const admin = createAdminServerClient();

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: input.password,
  });
  if (authError) {
    if (authError.status === 422 || authError.code === "weak_password") {
      return jsonError(
        "No se pudo crear la cuenta: revisá el email y la contraseña.",
        400,
      );
    }
    if (authError.code === "email_exists" || authError.status === 422) {
      return jsonError("Ya existe una cuenta con ese email.", 409);
    }
    return jsonError(authError.message, authError.status ?? 400);
  }

  const userId = authData.user.id;
  const datos = {
    alias: input.alias,
    cuit: input.cuit,
    documentacion: input.documentacion,
    email,
    especialidad: input.especialidad,
    matricula: input.matricula,
    nombre: input.nombre,
    nombre_completo: input.nombre_completo,
    telefono_contacto: input.telefono_contacto,
  };

  const { data: perfil, error: perfilError } = await admin.rpc(
    "crear_perfil_inicial",
    { p_datos: datos, p_rol: rol, p_usuario_id: userId },
  );
  if (perfilError) {
    // Compensación: si falla la creación del perfil, se elimina el auth.user
    // para no dejar cuentas huérfanas.
    await admin.auth.admin.deleteUser(userId, true);
    return mapDbError(perfilError);
  }

  return jsonOk(
    {
      message: "Cuenta creada correctamente.",
      perfil,
      user: {
        email: authData.user.email,
        id: userId,
        rol,
      },
    },
    201,
  );
}