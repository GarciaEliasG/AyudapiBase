import type { PerfilMedicoRow } from "@/lib/supabase/database";

import { parseJsonBody } from "@/lib/api/http";
import {
  getBearerToken,
  getRolesForUser,
  getSessionUser,
  jsonError,
  jsonOk,
} from "@/lib/auth/session";
import { createAdminServerClient } from "@/lib/supabase/server";
import { esMatriculaValida } from "@/lib/validation/profile";

export const runtime = "nodejs";

interface PerfilMedicoUpdate {
  especialidad?: string;
  matricula?: string;
  telefono_contacto?: string;
}

interface UsuarioAutenticado {
  email: string | null;
  id: string;
}

async function autenticarMedico(
  req: Request,
): Promise<
  | { ok: true; usuario: UsuarioAutenticado }
  | { ok: false; response: Response }
> {
  const token = getBearerToken(req.headers.get("authorization"));
  if (!token) {
    return { ok: false, response: jsonError("Autenticación requerida.", 401) };
  }
  const user = await getSessionUser(token);
  if (!user) {
    return { ok: false, response: jsonError("Sesión inválida o expirada.", 401) };
  }
  const roles = await getRolesForUser(user.id);
  if (!roles.includes("medico")) {
    return { ok: false, response: jsonError("Solo el personal médico puede acceder a este recurso.", 403) };
  }
  return { ok: true, usuario: { email: user.email ?? null, id: user.id } };
}

export async function GET(req: Request) {
  const auth = await autenticarMedico(req);
  if (!auth.ok) {
    return auth.response;
  }
  const { usuario } = auth;

  const admin = createAdminServerClient();

  const { data: perfil, error } = await admin
    .from("perfiles_medico")
    .select("*")
    .eq("usuario_id", usuario.id)
    .maybeSingle();
  if (error) {
    return jsonError(error.message, 500, error.code);
  }
  if (!perfil) {
    return jsonError("Perfil de médico no encontrado.", 404);
  }

  return jsonOk({
    email: usuario.email,
    perfil: perfil as PerfilMedicoRow,
  });
}

/**
 * Completa los datos obligatorios del perfil médico (matrícula, especialidad y
 * teléfono de contacto). Patrón upsert robusto por `usuario_id` con
 * verificación previa de unicidad de matrícula: una matrícula ya registrada en
 * otra cuenta responde 409 en lugar de romper con `duplicate key ...`.
 */
export async function PUT(req: Request) {
  const auth = await autenticarMedico(req);
  if (!auth.ok) {
    return auth.response;
  }
  const { usuario } = auth;

  const parsed = await parseJsonBody<PerfilMedicoUpdate>(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const matricula =
    typeof parsed.data.matricula === "string" ? parsed.data.matricula.trim().toUpperCase() : "";
  const especialidad =
    typeof parsed.data.especialidad === "string"
      ? parsed.data.especialidad.trim()
      : "";
  const telefono =
    typeof parsed.data.telefono_contacto === "string"
      ? parsed.data.telefono_contacto.trim()
      : "";

  if (!esMatriculaValida(matricula)) {
    return jsonError(
      "La matrícula profesional es obligatoria (mínimo 4 caracteres).",
      400,
    );
  }
  if (especialidad.length < 3) {
    return jsonError("La especialidad es obligatoria (mínimo 3 caracteres).", 400);
  }
  if (telefono.replace(/\D/g, "").length < 8) {
    return jsonError("El teléfono de contacto es obligatorio.", 400);
  }

  const admin = createAdminServerClient();

  // La matrícula identifica al profesional: no puede pertenecer a otra cuenta.
  const { data: ocupada, error: ocupadaError } = await admin
    .from("perfiles_medico")
    .select("usuario_id")
    .eq("matricula", matricula)
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

  const { data: fila, error: filaError } = await admin
    .from("perfiles_medico")
    .select("id")
    .eq("usuario_id", usuario.id)
    .maybeSingle();
  if (filaError) {
    return jsonError(filaError.message, 500, filaError.code);
  }
  if (!fila) {
    return jsonError("Perfil de médico no encontrado. Reintentá el alta.", 404);
  }

  const { error } = await admin
    .from("perfiles_medico")
    .update({
      especialidad,
      matricula,
      telefono_contacto: telefono,
    })
    .eq("id", fila.id);
  if (error) {
    // Carrera de concurrencia contra la verificación previa: mismo 409 amigable.
    if (error.code === "23505") {
      return jsonError(
        "Esa matrícula ya está registrada en otra cuenta. Verificá el número ingresado.",
        409,
      );
    }
    return jsonError(error.message, 500, error.code);
  }

  return jsonOk({ message: "Perfil de médico actualizado correctamente." });
}