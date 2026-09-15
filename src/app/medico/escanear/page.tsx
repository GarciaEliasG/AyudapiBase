"use client";

import type { Session } from "@supabase/supabase-js";

import {
  AlertTriangle,
  ArrowRight,
  Camera,
  Check,
  ChevronLeft,
  Clock,
  Heart,
  History,
  Loader2,
  Lock,
  LogOut,
  Search,
  Shield,
  Stethoscope,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { PerfilMedicoRow } from "@/lib/supabase/database";

import { LoginModal } from "@/components/auth/login-modal";
import { CameraScanner } from "@/components/medico/camera-scanner";
import { apiFetch } from "@/lib/api/client";
import { useSession } from "@/lib/auth/use-session";
import { createBrowserClient } from "@/lib/supabase/browser";

interface VerificarQrResponse {
  paciente_id: string;
  alias: string;
  nombre_completo: string | null;
  grupo_sanguineo: string | null;
  qr_activo: boolean;
  med_access: boolean;
}

interface EscaneoReciente {
  creado_en: string;
  paciente_id: string;
  alias: string;
  nombre_completo: string | null;
  grupo_sanguineo: string | null;
  slug: string | null;
  disponible: boolean;
}

interface PerfilMedicoResponse {
  email: string | null;
  perfil: PerfilMedicoRow;
}

const CAMARA_ID = "camara-escaner-medico";

function extraerSlugCodigo(texto: string): string {
  const ultimoSegmento = texto.trim().split("/").pop() ?? "";
  return ultimoSegmento.replace(/[^A-Za-z0-9_-]/g, "");
}

function formatearEscaneo(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "—";
  return fecha.toLocaleString("es-AR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });
}

async function consultarEscaneos(session: Session): Promise<{ escaneos: EscaneoReciente[] }> {
  return apiFetch<{ escaneos: EscaneoReciente[] }>(
    "/api/medico/escaneos",
    session,
  );
}

function EscaneoFila({
  escaneo,
  onAbrir,
}: {
  escaneo: EscaneoReciente;
  onAbrir: (slug: string) => void;
}) {
  const { alias, creado_en, disponible, grupo_sanguineo, nombre_completo, slug } =
    escaneo;
  const contenido = (
    <>
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
          <Clock className="text-gray-500" size={15} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate">
            {nombre_completo ?? alias}
          </p>
          <p className="text-xs text-gray-500">{formatearEscaneo(creado_en)}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {grupo_sanguineo && (
          <span className="flex items-center gap-1 bg-red-50 border border-red-200 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">
            <Heart className="fill-red-700" size={9} /> {grupo_sanguineo}
          </span>
        )}
        {disponible ? (
          <span className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
            <Check size={9} /> QR activo
          </span>
        ) : (
          <span className="flex items-center gap-1 bg-gray-100 text-gray-400 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
            No accesible
          </span>
        )}
      </div>
    </>
  );

  if (disponible && slug) {
    return (
      <button
        className="w-full flex items-center justify-between gap-3 border border-gray-100 hover:bg-gray-50 rounded-xl px-4 py-3.5 transition-colors text-left"
        onClick={() => onAbrir(slug)}
      >
        {contenido}
        <ArrowRight className="text-gray-400 flex-shrink-0" size={15} />
      </button>
    );
  }

  return <div className="opacity-80">{contenido}</div>;
}

export default function MedicoEscanearPage() {
  const router = useRouter();
  const { loading: loadingSession, session } = useSession();
  const [medico, setMedico] = useState<PerfilMedicoResponse | null>(null);
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<VerificarQrResponse | null>(null);
  const [scanning, setScanning] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  const [escaneos, setEscaneos] = useState<EscaneoReciente[]>([]);
  const [cargandoEscaneos, setCargandoEscaneos] = useState(true);
  const [errorEscaneos, setErrorEscaneos] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let active = true;
    apiFetch<PerfilMedicoResponse>("/api/medico/me", session)
      .then((res) => {
        if (active) setMedico(res);
      })
      .catch(() => {
        if (active) setMedico(null);
      });
    return () => {
      active = false;
    };
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let activo = true;
    consultarEscaneos(session)
      .then((res) => {
        if (activo) {
          setEscaneos(res.escaneos);
          setErrorEscaneos(null);
        }
      })
      .catch((err) => {
        if (activo) {
          setErrorEscaneos(
            err instanceof Error ? err.message : "No se pudo cargar el historial.",
          );
        }
      })
      .finally(() => {
        if (activo) setCargandoEscaneos(false);
      });
    return () => {
      activo = false;
    };
  }, [session]);

  async function verificar(valorRaw?: string) {
    const codigo = extraerSlugCodigo(valorRaw ?? slug);
    if (!codigo) {
      setError("Ingresá el código QR del paciente.");
      return;
    }
    setBusy(true);
    setError(null);
    setResultado(null);
    try {
      const res = await apiFetch<VerificarQrResponse>(
        `/api/medico/verificar-qr?slug=${encodeURIComponent(codigo)}`,
        session,
      );
      setSlug(codigo);
      setResultado(res);
      if (session) {
        void consultarEscaneos(session)
          .then(({ escaneos }) => setEscaneos(escaneos))
          .catch(() => undefined);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo verificar el código QR.",
      );
    } finally {
      setBusy(false);
    }
  }

  function manejarDeteccion(texto: string) {
    setScanning(false);
    void verificar(texto);
  }

  async function cerrarSesion() {
    await createBrowserClient().auth.signOut();
    router.push("/");
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
        <div className="max-w-md mx-auto px-4 py-24 text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Lock className="text-blue-600" size={28} />
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 mb-2">
            Sesión requerida
          </h1>
          <p className="text-gray-500 text-sm mb-6">
            Iniciá sesión con tu cuenta de médico para acceder al panel.
          </p>
          <button
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
            onClick={() => setShowLogin(true)}
          >
            Iniciar sesión
          </button>
        </div>
        {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "Inter, sans-serif" }}>
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex items-center gap-2 min-w-0">
            <Link className="text-gray-400 hover:text-gray-600" href="/">
              <ChevronLeft size={18} />
            </Link>
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "#2563EB" }}
            >
              <Stethoscope className="text-white" size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 leading-none truncate">
                Portal Médico
              </p>
              <p className="text-xs text-gray-400 truncate">
                {medico?.perfil.especialidad ?? "Panel de atención"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold px-3 py-1 rounded-full">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
              Sesión activa
            </div>
            <button
              aria-label="Cerrar sesión"
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
              onClick={() => void cerrarSesion()}
            >
              <LogOut size={13} /> Salir
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0">
              <Stethoscope className="text-blue-600" size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">
                {medico?.email ?? "Cargando perfil médico..."}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {medico
                  ? `Matrícula ${medico.perfil.matricula}${
                      medico.perfil.especialidad
                        ? ` · ${medico.perfil.especialidad}`
                        : ""
                    }`
                  : "Verificando matrícula..."}
              </p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 border border-emerald-300 text-emerald-700 text-xs font-semibold px-3 py-1 rounded-full flex-shrink-0">
            <Shield size={11} /> Acceso auditado
          </span>
        </div>

        <section className="rounded-2xl text-white p-5 mb-6" style={{ background: "#2563EB" }}>
          <div className="text-center mb-4">
            <div className="w-16 h-16 bg-white/15 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Camera className="text-white" size={28} />
            </div>
            <h1 className="text-2xl font-extrabold mb-1">Escanear código QR</h1>
            <p className="text-blue-200 text-sm max-w-md mx-auto">
              Escaneá el QR del paciente con la cámara o ingresá su slug para
              acceder de inmediato a su historial clínico.
            </p>
          </div>

          <div className="max-w-lg mx-auto">
            {!scanning && (
              <button
                className="w-full flex items-center justify-center gap-2 bg-white text-blue-700 font-bold py-3 rounded-xl transition-colors text-sm mb-3"
                onClick={() => {
                  setScanning(true);
                  setError(null);
                }}
              >
                <Camera size={16} /> Escanear con cámara
              </button>
            )}

            {scanning && (
              <div className="mb-3">
                <CameraScanner
                  containerId={CAMARA_ID}
                  onDetected={manejarDeteccion}
                  onError={(mensaje) =>
                    setError(`Cámara no disponible: ${mensaje}`)
                  }
                />
                <button
                  className="w-full flex items-center justify-center gap-2 bg-white/15 border border-white/30 hover:bg-white/25 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm mt-3"
                  onClick={() => setScanning(false)}
                >
                  <X size={14} /> Detener cámara
                </button>
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className="text-blue-200 text-xs font-semibold uppercase tracking-wider flex-shrink-0">
                o slug
              </span>
              <div className="h-px bg-white/20 flex-1" />
            </div>

            <div className="flex gap-2 mt-3">
              <input
                className="flex-1 border border-white/20 rounded-xl px-4 py-3 text-sm bg-white/10 text-white placeholder:text-blue-200 focus:outline-none focus:ring-2 focus:ring-white/60 font-mono"
                onChange={(e) => {
                  setSlug(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && verificar()}
                placeholder="Slug del QR · Ej: abc123xyz"
                type="text"
                value={slug}
              />
              <button
                className="flex items-center gap-2 bg-white text-blue-700 font-bold px-5 py-3 rounded-xl transition-colors text-sm disabled:opacity-60"
                disabled={busy}
                onClick={() => verificar()}
              >
                {busy ? (
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Search size={15} />
                )}
                Verificar
              </button>
            </div>
          </div>

          {error && (
            <div className="max-w-lg mx-auto mt-4 bg-white/10 border border-white/20 rounded-xl px-4 py-3 flex items-start gap-2">
              <X className="text-white flex-shrink-0 mt-0.5" size={14} />
              <p className="text-sm text-white">{error}</p>
            </div>
          )}

          {resultado && (
            <div className="max-w-lg mx-auto mt-4">
              <div className="bg-white text-gray-900 rounded-2xl overflow-hidden">
                <div className="bg-emerald-500 px-5 py-3 flex items-center gap-2">
                  <Check className="text-white" size={14} />
                  <span className="text-sm font-bold text-white">
                    Código QR verificado
                  </span>
                </div>
                <div className="p-5">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0">
                      <Stethoscope className="text-blue-600" size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-lg font-extrabold truncate">
                        {resultado.alias}
                      </h2>
                      {resultado.nombre_completo && (
                        <p className="text-sm text-gray-500 truncate">
                          {resultado.nombre_completo}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-5">
                    {resultado.grupo_sanguineo && (
                      <span className="flex items-center gap-1 bg-red-50 border border-red-200 text-red-700 text-xs font-bold px-2.5 py-1 rounded-full">
                        <Heart className="fill-red-700" size={10} />{" "}
                        {resultado.grupo_sanguineo}
                      </span>
                    )}
                    <span className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-full">
                      <Shield size={10} /> Acceso auditado
                    </span>
                  </div>
                  <button
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors text-sm"
                    onClick={() =>
                      router.push(
                        `/medico/paciente/${encodeURIComponent(slug.trim())}`,
                      )
                    }
                  >
                    <ArrowRight size={15} /> Ver historial clínico completo
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
          <div className="border-b border-gray-100 px-5 py-4 flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <History className="text-emerald-600" size={16} />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">Historial de Escaneos Recientes</h2>
              <p className="text-xs text-gray-500">
                Últimos QR verificados con tu cuenta
              </p>
            </div>
          </div>

          <div className="p-5">
            {cargandoEscaneos && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="animate-spin text-blue-600" size={20} />
              </div>
            )}

            {!cargandoEscaneos && errorEscaneos && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
                <X className="text-red-500 flex-shrink-0 mt-0.5" size={14} />
                <p className="text-sm text-red-700">{errorEscaneos}</p>
              </div>
            )}

            {!cargandoEscaneos && !errorEscaneos && escaneos.length === 0 && (
              <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl px-4 py-6 text-center">
                <History className="text-gray-400 mx-auto mb-2" size={20} />
                <p className="text-sm text-gray-500 font-medium">
                  Todavía no escaneaste ningún QR.
                </p>
                <p className="text-xs text-gray-400">
                  Verificá un código para que quede registrado acá.
                </p>
              </div>
            )}

            {escaneos.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 font-semibold">
                  {escaneos.length.toString()} registro
                  {escaneos.length === 1 ? "" : "s"} · Solo pacientes con QR
                  activo y acceso médico habilitado se pueden reabrir
                </p>
                {escaneos.map((e) => (
                  <EscaneoFila
                    escaneo={e}
                    key={`${e.paciente_id}-${e.creado_en}`}
                    onAbrir={(valor) =>
                      router.push(`/medico/paciente/${encodeURIComponent(valor)}`)
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={16} />
            <div>
              <p className="font-bold text-amber-800 text-sm mb-1">
                Acceso auditado y registrado
              </p>
              <p className="text-xs text-amber-700/80 leading-relaxed">
                Cada consulta y escaneo queda registrado con tu matrícula, fecha
                y hora. El acceso a datos sensibles está sujeto al consentimiento
                del paciente y al marco legal vigente. Ley 25.326.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}