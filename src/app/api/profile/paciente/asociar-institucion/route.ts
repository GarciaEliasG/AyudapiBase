import { mapDbError, parseJsonBody } from "@/lib/api/http";
import {
  getBearerToken,
  getSessionUser,
  jsonError,
  jsonOk,
} from "@/lib/auth/session";
import { createAdminServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface AsociarInstitucionRequest {
  institucion_id: string;
  nro_afilado?: string;
  obra_social?: string;
}

export async function POST(req: Request) {
  const token = getBearerToken(req.headers.get("authorization"));
  if (!token) {
    return jsonError("Autenticación requerida.", 401);
  }
  const user = await getSessionUser(token);
  if (!user) {
    return jsonError("Sesión inválida o expirada.", 401);
  }

  const parsed = await parseJsonBody<AsociarInstitucionRequest>(req);
  if (!parsed.ok) {
    return parsed.response;
  }
  const { institucion_id, nro_afilado, obra_social } = parsed.data;

  if (!institucion_id) {
    return jsonError("El campo institucion_id es obligatorio.", 400);
  }

  const admin = createAdminServerClient();
  const { data: perfil, error: perfilError } = await admin
    .from("perfiles_paciente")
    .select("id")
    .eq("usuario_id", user.id)
    .maybeSingle();
  if (perfilError) {
    return jsonError(perfilError.message, 500);
  }
  if (!perfil) {
    return jsonError(
      "Perfil de paciente no encontrado. Completá tu perfil de paciente para asociar una institución.",
      404,
    );
  }

  const { error } = await admin
    .from("pacientes_institucion")
    .upsert(
      {
        institucion_id,
        nro_afilado: nro_afilado ?? null,
        obra_social: obra_social ?? null,
        paciente_id: perfil.id,
      },
      { onConflict: "paciente_id,institucion_id" },
    );
  if (error) {
    return mapDbError(error);
  }

  return jsonOk({ asociado: true, institucion_id, message: "Institución asociada." });
}