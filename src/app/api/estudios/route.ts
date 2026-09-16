import { randomUUID } from "node:crypto";

import type { EstudioConAcceso, TipoEstudio } from "@/lib/supabase/database";

import { asegurarPerfilPaciente } from "@/lib/auth/registro";
import {
  getBearerToken,
  getSessionUser,
  jsonError,
  jsonOk,
} from "@/lib/auth/session";
import { createAdminServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB estrictos
const BUCKET = "estudios";

const TIPOS_PERMITIDOS = new Map<string, string>([
  ["application/dicom", "dcm"],
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
]);

const TIPOS_ESTUDIO: TipoEstudio[] = [
  "ECG",
  "LABORATORIO",
  "RADIOGRAFIA",
  "RESONANCIA",
  "TOMOGRAFIA",
  "OTRO",
];

function esExtensionValida(nombre: string): boolean {
  const ext = nombre.split(".").pop()?.toLowerCase() ?? "";
  return [
    "pdf",
    "jpg",
    "jpeg",
    "png",
    "dcm",
    "dicom",
    "dim",
  ].includes(ext);
}

function safeFileName(nombre: string): string {
  const base = nombre.split(/[\\/]/).pop() ?? "archivo";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
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

  const admin = createAdminServerClient();

  // Alta transparente del perfil de paciente si aún no existe (médicos con rol
  // dual, cuentas nuevas): el primer estudio crea el perfil con los datos
  // básicos en lugar de fallar con 404.
  const asegurado = await asegurarPerfilPaciente(admin, user);
  if (!asegurado) {
    return jsonError("No se pudo preparar tu perfil de paciente. Reintentá.", 500);
  }
  const perfil = { id: asegurado.id };

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonError("El cuerpo debe enviarse como multipart/form-data.", 400);
  }

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File)) {
    return jsonError("El campo archivo es obligatorio.", 400);
  }

  const tipo = (formData.get("tipo") as string | null) ?? "OTRO";
  const descripcion = (formData.get("descripcion") as string | null) ?? "";

  if (!TIPOS_ESTUDIO.includes(tipo as TipoEstudio)) {
    return jsonError("Tipo de estudio inválido.", 400);
  }
  if (archivo.size === 0) {
    return jsonError("El archivo está vacío.", 400);
  }
  if (archivo.size > MAX_FILE_SIZE) {
    return jsonError("El archivo supera el límite de 10MB por archivo.", 413);
  }
  const mime = archivo.type.toLowerCase();
  if (!TIPOS_PERMITIDOS.has(mime)) {
    return jsonError("Formato no permitido. Usá PDF, JPG, PNG o DICOM.", 415);
  }
  if (!esExtensionValida(archivo.name)) {
    return jsonError("La extensión del archivo no es válida.", 415);
  }

  const { error: bucketError } = await admin.storage.createBucket(BUCKET, {
    public: false,
  });
  if (bucketError && !String(bucketError.message).toLowerCase().includes("exists")) {
    return jsonError(
      "No se pudo inicializar el almacenamiento de estudios.",
      500,
      bucketError.message,
    );
  }

  const extension = TIPOS_PERMITIDOS.get(mime) ?? "bin";
  const rutaArchivo = `${perfil.id}/${randomUUID()}.${extension}`;

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(rutaArchivo, archivo, {
      cacheControl: "3600",
      contentType: mime,
      upsert: false,
    });
  if (uploadError) {
    return jsonError("No se pudo subir el archivo al almacenamiento.", 500, uploadError.message);
  }

  const { data: estudio, error: insertError } = await admin
    .from("estudios")
    .insert({
      descripcion: descripcion.trim().slice(0, 300) || null,
      nombre_archivo: safeFileName(archivo.name),
      paciente_id: perfil.id,
      ruta_archivo: rutaArchivo,
      tamano_bytes: archivo.size,
      tipo,
      tipo_mime: mime,
    })
    .select("*")
    .single();

  if (insertError) {
    await admin.storage.from(BUCKET).remove([rutaArchivo]);
    return jsonError(insertError.message, 500, insertError.code);
  }

  return jsonOk({ estudio, message: "Estudio subido correctamente.", perfil_creado: asegurado.creado }, 201);
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

  // Lectura tolerante: sin perfil de paciente aún, la lista es vacía (el
  // perfil se crea de forma transparente al adjuntar el primer estudio).
  const asegurado = await asegurarPerfilPaciente(admin, user);
  if (!asegurado) {
    return jsonOk({ estudios: [] });
  }
  const perfil = { id: asegurado.id };

  const { data: filas, error } = await admin
    .from("estudios")
    .select("*")
    .eq("paciente_id", perfil.id)
    .order("creado_en", { ascending: false });
  if (error) {
    return jsonError(error.message, 500, error.code);
  }

  const estudios: EstudioConAcceso[] = await Promise.all(
    (filas ?? []).map(async (fila) => {
      const { data: firmado } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(fila.ruta_archivo, 300);
      return { ...fila, url_acceso: firmado?.signedUrl ?? null } as EstudioConAcceso;
    }),
  );

  return jsonOk({ estudios });
}