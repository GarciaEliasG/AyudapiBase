"use client";

import { Eye, FileText, Loader2, Lock, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";

import type { EstudioConAcceso, TipoEstudio } from "@/lib/supabase/database";

import { apiFetch } from "@/lib/api/client";
import { useSession } from "@/lib/auth/use-session";
import { cn } from "@/lib/utils";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const TIPOS_ESTUDIO: { clave: TipoEstudio; etiqueta: string }[] = [
  { clave: "ECG", etiqueta: "ECG" },
  { clave: "LABORATORIO", etiqueta: "Laboratorio" },
  { clave: "RADIOGRAFIA", etiqueta: "Radiografía" },
  { clave: "RESONANCIA", etiqueta: "Resonancia" },
  { clave: "TOMOGRAFIA", etiqueta: "Tomografía" },
  { clave: "OTRO", etiqueta: "Otro" },
];

const MIMES_PERMITIDOS = ["application/dicom", "application/pdf", "image/jpeg", "image/png"];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StudyManager() {
  const { session } = useSession();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [estudios, setEstudios] = useState<EstudioConAcceso[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [tipoEstudio, setTipoEstudio] = useState<TipoEstudio>("ECG");

  useEffect(() => {
    if (!session) return;
    apiFetch<{ estudios: EstudioConAcceso[] }>("/api/estudios", session)
      .then((res) => setEstudios(res.estudios))
      .catch(() => setEstudios([]));
  }, [session]);

  async function handleSubirEstudio() {
    setError(null);
    setMessage(null);
    if (!session) return;
    if (!archivo) {
      setError("Seleccioná un archivo para subir.");
      return;
    }
    if (archivo.size > MAX_FILE_SIZE) {
      setError("El archivo supera el límite de 10MB.");
      setArchivo(null);
      return;
    }
    if (!MIMES_PERMITIDOS.includes(archivo.type)) {
      setError("Formato no permitido. Usá PDF, JPG, PNG o DICOM.");
      setArchivo(null);
      return;
    }
    setSubiendo(true);
    try {
      const formData = new FormData();
      formData.append("archivo", archivo);
      formData.append("tipo", tipoEstudio);
      const res = await fetch("/api/estudios", {
        body: formData,
        headers: { Authorization: `Bearer ${session.access_token}` },
        method: "POST",
      });
      const payload = (await res.json()) as { error?: { message?: string }; message?: string };
      if (!res.ok) {
        throw new Error(payload.error?.message ?? "No se pudo subir el estudio.");
      }
      setMessage(payload.message ?? "Estudio subido correctamente.");
      setArchivo(null);
      await loadEstudios();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir el estudio.");
    } finally {
      setSubiendo(false);
    }
  }

  async function loadEstudios() {
    if (!session) return;
    try {
      const res = await apiFetch<{ estudios: EstudioConAcceso[] }>("/api/estudios", session);
      setEstudios(res.estudios);
    } catch {
      setEstudios([]);
    }
  }

  async function handleEliminarEstudio(estudio: EstudioConAcceso) {
    setError(null);
    setMessage(null);
    if (!session) return;
    if (!confirm(`¿Eliminar "${estudio.nombre_archivo}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      await apiFetch<{ eliminado: boolean }>(`/api/estudios/${estudio.id}`, session, {
        method: "DELETE",
      });
      setMessage("Estudio eliminado.");
      await loadEstudios();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el estudio.");
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
          <FileText className="text-blue-600" size={18} />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-gray-900">Estudios médicos</h3>
          <p className="text-sm text-gray-500">PDF · JPG · PNG · DICOM · Máx. 10MB por archivo</p>
        </div>
        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">{estudios.length}</span>
      </div>

      {!session ? (
        <div className="border border-dashed border-gray-200 rounded-xl p-6 text-center">
          <Lock className="text-gray-300 mx-auto mb-2" size={24} />
          <p className="text-sm font-medium text-gray-600">
            Iniciá sesión y completá tu perfil para poder adjuntar estudios médicos.
          </p>
        </div>
      ) : (
        <>
          {(error || message) && (
            <div className={cn("rounded-xl px-4 py-3 mb-4 text-sm", error ? "bg-amber-50 border border-amber-200 text-amber-700" : "bg-green-50 border border-green-100 text-green-700")}>
              {error ?? message}
            </div>
          )}

          <div className="border border-dashed border-gray-200 rounded-xl p-4 mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <input
                accept=".pdf,.jpg,.jpeg,.png,.dcm,.dicom"
                className="text-sm text-gray-600 file:mr-3 file:border-0 file:bg-blue-50 file:text-blue-700 file:font-semibold file:py-2 file:px-4 file:rounded-lg file:cursor-pointer"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
                type="file"
              />
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                onChange={(e) => setTipoEstudio(e.target.value as TipoEstudio)}
                value={tipoEstudio}
              >
                {TIPOS_ESTUDIO.map(({ clave, etiqueta }) => (
                  <option key={clave} value={clave}>{etiqueta}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-gray-400 truncate">
                {archivo ? `${archivo.name} · ${formatBytes(archivo.size)}` : "Ningún archivo seleccionado"}
              </p>
              <button
                className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex-shrink-0"
                disabled={subiendo}
                onClick={() => void handleSubirEstudio()}
              >
                {subiendo ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />} Subir
              </button>
            </div>
          </div>

          {estudios.length > 0 ? (
            <div className="space-y-2">
              {estudios.map((estudio) => {
                const esImagen = estudio.tipo_mime?.startsWith("image/") ?? false;
                return (
                  <div className="flex items-center justify-between border border-gray-100 rounded-xl px-4 py-3" key={estudio.id}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                        <FileText className="text-blue-500" size={14} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{estudio.nombre_archivo}</p>
                        <p className="text-xs text-gray-400">
                          {estudio.tipo} · {estudio.tamano_bytes ? formatBytes(estudio.tamano_bytes) : "—"} ·{" "}
                          {new Date(estudio.creado_en).toLocaleDateString("es-AR")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {esImagen && estudio.url_acceso ? (
                        <img
                          alt={estudio.nombre_archivo}
                          className="w-12 h-10 object-cover rounded-lg border border-gray-100"
                          loading="lazy"
                          src={estudio.url_acceso}
                        />
                      ) : null}
                      {estudio.url_acceso && (
                        <a
                          aria-label={`Ver ${estudio.nombre_archivo}`}
                          className="w-8 h-8 border border-gray-200 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-50"
                          href={estudio.url_acceso}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <Eye size={14} />
                        </a>
                      )}
                      <button
                        aria-label={`Eliminar ${estudio.nombre_archivo}`}
                        className="w-8 h-8 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center justify-center transition-colors"
                        onClick={() => void handleEliminarEstudio(estudio)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-2">Todavía no subiste estudios clínicos.</p>
          )}
        </>
      )}
    </div>
  );
}