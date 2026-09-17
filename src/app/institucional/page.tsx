"use client";

import type { Session } from "@supabase/supabase-js";

import {
  Activity,
  AlertTriangle,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  FileText,
  HeartPulse,
  History,
  LayoutDashboard,
  Loader2,
  Lock,
  MapPin,
  QrCode,
  RefreshCw,
  Shield,
  ShieldCheck,
  Siren,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { LoginModal } from "@/components/auth/login-modal";
import { Navbar } from "@/components/layout/navbar";
import { apiFetch } from "@/lib/api/client";
import { useRol } from "@/lib/auth/use-rol";
import { cn } from "@/lib/utils";

type Periodo = "12m" | "6m" | "1m";
type Seccion = "auditoria" | "condiciones" | "incidentes" | "resumen" | "zonas";

interface ResumenMetricas {
  atenciones: number;
  en_curso: number;
  escaneos: number;
  incidentes: number;
  registros_medicos: number;
  resueltos: number;
}

interface EstadoMetrica {
  cantidad: number;
  estado: string;
}

interface ZonaMetrica {
  atenciones: number;
  escaneos: number;
  incidentes: number;
  lat: number;
  lng: number;
  zona: string;
}

interface PatologiaMetrica {
  atenciones: number;
  incidentes: number;
  patologia: string;
}

interface MetricasResponse {
  desde: string;
  periodo: Periodo;
  por_estado: EstadoMetrica[];
  por_patologia: PatologiaMetrica[];
  por_zona: ZonaMetrica[];
  resumen: ResumenMetricas;
}

interface ClusterHeatmap {
  cantidad: number;
  lat: number;
  lng: number;
  zona: string;
}

interface HeatmapResponse {
  clusters: ClusterHeatmap[];
  desde: string;
  periodo: Periodo;
}

interface LogAuditoria {
  accion: string;
  creado_en: string;
  detalles: unknown | null;
  direccion_ip: string | null;
  id: string;
  institucion_id: string | null;
  operador: string | null;
  paciente: string | null;
}

interface LogsResponse {
  logs: LogAuditoria[];
  page: number;
  pageSize: number;
  total: number;
  totalPaginas: number;
}

const PERIODOS: Periodo[] = ["12m", "6m", "1m"];

const ETIQUETAS_PERIODO = new Map<Periodo, string>([
  ["12m", "12 meses"],
  ["6m", "6 meses"],
  ["1m", "1 mes"],
]);

const ETIQUETA_ACCION = new Map<string, string>([
  ["consulta_auditoria", "Consulta de auditoría"],
  ["consulta_dashboard", "Consulta de dashboard"],
  ["verificar_qr", "Verificación de QR"],
]);

const ETIQUETA_ESTADO = new Map<string, string>([
  ["cancelado", "Cancelado"],
  ["en_curso", "En curso"],
  ["enviado", "Enviado"],
  ["resuelto", "Resuelto"],
]);

function formatearNumero(valor: number): string {
  return valor.toLocaleString("es-AR");
}

function formatearFecha(iso: string | null | undefined): string {
  if (!iso) {
    return "—";
  }
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) {
    return "—";
  }
  return fecha.toLocaleString("es-AR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function colorAccion(accion: string): string {
  if (accion === "consulta_dashboard") {
    return "bg-violet-50 text-violet-700 border-violet-200";
  }
  if (accion === "consulta_auditoria") {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }
  if (accion === "verificar_qr") {
    return "bg-rose-50 text-rose-700 border-rose-200";
  }
  return "bg-gray-50 text-gray-600 border-gray-200";
}

interface StatCardProps {
  icon: ReactNode;
  label: string;
  tint: string;
  value: number;
}

function StatCard({ icon, label, tint, value }: StatCardProps) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center mb-3", tint)}>
        {icon}
      </div>
      <p className="text-2xl font-extrabold text-gray-900 leading-none mb-1">
        {formatearNumero(value)}
      </p>
      <p className="text-xs text-gray-500 font-medium">{label}</p>
    </div>
  );
}

interface BarraRankingProps {
  className: string;
  detalle?: string;
  label: string;
  max: number;
  suffix?: string;
  value: number;
}

function BarraRanking({ className, detalle, label, max, suffix, value }: BarraRankingProps) {
  const porcentaje = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-sm font-semibold text-gray-800 truncate">{label}</span>
        <span className="text-xs font-bold text-gray-500 flex-shrink-0">
          {formatearNumero(value)}
          {suffix ?? ""}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", className)}
          style={{ width: `${porcentaje}%` }}
        />
      </div>
      {detalle && <p className="text-xs text-gray-400 mt-1">{detalle}</p>}
    </div>
  );
}

function TarjetaInformativa({
  icon,
  mensaje,
  titulo,
}: {
  icon: ReactNode;
  mensaje: string;
  titulo: string;
}) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-3">
      <span className="text-amber-600 flex-shrink-0 mt-0.5">{icon}</span>
      <div>
        <p className="font-bold text-amber-800 text-sm mb-1">{titulo}</p>
        <p className="text-xs text-amber-700/80 leading-relaxed">{mensaje}</p>
      </div>
    </div>
  );
}

interface PanelProps {
  session: Session;
}

function PanelInstitucional({ session }: PanelProps) {
  const [seccion, setSeccion] = useState<Seccion>("resumen");
  const [periodo, setPeriodo] = useState<Periodo>("12m");
  const [intentoMetricas, setIntentoMetricas] = useState(0);

  const [metricas, setMetricas] = useState<MetricasResponse | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapResponse | null>(null);
  const [cargandoMetricas, setCargandoMetricas] = useState(true);
  const [errorMetricas, setErrorMetricas] = useState<string | null>(null);

  const [logs, setLogs] = useState<LogsResponse | null>(null);
  const [cargandoLogs, setCargandoLogs] = useState(false);
  const [errorLogs, setErrorLogs] = useState<string | null>(null);
  const [paginaLogs, setPaginaLogs] = useState(1);
  const [filtroAccion, setFiltroAccion] = useState("");
  const [intentoLogs, setIntentoLogs] = useState(0);

  useEffect(() => {
    let activo = true;

    const query = `?periodo=${periodo}`;
    Promise.all([
      apiFetch<MetricasResponse>(
        `/api/institucion/dashboard/metricas${query}`,
        session,
      ),
      apiFetch<HeatmapResponse>(`/api/institucion/dashboard/heatmap${query}`, session),
    ])
      .then(([m, h]) => {
        if (!activo) {
          return;
        }
        setMetricas(m);
        setHeatmap(h);
      })
      .catch((err) => {
        if (activo) {
          setErrorMetricas(
            err instanceof Error
              ? err.message
              : "No se pudieron cargar las métricas del panel.",
          );
        }
      })
      .finally(() => {
        if (activo) {
          setCargandoMetricas(false);
        }
      });

    return () => {
      activo = false;
    };
  }, [intentoMetricas, periodo, session]);

  useEffect(() => {
    if (seccion !== "auditoria") {
      return;
    }
    let activo = true;

    const params = new URLSearchParams({
      page: paginaLogs.toString(),
      pageSize: "20",
    });
    if (filtroAccion) {
      params.set("accion", filtroAccion);
    }

    apiFetch<LogsResponse>(`/api/audit/logs?${params.toString()}`, session)
      .then((res) => {
        if (activo) {
          setLogs(res);
        }
      })
      .catch((err) => {
        if (activo) {
          setErrorLogs(
            err instanceof Error
              ? err.message
              : "No se pudo cargar la auditoría de accesos.",
          );
        }
      })
      .finally(() => {
        if (activo) {
          setCargandoLogs(false);
        }
      });

    return () => {
      activo = false;
    };
  }, [filtroAccion, intentoLogs, paginaLogs, seccion, session]);

  const secciones: { icon: ReactNode; key: Seccion; label: string }[] = [
    { key: "resumen", label: "Resumen general", icon: <LayoutDashboard size={15} /> },
    { key: "incidentes", label: "Incidentes", icon: <Siren size={15} /> },
    { key: "zonas", label: "Zonas de cobertura", icon: <MapPin size={15} /> },
    { key: "condiciones", label: "Condiciones frecuentes", icon: <HeartPulse size={15} /> },
    { key: "auditoria", label: "Auditoría de accesos", icon: <ShieldCheck size={15} /> },
  ];

  const resumen = metricas?.resumen;
  const porEstado = metricas?.por_estado ?? [];
  const porZona = metricas?.por_zona ?? [];
  const porPatologia = metricas?.por_patologia ?? [];
  const clusters = heatmap?.clusters ?? [];

  const maxIncidentesEstado = Math.max(0, ...porEstado.map((e) => e.cantidad));
  const maxIncidentesZona = Math.max(0, ...porZona.map((z) => z.incidentes));
  const maxIncidentesPatologia = Math.max(
    0,
    ...porPatologia.map((p) => p.incidentes),
  );
  const maxAtendidosPatologia = Math.max(0, ...porPatologia.map((p) => p.atenciones));
  const maxCluster = Math.max(0, ...clusters.map((c) => c.cantidad));

  const totalZo = porZona.reduce((acc, z) => acc + z.atenciones, 0);

  function cambiarSeccion(key: Seccion) {
    setSeccion(key);
    if (key === "auditoria") {
      setCargandoLogs(true);
      setErrorLogs(null);
    }
  }

  function recargarMetricas() {
    setCargandoMetricas(true);
    setErrorMetricas(null);
    setIntentoMetricas((v) => v + 1);
  }

  function recargarLogs() {
    setCargandoLogs(true);
    setErrorLogs(null);
    setIntentoLogs((v) => v + 1);
  }

  function renderContenidoCargando() {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-violet-600" size={28} />
      </div>
    );
  }

  function renderErrorMetricas() {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-start gap-3">
        <X className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-red-800 text-sm mb-1">No se pudieron cargar las métricas</p>
          <p className="text-xs text-red-700 leading-relaxed">{errorMetricas}</p>
          <button
            className="mt-3 inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
            onClick={() => recargarMetricas()}
          >
            <RefreshCw size={12} /> Reintentar
          </button>
        </div>
      </div>
    );
  }

  function renderVacio({ icon, mensaje, titulo }: { icon: ReactNode; mensaje: string; titulo: string }) {
    return (
      <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl px-4 py-10 text-center">
        <div className="mx-auto mb-2 text-gray-400 w-8 h-8">{icon}</div>
        <p className="text-sm text-gray-500 font-medium mb-1">{titulo}</p>
        <p className="text-xs text-gray-400">{mensaje}</p>
      </div>
    );
  }

  function renderResumen() {
    if (cargandoMetricas && !metricas) {
      return renderContenidoCargando();
    }
    if (errorMetricas && !metricas) {
      return renderErrorMetricas();
    }
    if (!metricas) {
      return renderVacio({
        icon: <BarChart3 size={30} />,
        mensaje: "Seleccioná un período para ver la evolución del sistema.",
        titulo: "Sin métricas para mostrar",
      });
    }
    const stats: StatCardProps[] = [
      {
        icon: <Siren size={16} />,
        label: "Incidentes",
        tint: "bg-rose-50 text-rose-600",
        value: resumen?.incidentes ?? 0,
      },
      {
        icon: <QrCode size={16} />,
        label: "Escaneos QR",
        tint: "bg-blue-50 text-blue-600",
        value: resumen?.escaneos ?? 0,
      },
      {
        icon: <Users size={16} />,
        label: "Atenciones",
        tint: "bg-emerald-50 text-emerald-600",
        value: resumen?.atenciones ?? 0,
      },
      {
        icon: <FileText size={16} />,
        label: "Registros médicos",
        tint: "bg-violet-50 text-violet-600",
        value: resumen?.registros_medicos ?? 0,
      },
      {
        icon: <ShieldCheck size={16} />,
        label: "Resueltos",
        tint: "bg-teal-50 text-teal-600",
        value: resumen?.resueltos ?? 0,
      },
      {
        icon: <AlertTriangle size={16} />,
        label: "En curso",
        tint: "bg-amber-50 text-amber-600",
        value: resumen?.en_curso ?? 0,
      },
    ];

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {stats.map((s) => (
            <StatCard key={s.label} {...s} />
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Activity className="text-violet-600" size={15} /> Estado de incidentes
            </h3>
            {porEstado.length > 0 ? (
              <div className="space-y-4">
                {porEstado.map((e) => (
                  <BarraRanking
                    className="bg-violet-500"
                    key={e.estado}
                    label={e.estado.replace("_", " ")}
                    max={maxIncidentesEstado}
                    value={e.cantidad}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">Sin incidentes en el período.</p>
            )}
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <MapPin className="text-violet-600" size={15} /> Top zonas con actividad
            </h3>
            {porZona.length > 0 ? (
              <div className="space-y-4">
                {porZona.slice(0, 5).map((z) => (
                  <BarraRanking
                    className="bg-emerald-500"
                    detalle={`Atenciones: ${formatearNumero(z.atenciones)} · Escaneos: ${formatearNumero(z.escaneos)}`}
                    key={z.zona}
                    label={`Zona ${z.zona}`}
                    max={maxIncidentesZona}
                    value={z.incidentes}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">Sin zonas con actividad en el período.</p>
            )}
          </div>
        </div>

        <TarjetaInformativa
          icon={<Lock size={15} />}
          mensaje="Este panel trabaja con agregados por celda de zona y condición médica. Nunca se exponen el nombre, alias ni el punto exacto de un paciente individual. Cada consulta queda registrada en la auditoría de accesos."
          titulo="Datos anonimizados por diseño"
        />
      </div>
    );
  }

  function renderIncidentes() {
    if (cargandoMetricas && !metricas) {
      return renderContenidoCargando();
    }
    if (errorMetricas && !metricas) {
      return renderErrorMetricas();
    }
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard
            icon={<Siren size={16} />}
            label="Total incidentes"
            tint="bg-rose-50 text-rose-600"
            value={resumen?.incidentes ?? 0}
          />
          <StatCard
            icon={<ShieldCheck size={16} />}
            label="Resueltos"
            tint="bg-teal-50 text-teal-600"
            value={resumen?.resueltos ?? 0}
          />
          <StatCard
            icon={<AlertTriangle size={16} />}
            label="En curso"
            tint="bg-amber-50 text-amber-600"
            value={resumen?.en_curso ?? 0}
          />
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-4">Distribución por estado</h3>
          {porEstado.length > 0 ? (
            <div className="space-y-4">
              {porEstado.map((e) => (
                <BarraRanking
                  className="bg-rose-500"
                  key={e.estado}
                  label={ETIQUETA_ESTADO.get(e.estado) ?? e.estado.replace("_", " ")}
                  max={maxIncidentesEstado}
                  value={e.cantidad}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">Sin incidentes en el período seleccionado.</p>
          )}
        </div>

        {porZona.length > 0 && (
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-4">Incidentes por zona</h3>
            <div className="space-y-4">
              {porZona.map((z) => (
                <BarraRanking
                  className="bg-violet-500"
                  key={z.zona}
                  label={`Zona ${z.zona}`}
                  max={maxIncidentesZona}
                  value={z.incidentes}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderZonas() {
    if (cargandoMetricas && !metricas) {
      return renderContenidoCargando();
    }
    if (errorMetricas && !metricas) {
      return renderErrorMetricas();
    }
    return (
      <div className="space-y-6">
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-1">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <MapPin className="text-violet-600" size={15} /> Mapa de calor de incidentes
            </h3>
            <span className="text-xs text-gray-400">
              {clusters.length.toString()} celdas activas
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Clusters agregados por celda de grilla (centro geográfico aproximado).
            Son celdas de cobertura, no coordenadas de pacientes puntuales.
          </p>
          {clusters.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {clusters.map((c) => {
                const ratio = maxCluster > 0 ? c.cantidad / maxCluster : 0;
                const className =
                  ratio > 0.7
                    ? "bg-rose-100 text-rose-800 border-rose-200"
                    : ratio > 0.4
                      ? "bg-orange-100 text-orange-800 border-orange-200"
                      : ratio > 0.15
                        ? "bg-amber-50 text-amber-800 border-amber-200"
                        : "bg-gray-50 text-gray-600 border-gray-200";
                return (
                  <div
                    className={cn("border rounded-xl px-3 py-2.5 text-center", className)}
                    key={c.zona}
                  >
                    <p className="text-xl font-extrabold leading-none mb-1">
                      {formatearNumero(c.cantidad)}
                    </p>
                    <p className="text-[10px] font-semibold uppercase tracking-wide truncate">
                      Zona {c.zona}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            renderVacio({
              icon: <MapPin size={30} />,
              mensaje: "No hay incidentes con geo-referencia en el período.",
              titulo: "Sin clusters para mostrar",
            })
          )}
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="font-bold text-gray-900">Actividad por zona de cobertura</h3>
            <span className="text-xs text-gray-400">
              {(totalZo + porZona.reduce((acc, z) => acc + z.escaneos, 0) + porZona.reduce((acc, z) => acc + z.incidentes, 0)).toString()} eventos georreferenciados
            </span>
          </div>
          {porZona.length > 0 ? (
            <div className="space-y-3">
              {porZona.map((z) => (
                <div
                  className="border border-gray-100 rounded-xl p-4"
                  key={z.zona}
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <p className="font-semibold text-gray-900 text-sm">Zona {z.zona}</p>
                    <p className="text-[10px] font-mono text-gray-400">
                      {z.lat.toFixed(2)}, {z.lng.toFixed(2)} (celda)
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-lg font-extrabold text-gray-900">
                        {formatearNumero(z.incidentes)}
                      </p>
                      <p className="text-[10px] text-gray-400 font-semibold uppercase">
                        Incidentes
                      </p>
                    </div>
                    <div>
                      <p className="text-lg font-extrabold text-gray-900">
                        {formatearNumero(z.escaneos)}
                      </p>
                      <p className="text-[10px] text-gray-400 font-semibold uppercase">
                        Escaneos
                      </p>
                    </div>
                    <div>
                      <p className="text-lg font-extrabold text-gray-900">
                        {formatearNumero(z.atenciones)}
                      </p>
                      <p className="text-[10px] text-gray-400 font-semibold uppercase">
                        Atenciones
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            renderVacio({
              icon: <MapPin size={30} />,
              mensaje: "Las zonas se construyen a partir de geo-referencias agregadas.",
              titulo: "Sin zonas de cobertura",
            })
          )}
        </div>

        <TarjetaInformativa
          icon={<MapPin size={15} />}
          mensaje="Cada celda representa un área aproximada de 50 × 50 km. Las coordenadas mostradas son el centro de la celda, nunca la ubicación exacta de un paciente."
          titulo="Geo-privacidad"
        />
      </div>
    );
  }

  function renderCondiciones() {
    if (cargandoMetricas && !metricas) {
      return renderContenidoCargando();
    }
    if (errorMetricas && !metricas) {
      return renderErrorMetricas();
    }
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={<HeartPulse size={16} />}
            label="Condiciones distintas"
            tint="bg-violet-50 text-violet-600"
            value={porPatologia.length}
          />
          <StatCard
            icon={<Users size={16} />}
            label="Atenciones por condición"
            tint="bg-emerald-50 text-emerald-600"
            value={porPatologia.reduce((acc, p) => acc + p.atenciones, 0)}
          />
        </div>

        {porPatologia.length > 0 ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-1">Condiciones frecuentes</h3>
            <p className="text-xs text-gray-500 mb-4">
              Cada paciente puede registrar más de una condición; los conteos
              pueden superponerse entre condiciones.
            </p>
            <div className="space-y-5">
              {porPatologia.slice(0, 15).map((p, idx) => (
                <div key={p.patologia}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <span className="w-6 h-6 bg-violet-50 text-violet-700 rounded-lg flex items-center justify-center text-xs font-extrabold">
                        {idx + 1}
                      </span>
                      {p.patologia}
                    </p>
                    <p className="text-xs font-semibold text-gray-500">
                      {formatearNumero(p.incidentes)} incidentes
                    </p>
                  </div>
                  <BarraRanking
                    className="bg-violet-500"
                    label="Atenciones asociadas"
                    max={maxAtendidosPatologia}
                    value={p.atenciones}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          renderVacio({
            icon: <HeartPulse size={30} />,
            mensaje: "Las condiciones provienen de los perfiles clínicos registrados.",
            titulo: "Sin condiciones para mostrar",
          })
        )}

        {maxIncidentesPatologia > 0 && (
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-4">Incidentes por condición</h3>
            <div className="space-y-4">
              {porPatologia.slice(0, 10).map((p) => (
                <BarraRanking
                  className="bg-rose-500"
                  key={p.patologia}
                  label={p.patologia}
                  max={maxIncidentesPatologia}
                  value={p.incidentes}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderAuditoria() {
    if (cargandoLogs && !logs) {
      return renderContenidoCargando();
    }
    if (errorLogs && !logs) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-start gap-3">
          <X className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-red-800 text-sm mb-1">No se pudo cargar la auditoría</p>
            <p className="text-xs text-red-700 leading-relaxed">{errorLogs}</p>
            <button
              className="mt-3 inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
onClick={() => recargarLogs()}
          >
            <RefreshCw size={12} /> Reintentar
          </button>
          </div>
        </div>
      );
    }

    const totalPaginasFinal = logs?.totalPaginas ?? 1;

    return (
      <div className="space-y-6">
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <History className="text-amber-600" size={15} /> Auditoría de accesos
              </h3>
              <p className="text-xs text-gray-500">
                {logs ? `${formatearNumero(logs.total)} registros` : "Registros de la institución"}
                {" "}· consulta de {session.user.email ?? "operador"} registrada
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                aria-label="Filtrar por acción"
                className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
                onChange={(e) => {
                  setFiltroAccion(e.target.value);
                  setPaginaLogs(1);
                  setCargandoLogs(true);
                  setErrorLogs(null);
                }}
                value={filtroAccion}
              >
                <option value="">Todas las acciones</option>
                <option value="consulta_dashboard">Consulta de dashboard</option>
                <option value="consulta_auditoria">Consulta de auditoría</option>
                <option value="verificar_qr">Verificación de QR</option>
              </select>
              <button
                aria-label="Actualizar auditoría"
                className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 transition-colors"
                onClick={() => recargarLogs()}
              >
                <RefreshCw size={12} /> Actualizar
              </button>
            </div>
          </div>

          {cargandoLogs && logs ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="animate-spin text-violet-600" size={20} />
            </div>
          ) : null}

          {!cargandoLogs && logs && logs.logs.length === 0 ? (
            renderVacio({
              icon: <History size={30} />,
              mensaje: "Las consultas al panel quedan registradas acá automáticamente.",
              titulo: "Sin registros de auditoría",
            })
          ) : null}

          {logs && logs.logs.length > 0 ? (
            <div className="space-y-2">
              {logs.logs.map((l) => (
                <div
                  className="border border-gray-100 rounded-xl px-4 py-3.5 flex items-start justify-between gap-3"
                  key={l.id}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center flex-wrap gap-1.5 mb-1">
                      <span
                        className={cn(
                          "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border",
                          colorAccion(l.accion),
                        )}
                      >
                        {ETIQUETA_ACCION.get(l.accion) ?? l.accion}
                      </span>
                      {l.operador && (
                        <span
                          className="text-[10px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full"
                          title="Operador que realizó la consulta"
                        >
                          {l.operador}
                        </span>
                      )}
                      {l.paciente && (
                        <span className="text-[10px] font-mono text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                          {l.paciente}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 flex items-center gap-1.5 flex-wrap">
                      {formatearFecha(l.creado_en)}
                      {l.direccion_ip ? (
                        <span className="text-gray-400 font-mono">· {l.direccion_ip}</span>
                      ) : null}
                    </p>
                    {l.detalles ? (
                      <p
                        className="text-[10px] text-gray-400 font-mono truncate mt-1"
                        title={JSON.stringify(l.detalles)}
                      >
                        {JSON.stringify(l.detalles)}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {!cargandoLogs && logs ? (
            <div className="flex items-center justify-between gap-3 border-t border-gray-100 mt-4 pt-4">
              <p className="text-xs text-gray-500">
                Página {logs.page} de {totalPaginasFinal} ·{" "}
                {formatearNumero(logs.total)} registro{logs.total === 1 ? "" : "s"}
              </p>
              <div className="flex items-center gap-2">
                <button
                  aria-label="Página anterior"
                  className="flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={logs.page <= 1}
                  onClick={() => {
                    setPaginaLogs((p) => Math.max(1, p - 1));
                    setCargandoLogs(true);
                    setErrorLogs(null);
                  }}
                >
                  <ChevronLeft size={13} /> Anterior
                </button>
                <button
                  aria-label="Página siguiente"
                  className="flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={logs.page >= totalPaginasFinal}
                  onClick={() => {
                    setPaginaLogs((p) => p + 1);
                    setCargandoLogs(true);
                    setErrorLogs(null);
                  }}
                >
                  Siguiente <ChevronRight size={13} />
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <TarjetaInformativa
          icon={<ShieldCheck size={15} />}
          mensaje="Los pacientes se anonimizan con el formato PAC-****-XXXX; los operadores se muestran con su nombre real (médico con matrícula o institución) para garantizar la trazabilidad exigida por la Ley 25.326. Cada consulta a este panel genera su propio registro de auditoría."
          titulo="Auditoría registrada"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "Inter, sans-serif" }}>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "#7C3AED" }}
              >
                <BarChart3 className="text-white" size={20} />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-extrabold text-gray-900 truncate">
                  Panel Institucional
                </h1>
                <p className="text-xs text-gray-500 truncate">
                  Métricas agregadas y anonimizadas · sin datos personales de pacientes
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                <Shield size={11} /> Datos anonimizados
              </span>
              <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                {PERIODOS.map((p) => (
                  <button
                    className={cn(
                      "px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors",
                      periodo === p
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-700",
                    )}
                    key={p}
                    onClick={() => {
                      setPeriodo(p);
                      setCargandoMetricas(true);
                      setErrorMetricas(null);
                    }}
                  >
                    {ETIQUETAS_PERIODO.get(p)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          <aside className="hidden lg:block w-60 flex-shrink-0">
            <nav className="sticky top-20 bg-white border border-gray-100 rounded-2xl p-2 shadow-sm space-y-1">
              {secciones.map(({ icon, key, label }) => (
                <button
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-colors",
                    seccion === key
                      ? "bg-violet-600 text-white"
                      : "text-gray-600 hover:bg-violet-50 hover:text-violet-700",
                  )}
                  key={key}
                  onClick={() => cambiarSeccion(key)}
                >
                  <span className="flex-shrink-0">{icon}</span>
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </nav>
          </aside>

          <main className="flex-1 min-w-0">
            <div className="lg:hidden flex gap-2 overflow-x-auto pb-2 mb-5">
              {secciones.map(({ icon, key, label }) => (
                <button
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors",
                    seccion === key
                      ? "bg-violet-600 text-white"
                      : "bg-white border border-gray-200 text-gray-600",
                  )}
                  key={key}
                  onClick={() => cambiarSeccion(key)}
                >
                  {icon} {label}
                </button>
              ))}
            </div>

            {seccion === "resumen" && renderResumen()}
            {seccion === "incidentes" && renderIncidentes()}
            {seccion === "zonas" && renderZonas()}
            {seccion === "condiciones" && renderCondiciones()}
            {seccion === "auditoria" && renderAuditoria()}
          </main>
        </div>
      </div>
    </div>
  );
}

export default function InstitucionalPage() {
  const { loading, rol, session } = useRol();
  const [showLogin, setShowLogin] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-violet-600" size={28} />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50" style={{ fontFamily: "Inter, sans-serif" }}>
        <Navbar />
        <div className="max-w-md mx-auto px-4 py-24 text-center">
          <div className="w-16 h-16 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Lock className="text-violet-600" size={28} />
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 mb-2">
            Sesión requerida
          </h1>
          <p className="text-gray-500 text-sm mb-6">
            Iniciá sesión con una cuenta de institución o administrador para
            acceder al panel.
          </p>
          <button
            className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
            onClick={() => setShowLogin(true)}
          >
            Iniciar sesión
          </button>
        </div>
        {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      </div>
    );
  }

  const esInstitucional = rol === "institucion" || rol === "admin";

  if (!esInstitucional) {
    return (
      <div className="min-h-screen bg-gray-50" style={{ fontFamily: "Inter, sans-serif" }}>
        <Navbar />
        <div className="max-w-md mx-auto px-4 py-24 text-center">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Shield className="text-red-500" size={28} />
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 mb-2">
            Acceso denegado
          </h1>
          <p className="text-gray-500 text-sm mb-6">
            Este panel es exclusivo para cuentas con rol de institución o
            administrador. Tu cuenta actual no tiene ese permiso.
          </p>
          <Link
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
            href="/"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  return <PanelInstitucional session={session} />;
}