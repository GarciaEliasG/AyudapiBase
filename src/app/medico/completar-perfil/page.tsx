"use client";

import { Check, ChevronLeft, Loader2, Lock, RefreshCw, Stethoscope } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { PerfilMedicoRow, RolUsuario } from "@/lib/supabase/database";

import { ApiError, apiFetch } from "@/lib/api/client";
import { RUTA_DESTINO_KEY } from "@/lib/auth/destino";
import { useRol } from "@/lib/auth/use-rol";
import {
  esDniEstrictoValido,
  esJurisdiccionSisaValida,
  esMatriculaDePrueba,
  esMatriculaProvisoria,
  esMatriculaRealValida,
  esTelefonoValido,
  JURISDICCIONES_SISA,
} from "@/lib/validation/profile";

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
  const [codigo, setCodigo] = useState("");
  const [dni, setDni] = useState("");
  const [jurisdiccion, setJurisdiccion] = useState("");
  const [especialidad, setEspecialidad] = useState("");
  const [telefono, setTelefono] = useState("");
  const [cargandoDatos, setCargandoDatos] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [pendiente, setPendiente] = useState(false);
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
        setDni(res.perfil.dni ?? "");
        setJurisdiccion(res.perfil.jurisdiccion ?? "");
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
    setPendiente(false);
    const campos: string[] = [];
    if (!esDniEstrictoValido(dni)) campos.push("DNI (7 u 8 dígitos, sin puntos)");
    const matriculaLimpia = matricula.trim();
    // Matrícula ausente o en trámite: se admite código de invitación médica
    // (el backend lo exige vía `MEDICO_INVITE_CODE`, 403 fail-closed).
    const sinMatricula =
      matriculaLimpia.length === 0 || esMatriculaProvisoria(matriculaLimpia);
    if (!sinMatricula && !esMatriculaRealValida(matriculaLimpia) && !esMatriculaDePrueba(matriculaLimpia)) {
      campos.push("matrícula profesional");
    }
    if (sinMatricula && codigo.trim().length === 0) {
      campos.push("matrícula profesional o código de invitación de médico");
    }
    if (!esJurisdiccionSisaValida(jurisdiccion)) campos.push("jurisdicción oficial");
    if (especialidad.trim().length < 3) campos.push("especialidad");
    if (!esTelefonoValido(telefono)) campos.push("teléfono de contacto");
    if (campos.length > 0) {
      setError(`Completá en la solicitud: ${campos.join(", ")}.`);
      return;
    }
    if (!session) {
      setError("No hay sesión activa. Volvé a ingresar.");
      return;
    }
    const porInvitacion = sinMatricula;
    setSalvando(true);
    try {
      const datos = {
        codigo_invitacion: codigo.trim() || undefined,
        dni: dni.trim(),
        especialidad: especialidad.trim(),
        jurisdiccion: jurisdiccion.trim(),
        matricula: matricula.trim() || undefined,
        telefono_contacto: telefono.trim(),
      };
      const cuerpo = JSON.stringify(datos);
      try {
        const res = await apiFetch<{ invitacion?: boolean; message: string }>(
          "/api/medico/me",
          session,
          {
            body: cuerpo,
            method: "PUT",
          },
        );
        // Guardado por invitación: el perfil queda pendiente de verificación
        // de matrícula, pero en esta etapa opera con acceso completo (mismos
        // permisos que verificado). Se continúa al destino o al escáner.
        if (res.invitacion ?? porInvitacion) {
          const destinoInvitacion = window.sessionStorage.getItem(RUTA_DESTINO_KEY);
          if (destinoInvitacion?.startsWith("/") && !destinoInvitacion.startsWith("//")) {
            window.sessionStorage.removeItem(RUTA_DESTINO_KEY);
            router.replace(destinoInvitacion);
            return;
          }
          setListo(true);
          setPendiente(true);
          setSalvando(false);
          router.replace("/medico/escanear");
          return;
        }
      } catch (err) {
        // Sin fila previa: se crea mediante la vinculación del rol médico
        // (ya admite la vía de invitación con el mismo código).
        if (err instanceof ApiError && err.status === 404) {
          await apiFetch<VincularRespuesta>("/api/auth/vincular-rol", session, {
            body: JSON.stringify({ datos, rol: "medico" }),
            method: "POST",
          });
          if (porInvitacion) {
            const destinoVinculacion = window.sessionStorage.getItem(RUTA_DESTINO_KEY);
            if (destinoVinculacion?.startsWith("/") && !destinoVinculacion.startsWith("//")) {
              window.sessionStorage.removeItem(RUTA_DESTINO_KEY);
              router.replace(destinoVinculacion);
              return;
            }
            setListo(true);
            setPendiente(true);
            setSalvando(false);
            router.replace("/medico/escanear");
            return;
          }
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
                    DNI <span className="text-blue-600">*</span>
                  </label>
                  <input
                    className={inputClass}
                    disabled={salvando}
                    inputMode="numeric"
                    maxLength={8}
                    onChange={(e) => setDni(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    placeholder="30123456 (7 u 8 dígitos, sin puntos)"
                    type="text"
                    value={dni}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">
                      Matrícula profesional <span className="text-blue-600">*</span>
                    </label>
                    <input
                      className={inputClass}
                      disabled={salvando}
                      onChange={(e) => setMatricula(e.target.value)}
                      placeholder="MP 123456 / MN 789012 (o código si está en trámite)"
                      type="text"
                      value={matricula}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">
                      Jurisdicción <span className="text-blue-600">*</span>
                    </label>
                    <select
                      className={inputClass}
                      disabled={salvando}
                      onChange={(e) => setJurisdiccion(e.target.value)}
                      value={jurisdiccion}
                    >
                      <option value="">Seleccionar</option>
                      {JURISDICCIONES_SISA.map((j) => (
                        <option key={j} value={j}>{j}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-gray-400">Tu credencial se verifica contra el padrón SISA/REFEPS. Sin coincidencia, el alta se bloquea.</p>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">
                    Código de invitación de médico
                  </label>
                  <input
                    className={inputClass}
                    disabled={salvando}
                    onChange={(e) => setCodigo(e.target.value)}
                    placeholder="Solo si tu matrícula está en trámite"
                    type="text"
                    value={codigo}
                  />
                  <p className="text-xs text-gray-400 mt-1">Si aún no tenés matrícula, ingresá el código provisto por tu institución.</p>
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

              {pendiente && (
                <p className="text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-4">
                  Perfil guardado como pendiente de verificación de matrícula. Ya podés operar con acceso completo; cuando te otorguen tu matrícula definitiva, actualizala aquí.
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
