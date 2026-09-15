"use client";

import type { Session } from "@supabase/supabase-js";

import {
  AlertTriangle,
  Activity,
  BookOpen,
  Check,
  ChevronLeft,
  Clock,
  Download,
  FileText,
  Heart,
  Loader2,
  Lock,
  LogOut,
  Phone,
  Pill,
  Shield,
  Stethoscope,
  User,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import type {
  CondicionMedica,
  ContactoEmergencia,
  EstudioConAcceso,
  Medicamento,
} from "@/lib/supabase/database";

import { LoginModal } from "@/components/auth/login-modal";
import { apiFetch } from "@/lib/api/client";
import { useSession } from "@/lib/auth/use-session";
import { cn } from "@/lib/utils";

type Tab = "resumen" | "medicacion" | "estudios";

interface PacienteClinico {
  id: string;
  alias: string;
  nombre_completo: string | null;
  fecha_nacimiento: string | null;
  genero: string | null;
  grupo_sanguineo: string | null;
  altura_cm: number | null;
  peso_kg: number | null;
  alergias: CondicionMedica[] | null;
  patologias: CondicionMedica[] | null;
  medicacion: Medicamento[] | null;
  notas_medicas: string | null;
  contactos_emergencia: ContactoEmergencia[] | null;
  creado_en: string;
}

function calcularEdad(fechaNacimiento: string | null): number | null {
  if (!fechaNacimiento) return null;
  const nacimiento = new Date(fechaNacimiento);
  if (Number.isNaN(nacimiento.getTime())) return null;
  const ahora = new Date();
  let edad = ahora.getFullYear() - nacimiento.getFullYear();
  const m = ahora.getMonth() - nacimiento.getMonth();
  if (m < 0 || (m === 0 && ahora.getDate() < nacimiento.getDate())) {
    edad -= 1;
  }
  return edad;
}

function formatearFecha(iso: string | null): string {
  if (!iso) return "—";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "—";
  return fecha.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatearBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ColorSev({ severidad }: { severidad: string }) {
  const color =
    severidad === "Crítico"
      ? "bg-red-100 text-red-800"
      : severidad === "Moderado"
        ? "bg-amber-100 text-amber-800"
        : severidad === "Leve"
          ? "bg-blue-100 text-blue-800"
          : "bg-gray-100 text-gray-700";
  return (
    <span className={cn("text-xs font-bold px-1.5 py-0.5 rounded", color)}>
      {severidad}
    </span>
  );
}

interface PanelProps {
  session: Session;
  slug: string;
}

function PanelPacienteClinico({ session, slug }: PanelProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("resumen");
  const [paciente, setPaciente] = useState<PacienteClinico | null>(null);
  const [estudios, setEstudios] = useState<EstudioConAcceso[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    let activo = true;

    apiFetch<PacienteClinico>(`/api/medico/paciente/${encodeURIComponent(slug)}`, session)
      .then((res) => {
        if (!activo) return;
        setPaciente(res);
        setShowToast(true);
        const t = setTimeout(() => setShowToast(false), 4000);
        return () => clearTimeout(t);
      })
      .catch((err) => {
        if (activo) {
          setError(err instanceof Error ? err.message : "No se pudo cargar el paciente.");
        }
      })
      .finally(() => {
        if (activo) setLoading(false);
      });

    apiFetch<{ estudios: EstudioConAcceso[] }>(
      `/api/medico/paciente/${encodeURIComponent(slug)}/estudios`,
      session,
    )
      .then((res) => {
        if (activo) setEstudios(res.estudios);
      })
      .catch(() => {
        if (activo) setEstudios([]);
      });

    return () => {
      activo = false;
    };
  }, [session, slug]);

  const tabs: { icon: ReactNode; key: Tab; label: string }[] = [
    { key: "resumen", label: "Resumen clínico", icon: <Activity size={13} /> },
    { key: "medicacion", label: "Medicación", icon: <Pill size={13} /> },
    { key: "estudios", label: "Estudios", icon: <FileText size={13} /> },
  ];

  const edad = calcularEdad(paciente?.fecha_nacimiento ?? null);
  const condiciones = [
    ...(paciente?.alergias ?? []).map((c) => ({ ...c, origen: "ALERGIA" })),
    ...(paciente?.patologias ?? []).map((c) => ({ ...c, origen: "ENFERMEDAD" })),
  ];

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "Inter, sans-serif" }}>
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex items-center gap-2 min-w-0">
            <Link className="text-gray-400 hover:text-gray-600" href="/medico/escanear">
              <ChevronLeft size={18} />
            </Link>
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "#2563EB" }}
            >
              <Stethoscope className="text-white" size={14} />
            </div>
            <span className="text-sm font-bold text-gray-900 truncate">
              Portal Médico · Paciente
            </span>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex items-center gap-1.5 border border-emerald-300 text-emerald-700 text-xs font-semibold px-3 py-1 rounded-full">
              <Shield size={11} /> Acceso auditado
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 pb-20">
        {loading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="animate-spin text-blue-600" size={28} />
          </div>
        )}

        {!loading && error && (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <AlertTriangle className="text-red-500" size={28} />
            </div>
            <h1 className="text-xl font-extrabold text-gray-900 mb-2">
              No se pudo acceder al historial
            </h1>
            <p className="text-gray-500 text-sm mb-6">{error}</p>
            <button
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
              onClick={() => router.push("/medico/escanear")}
            >
              <ChevronLeft size={14} /> Volver a escanear
            </button>
          </div>
        )}

        {!loading && !error && paciente && (
          <>
            <div
              className="rounded-2xl p-5 mt-4 mb-4 text-white"
              style={{ background: "#2563EB" }}
            >
              <p className="text-emerald-200/80 text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Lock size={10} /> Datos Nivel 3 — Solo personal certificado
              </p>
              <div className="flex items-start gap-3 mb-3">
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="text-white" size={22} />
                </div>
                <div className="min-w-0">
                  <h1 className="text-2xl font-extrabold text-white truncate">
                    {paciente.nombre_completo ?? paciente.alias}
                  </h1>
                  <p className="text-blue-200 text-xs truncate">
                    Alias público: {paciente.alias}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {paciente.genero && (
                      <span className="bg-white/15 text-white text-xs px-2 py-0.5 rounded-full">
                        {paciente.genero}
                      </span>
                    )}
                    {edad !== null && (
                      <span className="bg-white/15 text-white text-xs px-2 py-0.5 rounded-full">
                        {edad} años
                      </span>
                    )}
                    {(paciente.altura_cm || paciente.peso_kg) && (
                      <span className="bg-white/15 text-white text-xs px-2 py-0.5 rounded-full">
                        {[
                          paciente.altura_cm ? `${paciente.altura_cm}cm` : null,
                          paciente.peso_kg ? `${paciente.peso_kg}kg` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                    {paciente.grupo_sanguineo && (
                      <span className="bg-white text-blue-800 text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Heart className="fill-blue-800" size={9} />{" "}
                        {paciente.grupo_sanguineo}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 border-t border-white/20 pt-3">
                {[
                  { label: "Condiciones", value: condiciones.length.toString() },
                  { label: "Medicamentos", value: (paciente.medicacion?.length ?? 0).toString() },
                  { label: "Estudios", value: estudios.length.toString() },
                ].map(({ label, value }) => (
                  <div className="text-center" key={label}>
                    <p className="text-blue-200/70 text-xs">{label}</p>
                    <p className="text-white text-2xl font-extrabold">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
              <div className="flex border-b border-gray-100 overflow-x-auto">
                {tabs.map(({ key, label, icon }) => (
                  <button
                    className={cn(
                      "flex items-center gap-1.5 px-4 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-1 justify-center",
                      tab === key
                        ? "border-emerald-600 text-emerald-700"
                        : "border-transparent text-gray-500 hover:text-gray-700",
                    )}
                    key={key}
                    onClick={() => setTab(key)}
                  >
                    {icon} {label}
                  </button>
                ))}
              </div>

              <div className="p-5">
                {tab === "resumen" && (
                  <div className="space-y-5">
                    <div>
                      <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <AlertTriangle className="text-amber-600" size={15} />{" "}
                        Condiciones y alergias
                      </h3>
                      {condiciones.length > 0 ? (
                        <div className="space-y-2">
                          {condiciones.map((c, i) => (
                            <div
                              className={cn(
                                "border rounded-xl px-4 py-3",
                                c.severidad === "Crítico"
                                  ? "border-red-300 bg-red-50"
                                  : c.severidad === "Moderado"
                                    ? "border-amber-200 bg-amber-50"
                                    : "border-blue-200 bg-blue-50",
                              )}
                              key={`${c.tipo}-${c.descripcion}-${i}`}
                            >
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-xs font-bold text-gray-500 uppercase">
                                  {c.origen} · {c.tipo}
                                </span>
                                <ColorSev severidad={c.severidad} />
                              </div>
                              <p className="font-bold text-gray-900 text-sm">
                                {c.descripcion}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                          <p className="text-xs text-gray-500 font-semibold">
                            No se registraron alergias ni condiciones crónicas.
                          </p>
                        </div>
                      )}
                    </div>

                    {paciente.notas_medicas && (
                      <div>
                        <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                          <BookOpen className="text-gray-500" size={15} /> Notas
                          clínicas del paciente
                        </h3>
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                          <p className="text-xs text-amber-900 leading-relaxed">
                            {paciente.notas_medicas}
                          </p>
                        </div>
                      </div>
                    )}

                    {(paciente.contactos_emergencia ?? []).length > 0 && (
                      <div>
                        <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                          <Phone className="text-gray-500" size={15} /> Contactos
                          de emergencia
                        </h3>
                        <div className="space-y-2">
                          {paciente.contactos_emergencia?.map((c) => (
                            <div
                              className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0"
                              key={c.nombre}
                            >
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center">
                                  <Phone className="text-gray-500" size={13} />
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">
                                    {c.nombre}
                                  </p>
                                  <p className="text-xs text-gray-500">{c.relacion}</p>
                                </div>
                              </div>
                              {c.telefono && (
                                <a
                                  className="text-sm font-mono text-blue-600 hover:text-blue-700"
                                  href={`tel:${c.telefono.replace(/[^\d+]/g, "")}`}
                                >
                                  {c.telefono}
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-gray-400 border-t border-gray-100 pt-3 flex items-center gap-1.5">
                      <Clock size={11} /> Acceso registrado en auditoría · Perfil
                      creado el {formatearFecha(paciente.creado_en)}
                    </p>
                  </div>
                )}

                {tab === "medicacion" && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-gray-900">
                        Medicación actual ({(paciente.medicacion?.length ?? 0).toString()})
                      </h3>
                    </div>
                    {paciente.medicacion && paciente.medicacion.length > 0 ? (
                      <div className="space-y-3">
                        {paciente.medicacion.map((m, i) => (
                          <div
                            className="border border-gray-100 rounded-xl p-4"
                            key={`${m.nombre}-${i}`}
                          >
                            <div className="flex items-start justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                                  <Pill className="text-blue-600" size={14} />
                                </div>
                                <p className="font-bold text-gray-900">{m.nombre}</p>
                              </div>
                              <span className="text-xs text-gray-400 font-mono">
                                #{String(i + 1).padStart(2, "0")}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 ml-10">
                              Dosis:{" "}
                              <span className="text-gray-700 font-medium">{m.dosis}</span>
                              {"  "}·{"  "}Frecuencia:{" "}
                              <span className="text-gray-700 font-medium">{m.frecuencia}</span>
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                        <p className="text-xs text-gray-500 font-semibold">
                          No se registraron medicamentos actuales.
                        </p>
                      </div>
                    )}
                    <div className="mt-4 bg-blue-50 border border-blue-100 rounded-xl p-4">
                      <p className="text-xs font-bold text-blue-800 mb-1">
                        Nota para el profesional
                      </p>
                      <p className="text-xs text-blue-700 leading-relaxed">
                        Esta información fue provista por el paciente y no ha sido
                        validada clínicamente por AyudAPI. Verificar siempre con el
                        paciente o su médico de cabecera ante dudas.
                      </p>
                    </div>
                  </div>
                )}

                {tab === "estudios" && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-gray-900">
                        Estudios médicos ({estudios.length.toString()})
                      </h3>
                      <span className="text-xs text-gray-400">
                        Ordenados por fecha (más reciente primero)
                      </span>
                    </div>
                    {estudios.length > 0 ? (
                      <div className="space-y-2">
                        {estudios.map((e) => (
                          <div
                            className="flex items-center justify-between border border-gray-100 rounded-xl px-4 py-3.5 hover:bg-gray-50 transition-colors"
                            key={e.id}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                                <FileText className="text-blue-500" size={14} />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center flex-wrap gap-1.5">
                                  <p className="text-sm font-semibold text-gray-900 truncate">
                                    {e.descripcion ?? e.nombre_archivo}
                                  </p>
                                  <span className="text-[10px] font-bold uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                    {e.tipo}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-400 truncate">
                                  {formatearFecha(e.creado_en)} ·{" "}
                                  {formatearBytes(e.tamano_bytes)} · {e.nombre_archivo}
                                </p>
                              </div>
                            </div>
                            {e.url_acceso && (
                              <a
                                className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap"
                                href={e.url_acceso}
                                rel="noopener noreferrer"
                                target="_blank"
                              >
                                <Download size={12} /> Ver estudio
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                        <p className="text-xs text-gray-500 font-semibold">
                          No se registraron estudios médicos para este paciente.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end mt-4">
              <Link
                className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
                href="/medico/escanear"
              >
                <LogOut size={14} /> Nueva búsqueda
              </Link>
            </div>
          </>
        )}
      </div>

      {showToast && paciente && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-emerald-800 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-xs font-medium z-50 whitespace-nowrap">
          <Check className="text-emerald-300" size={13} />
          Acceso auditado registrado
          <span className="text-emerald-300/70 flex items-center gap-1">
            <Clock size={11} /> {new Date().toLocaleString("es-AR")}
          </span>
        </div>
      )}
    </div>
  );
}

export default function MedicoPacientePage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const { loading: loadingSession, session } = useSession();
  const [showLogin, setShowLogin] = useState(false);

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
            Iniciá sesión con tu cuenta de médico para acceder al historial clínico.
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

  return <PanelPacienteClinico key={slug} session={session} slug={slug} />;
}