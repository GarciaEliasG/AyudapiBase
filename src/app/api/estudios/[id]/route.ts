import {
  getBearerToken,
  getSessionUser,
  jsonError,
  jsonOk,
} from "@/lib/auth/session";
import { createAdminServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const BUCKET = "estudios";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
    .single();
  if (perfilError || !perfil) {
    return jsonError(
      "Perfil de paciente no encontrado. Completá tu perfil de paciente para administrar tus estudios.",
      404,
    );
  }

  const { id } = await params;

  const { data: estudio, error: findError } = await admin
    .from("estudios")
    .select("*")
    .eq("id", id)
    .eq("paciente_id", perfil.id)
    .maybeSingle();
  if (findError) {
    return jsonError(findError.message, 500, findError.code);
  }
  if (!estudio) {
    return jsonError("Estudio no encontrado.", 404);
  }

  const { error: storageError } = await admin.storage
    .from(BUCKET)
    .remove([estudio.ruta_archivo]);
  if (storageError) {
    return jsonError("No se pudo eliminar el archivo del almacenamiento.", 500, storageError.message);
  }

  const { error: deleteError } = await admin
    .from("estudios")
    .delete()
    .eq("id", estudio.id);
  if (deleteError) {
    return jsonError(deleteError.message, 500, deleteError.code);
  }

  return jsonOk({ eliminado: true, message: "Estudio eliminado." });
}