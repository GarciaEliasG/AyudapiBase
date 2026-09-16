"use client";

import {
  AlertTriangle,
  Building2,
  ChevronRight,
  Download,
  Loader2,
  Lock,
  LogIn,
  Pill,
  QrCode,
  RefreshCw,
  ShieldOff,
  Stethoscope,
  User,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { Medicamento, PerfilMedicoRow, PerfilPacienteRow, RolUsuario } from "@/lib/supabase/database";

import { LoginModal } from "@/components/auth/login-modal";
import { StudyManager } from "@/components/estudios/study-manager";
import { Navbar } from "@/components/layout/navbar";
import { apiFetch } from "@/lib/api/client";
import { useSession } from "@/lib/auth/use-session";
import { cn } from "@/lib/utils";

interface PerfilResponse {
  perfil: PerfilPacienteRow & { medicacion: Medicamento[] | null; notas_medicas: string | null };
  perfil_medico: PerfilMedicoRow | null;
  rol: RolUsuario;
}

export default function MiPerfilPage() {
  const { loading: loadingSession, session } = useSession();
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<PerfilResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [institucionId, setInstitucionId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [obraSocial, setObraSocial] = useState("");
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (!session) return;
    let activo = true;
    apiFetch<PerfilResponse>("/api/profile", session)
      .then((res) => {
        if (activo) {
          setData(res);
          setError(null);
        }
      })
      .catch((err) => {
        if (activo) {
          setError(err instanceof Error ? err.message : "No se pudo cargar el perfil.");
        }
      });
    return () => {
      activo = false;
    };
  }, [session]);

  async function load() {
    if (!session) return;
    const res = await apiFetch<PerfilResponse>("/api/profile", session);
    setData(res);
  }

  if (loadingSession) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={28} />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50" style={{ fontFamily: "Inter, sans-serif" }}>
        <Navbar />
        <div className="max-w-md mx-auto px-4 py-24 text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Lock className="text-blue-600" size={28} />
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 mb-2">Sesión requerida</h1>
          <p className="text-gray-500 text-sm mb-6">
            Iniciá sesión para ver y administrar tu perfil médico y tu código QR.
          </p>
          <button
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
            onClick={() => setShowLogin(true)}
          >
            <LogIn size={16} /> Iniciar sesión
          </button>
        </div>
        {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      </div>
    );
  }

  async function handleRegenerate() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const qr = await apiFetch<{ slug: string; url_publica: string }>("/api/qr/generate", session);
      await load();
      setMessage(`QR regenerado: ${qr.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo regenerar el QR.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke() {
    if (!confirm("¿Revocar el QR activo? El código actual dejará de funcionar de inmediato.")) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiFetch("/api/qr/revoke", session, { method: "DELETE" });
      await load();
      setMessage("QR revocado correctamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo revocar el QR.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload() {
    if (!session) return;
    const res = await fetch("/api/qr/download?format=png", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ayudapi-qr.png";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleAsociar() {
    if (!institucionId.trim()) {
      setError("Ingresá el id de la institución.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiFetch("/api/profile/paciente/asociar-institucion", session, {
        body: JSON.stringify({
          institucion_id: institucionId.trim(),
          obra_social: obraSocial.trim() || undefined,
        }),
        method: "POST",
      });
      setMessage("Institución asociada correctamente.");
      setInstitucionId("");
      setObraSocial("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo asociar la institución.");
    } finally {
      setBusy(false);
    }
  }

  const perfil = data?.perfil ?? null;
  const condiciones = [
    ...(perfil?.alergias ?? []),
    ...(perfil?.patologias ?? []),
  ] as Array<{ descripcion?: string; severidad?: string; tipo?: string; }>;

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "Inter, sans-serif" }}>
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">Mi perfil</h1>
            <p className="text-sm text-gray-500">Nivel 2 · Solo vos podés ver y editar estos datos</p>
          </div>
          <Link
            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            href="/crear-perfil"
          >
            Editar perfil <ChevronRight size={14} />
          </Link>
        </div>

        {(error || message) && (
          <div className={cn("rounded-xl px-4 py-3 mb-4 text-sm", error ? "bg-amber-50 border border-amber-200 text-amber-700" : "bg-green-50 border border-green-100 text-green-700")}>
            {error ?? message}
          </div>
        )}

        {data?.rol === "medico" && (
          <div className="bg-white rounded-2xl border-2 border-blue-100 p-6 shadow-sm mb-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                <Stethoscope className="text-emerald-600" size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-gray-900">Perfil profesional médico</h2>
                <p className="text-sm text-gray-500">
                  {data.perfil_medico?.especialidad ?? "Especialidad no cargada"}
                </p>
              </div>
              <span className="flex items-center gap-1 border border-emerald-300 text-emerald-700 text-xs font-semibold px-3 py-1 rounded-full flex-shrink-0">
                Acceso auditado
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center mb-4">
              <div className="bg-gray-50 rounded-xl py-3">
                <p className="text-xs text-gray-400">Matrícula</p>
                <p className="font-semibold text-gray-900 text-sm break-all">{data.perfil_medico?.matricula ?? "—"}</p>
              </div>
              <div className="bg-gray-50 rounded-xl py-3">
                <p className="text-xs text-gray-400">Especialidad</p>
                <p className="font-semibold text-gray-900 text-sm">{data.perfil_medico?.especialidad ?? "—"}</p>
              </div>
              <div className="bg-gray-50 rounded-xl py-3">
                <p className="text-xs text-gray-400">Contacto</p>
                <p className="font-semibold text-gray-900 text-sm">{data.perfil_medico?.telefono_contacto ?? "—"}</p>
              </div>
            </div>
            <Link
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
              href="/medico/escanear"
            >
              <Stethoscope size={15} /> Ir a mi panel médico (escanear QR)
            </Link>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm mb-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <User className="text-blue-600" size={18} />
            </div>
            <div className="flex-1">
              <h2 className="font-bold text-gray-900">{perfil?.alias ?? "Cargando..."}</h2>
              <p className="text-sm text-gray-500">
                {perfil?.nombre_completo ?? "Nombre no cargado"} · {perfil?.genero ?? "—"} · {perfil?.grupo_sanguineo ?? "Grupo s/n"}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            {[
              { label: "Altura", value: perfil?.altura_cm ? `${perfil.altura_cm} cm` : "—" },
              { label: "Peso", value: perfil?.peso_kg ? `${perfil.peso_kg} kg` : "—" },
              { label: "Medicación", value: `${(perfil?.medicacion ?? []).length} items` },
              { label: "Contactos ICE", value: `${(perfil?.contactos_emergencia ?? []).length}` },
            ].map(({ label, value }) => (
              <div className="bg-gray-50 rounded-xl py-3" key={label}>
                <p className="text-xs text-gray-400">{label}</p>
                <p className="font-semibold text-gray-900 text-sm">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {condiciones.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm mb-5">
            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <AlertTriangle className="text-amber-600" size={15} /> Condiciones y alergias
            </h3>
            <div className="space-y-2">
              {condiciones.map((c, i) => (
                <div className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2 text-sm" key={i}>
                  <span className="font-semibold text-gray-900">{c.descripcion}</span>
                  <span className="text-xs text-gray-400 uppercase">{c.severidad}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm mb-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <QrCode className="text-blue-600" size={18} />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-gray-900">Tu código QR</h3>
              <p className="text-sm text-gray-500">Token revocable · Ley 25.326</p>
            </div>
            <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full", perfil?.qr_activo ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")}>
              {perfil?.qr_activo ? "Activo" : "Revocado"}
            </span>
          </div>
          {perfil?.slug_qr ? (
            <div className="bg-gray-50 rounded-xl px-4 py-3 mb-4">
              <p className="text-xs text-gray-400 mb-1">Slug público</p>
              <p className="font-mono text-sm text-gray-800">{perfil.slug_qr}</p>
            </div>
          ) : (
            <p className="text-sm text-gray-500 mb-4">Todavía no generaste tu QR.</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors" disabled={busy} onClick={handleRegenerate}>
              {busy ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />} Regenerar
            </button>
            <button className="flex items-center justify-center gap-2 border border-gray-200 hover:bg-gray-50 disabled:opacity-60 text-gray-700 text-sm font-semibold py-2.5 rounded-lg transition-colors" disabled={busy} onClick={handleDownload}>
              <Download size={14} /> Descargar
            </button>
            <button className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors" disabled={busy} onClick={handleRevoke}>
              <ShieldOff size={14} /> Revocar
            </button>
          </div>
        </div>

        {perfil && perfil.medicacion && perfil.medicacion.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm mb-5">
            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Pill className="text-blue-600" size={15} /> Medicación cifrada
            </h3>
            <div className="space-y-2">
              {perfil.medicacion.map((m, i) => (
                <div className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2 text-sm" key={`${m.nombre}-${i}`}>
                  <span className="font-semibold text-gray-900">{m.nombre}</span>
                  <span className="text-xs text-gray-400">{m.dosis} · {m.frecuencia}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <StudyManager />

        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm mb-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center">
              <Building2 className="text-violet-600" size={18} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Asociar obra social / institución</h3>
              <p className="text-sm text-gray-500">Vinculá tu perfil con tu cobertura médica</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              onChange={(e) => setInstitucionId(e.target.value)}
              placeholder="ID de la institución"
              type="text"
              value={institucionId}
            />
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              onChange={(e) => setObraSocial(e.target.value)}
              placeholder="Obra social (ej: OSDE)"
              type="text"
              value={obraSocial}
            />
          </div>
          <button className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors w-full sm:w-auto px-6" disabled={busy} onClick={handleAsociar}>
            Asociar institución
          </button>
        </div>
      </div>
    </div>
  );
}