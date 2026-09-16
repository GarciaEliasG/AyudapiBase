"use client";

import { Check, ChevronLeft, Loader2, Lock, RefreshCw, Stethoscope } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { PerfilMedicoRow, RolUsuario } from "@/lib/supabase/database";

import { ApiError, apiFetch } from "@/lib/api/client";
import { RUTA_DESTINO_KEY } from "@/lib/auth/destino";
import { useRol } from "@/lib/auth/use-rol";
import { esMatriculaProvisoria, esMatriculaValida } from "@/lib/validation/profile";

interface VincularRespuesta {
  rol: RolUsuario;
  yaExistia: boolean;
}

/**
 * Alta y completado del perfil médico. Cubre tres estados de carga: perfil
 * existente (se precompleta), perfil ausente (se crea al guardar vía
 * vinculación) y error de red (con reintento explícito). Al guardar, reanuda
 * el destino pendiente si existía (p. ej. un QR de emergencia).
 */
export default function CompletarPerfilMedicoPage() {
  const router = useRouter();
  const { loading, rol, session } = useRol();
  const [matricula, setMatricula] = useState("");
  const [especialidad, setEspecialidad] = useState("");
  const [telefono, setTelefono] = useState("");
  const [cargandoDatos, setCargandoDatos] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace("/");
      return;
    }
    if (rol !== "medico") {
      router.replace("/");
      return;
    }
  }, [loading, rol, router, session]);

  useEffect(() => {
    if (!session || rol !== "medico") return;
    let activo = true;
    apiFetch<{ perfil: PerfilMedicoRow }>("/api/medico/me", session)
      .then((res) => {
        if (!activo) return;
        setMatricula(esMatriculaProvisoria(res.perfil.matricula) ? "" : (res.perfil.matricula ?? ""));
        setEspecialidad(res.perfil.especialidad ?? "");
        setTelefono(res.perfil.telefono_contacto ?? "");
      })
      .catch((err) => {
        if (!activo) return;
        // Sin fila de perfil médico (404): se crea al guardar, no es un error.
        if (!(err instanceof ApiError && err.status === 404)) {
          setErrorCarga(err instanceof Error ? err.message : "No pudimos cargar tu perfil de médico.");
        }
      })
      .finally(() => {
        if (activo) setCargandoDatos(false);
      });
    return () => {
      activo = false;
    };
  }, [intento, rol, session]);

  async function guardar() {
    setError(null);
    const campos: string[] = [];
    if (!esMatriculaValida(matricula)) campos.push("matrícula profesional");
    if (especialidad.trim().length < 3) campos.push("especialidad");
    if (telefono.replace(/\D/g, "").length < 8) campos.push("teléfono de contacto");
    if (campos.length > 0) {
      setError(`Completá en la solicitud: ${campos.join(", ")}.`);
      return;
    }
    if (!session) {
      setError("No hay sesión activa. Volvé a ingresar.");
      return;
    }
    setSalvando(true);
    try {
      const cuerpo = JSON.stringify({
        especialidad: especialidad.trim(),
        matricula: matricula.trim(),
        telefono_contacto: telefono.trim(),
      });
      try {
        await apiFetch<{ message: string }>("/api/medico/me", session, {
          body: cuerpo,
          method: "PUT",
        });
      } catch (err) {
        // Sin fila previa: se crea mediante la vinculación del rol médico.
        if (err instanceof ApiError && err.status === 404) {
          await apiFetch<VincularRespuesta>("/api/auth/vincular-rol", session, {
            body: JSON.stringify({
              datos: {
                especialidad: especialidad.trim(),
                matricula: matricula.trim(),
                telefono_contacto: telefono.trim(),
              },
              rol: "medico",
            }),
            method: "POST",
          });
        } else {
          throw err;
        }
      }
      const destino = window.sessionStorage.getItem(RUTA_DESTINO_KEY);
      if (destino?.startsWith("/") && !destino.startsWith("//")) {
        window.sessionStorage.removeItem(RUTA_DESTINO_KEY);
        router.replace(destino);
        return;
      }
      setListo(true);
      router.replace("/medico/escanear");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "No se pudo guardar el perfil. Reintentá.",
      );
      setSalvando(false);
    }
  }

  const inputClass =
    "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60";

  if (loading || (session !== null && rol !== "medico")) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-4"
        style={{ background: "#0F1929", fontFamily: "Inter, sans-serif" }}
      >
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-blue-200/70 text-sm">Preparando tu perfil profesional…</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center px-4 py-12"
      style={{ background: "#0F1929", fontFamily: "Inter, sans-serif" }}
    >
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-5">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: "#2563EB" }}
          >
            <Stethoscope className="text-blue-200" size={28} />
          </div>
        </div>

        <h1 className="text-2xl font-extrabold text-white text-center mb-1">
          Completá tus datos profesionales
        </h1>
        <p className="text-blue-200/70 text-sm text-center mb-8">
          Son obligatorios para operar con acceso auditado (Ley 25.326)
        </p>

        <div className="bg-white rounded-2xl p-6 shadow-2xl">
          {cargandoDatos ? (
            <div className="flex flex-col items-center py-8">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-sm text-gray-500">Cargando tu perfil…</p>
            </div>
          ) : errorCarga ? (
            <div className="text-center py-4">
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                {errorCarga}
              </p>
              <button
                className="w-full flex items-center justify-center gap-2 text-white font-bold py-3 rounded-xl transition-colors text-sm"
                onClick={() => {
                  setCargandoDatos(true);
                  setErrorCarga(null);
                  setIntento((n) => n + 1);
                }}
                style={{ background: "#2563EB" }}
              >
                <RefreshCw size={15} /> Reintentar
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-4 mb-5">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">
                    Matrícula profesional <span className="text-blue-600">*</span>
                  </label>
                  <input
                    className={inputClass}
                    disabled={salvando}
                    onChange={(e) => setMatricula(e.target.value)}
                    placeholder="MP 123456 / ME 789012"
                    type="text"
                    value={matricula}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">
                    Especialidad <span className="text-blue-600">*</span>
                  </label>
                  <input
                    className={inputClass}
                    disabled={salvando}
                    onChange={(e) => setEspecialidad(e.target.value)}
                    placeholder="Clínica, Pediatría, Emergentología…"
                    type="text"
                    value={especialidad}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">
                    Teléfono de contacto <span className="text-blue-600">*</span>
                  </label>
                  <input
                    className={inputClass}
                    disabled={salvando}
                    onChange={(e) => setTelefono(e.target.value)}
                    placeholder="+54 11 XXXX-XXXX"
                    type="tel"
                    value={telefono}
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                  {error}
                </p>
              )}

              <button
                className="w-full flex items-center justify-center gap-2 text-white font-bold py-3 rounded-xl transition-colors text-sm disabled:opacity-60"
                disabled={salvando}
                onClick={() => void guardar()}
                style={{ background: "#2563EB" }}
              >
                {salvando ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : listo ? (
                  <Check size={16} />
                ) : null}
                {salvando ? "Guardando…" : listo ? "Listo" : "Guardar y continuar"}
              </button>
            </>
          )}

          <div className="mt-4 bg-blue-50 border border-blue-100 rounded-xl p-3 flex gap-2">
            <Lock className="text-blue-600 flex-shrink-0 mt-0.5" size={14} />
            <p className="text-xs text-blue-800 leading-relaxed">
              <strong>Datos protegidos:</strong> con tu matrícula registramos cada
              consulta al historial clínico en la auditoría.
            </p>
          </div>
        </div>

        <Link
          className="mt-6 flex items-center justify-center gap-1 text-sm text-blue-300/70 hover:text-blue-300 transition-colors w-full"
          href="/"
        >
          <ChevronLeft size={14} /> Volver al inicio
        </Link>
      </div>
    </div>
  );
}
