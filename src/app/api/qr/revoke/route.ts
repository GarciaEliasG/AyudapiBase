import {
  getBearerToken,
  getSessionUser,
  jsonError,
  jsonOk,
} from "@/lib/auth/session";
import { createAdminServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function DELETE(req: Request) {
  const token = getBearerToken(req.headers.get("authorization"));
  if (!token) {
    return jsonError("Autenticación requerida.", 401);
  }
  const user = await getSessionUser(token);
  if (!user) {
    return jsonError("Sesión inválida o expirada.", 401);
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
      "Perfil de paciente no encontrado. Completá tu perfil de paciente para administrar tu QR.",
      404,
    );
  }

  const { error: tokenError } = await admin
    .from("tokens_qr")
    .update({ activo: false, revocado_en: new Date().toISOString() })
    .eq("activo", true)
    .eq("paciente_id", perfil.id);
  if (tokenError) {
    return jsonError(tokenError.message, 500);
  }

  const { error: perfilError2 } = await admin
    .from("perfiles_paciente")
    .update({ qr_activo: false })
    .eq("id", perfil.id);
  if (perfilError2) {
    return jsonError(perfilError2.message, 500);
  }

  return jsonOk({ message: "QR revocado. El código existente ya no funciona.", revocado: true });
}