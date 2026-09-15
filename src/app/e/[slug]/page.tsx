import type { Metadata } from "next";

import { AlertTriangle, Heart, Lock, Phone } from "lucide-react";

import { ActivarAlerta } from "@/components/emergency/activating-alert";
import { PreviewNav } from "@/components/emergency/preview-nav";
import { createAnonServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  robots: { index: false },
  title: "Perfil de emergencia · AyudAPI",
};

interface EmergenciaPublica {
  alias: string;
  alergias?: Array<{ descripcion?: string; severidad?: string; tipo?: string }>;
  contactos_emergencia?: Array<{ nombre?: string; relacion?: string; telefono?: string }>;
  genero?: string;
  grupo_sanguineo?: string;
  patologias?: Array<{ descripcion?: string; severidad?: string; tipo?: string }>;
  share_location?: boolean;
}

async function cargarEmergencia(slug: string): Promise<EmergenciaPublica | null> {
  try {
    const { data, error } = await createAnonServerClient().rpc("get_perfil_emergencia", {
      p_slug: slug,
    });
    if (error || !data) {
      return null;
    }
    return data as EmergenciaPublica;
  } catch {
    return null;
  }
}

function QrInactivo() {
  return (
    <div className="min-h-screen bg-[#0F1929] flex justify-center" style={{ fontFamily: "Inter, sans-serif" }}>
      <PreviewNav />
      <div className="w-full max-w-xs flex flex-col justify-center my-auto px-2 text-center">
        <div className="bg-[#1e2d3a] rounded-2xl p-6">
          <div className="w-14 h-14 bg-amber-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock className="text-amber-400" size={26} />
          </div>
          <h1 className="text-xl font-black text-white mb-2">Código QR inactivo o revocado</h1>
          <p className="text-white/60 text-sm leading-relaxed mb-6">
            Este código ya no está vigente. No se muestra información del titular.
          </p>
          <a
            className="flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl py-3 text-base transition-colors mb-2"
            href="tel:107"
          >
            <Phone size={18} /> Llamar al 107 (SAME)
          </a>
          <a
            className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-xl py-3 text-base transition-colors"
            href="tel:911"
          >
            <Phone size={18} /> Llamar al 911
          </a>
        </div>
        <p className="text-white/40 text-xs font-semibold mt-4">AyudAPI · Ley 25.326 · Art. 34 y 108 CP</p>
      </div>
    </div>
  );
}

export default async function EmergenciaPublicaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const perfil = await cargarEmergencia(slug);

  if (!perfil) {
    return <QrInactivo />;
  }

  // La función RPC ya filtra por severidad 'Crítico'; se refuerza en el cliente.
  const criticas = [
    ...(perfil.alergias ?? [])
      .filter((c) => c.severidad === "Crítico")
      .map((c) => ({ tipo: c.tipo ?? "ALERGIA", label: c.descripcion ?? "Alergia no especificada" })),
    ...(perfil.patologias ?? [])
      .filter((c) => c.severidad === "Crítico")
      .map((c) => ({ tipo: c.tipo ?? "ENFERMEDAD", label: c.descripcion ?? "Condición no especificada" })),
  ];

  return (
    <div className="min-h-screen bg-[#0F1929] flex justify-center" style={{ fontFamily: "Inter, sans-serif" }}>
      <PreviewNav />
      <div className="w-full max-w-sm">
        <div className="bg-red-600 px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-2 mb-0.5">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <span className="text-white text-xs font-black tracking-widest uppercase">Perfil de emergencia activo</span>
            <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
          </div>
          <p className="text-white/80 text-xs">AyudAPI · Sistema de Asistencia Médica</p>
        </div>

        <div className="px-3 py-3 space-y-3">
          <div className="bg-amber-500/15 border border-amber-500/30 rounded-xl px-4 py-3">
            <p className="text-amber-300 text-xs font-semibold text-center leading-relaxed">
              Solo autorizado para esta emergencia. Queda prohibido cualquier otro uso de la información.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-4">
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Persona que necesita asistencia</p>
            <h1 className="text-2xl font-black text-gray-900">{perfil.alias}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {perfil.grupo_sanguineo && (
                <span className="flex items-center gap-1 bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">
                  <Heart className="fill-red-700" size={10} /> {perfil.grupo_sanguineo}
                </span>
              )}
              {perfil.genero && <span className="text-gray-500 text-xs">{perfil.genero}</span>}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <AlertTriangle className="text-red-400" size={12} />
              <p className="text-red-400 text-xs font-bold uppercase tracking-widest">Condiciones críticas</p>
            </div>
            {criticas.length > 0 ? (
              criticas.map(({ tipo, label }) => (
                <div className="bg-red-600 rounded-xl px-4 py-3 mb-2" key={label}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="text-white/80" size={13} />
                    <span className="text-white/80 text-xs font-bold uppercase tracking-wide">{tipo}</span>
                  </div>
                  <p className="text-white font-black text-sm tracking-wide">{label}</p>
                </div>
              ))
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                <p className="text-white/70 text-xs font-semibold">Este QR no informa condiciones críticas registradas.</p>
              </div>
            )}
          </div>

          <div>
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2 px-1">Acciones de emergencia</p>
            <ActivarAlerta
              contactos={perfil.contactos_emergencia ?? []}
              shareLocation={perfil.share_location ?? false}
              slug={slug}
            />
          </div>

          {(perfil.contactos_emergencia ?? []).length > 0 && (
            <div>
              <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2 px-1">Contactos ICE</p>
              {perfil.contactos_emergencia!.map((c) => (
                <div className="bg-[#1e2d3a] rounded-xl px-4 py-3 mb-2 flex items-center justify-between" key={c.nombre}>
                  <div className="flex items-center gap-2">
                    <Phone className="text-green-400" size={14} />
                    <div>
                      <p className="text-white text-sm font-semibold">{c.nombre}</p>
                      <p className="text-green-300 text-xs">{c.relacion}</p>
                    </div>
                  </div>
                  {c.telefono && (
                    <a
                      className="text-green-400 text-sm font-mono font-semibold hover:text-green-300"
                      href={`tel:${c.telefono.replace(/[^\d+]/g, "")}`}
                    >
                      {c.telefono}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="text-center pb-4 pt-2 border-t border-white/10">
            <p className="text-white/60 text-xs font-semibold">AyudAPI · Ley 25.326 · Art. 34 y 108 CP</p>
          </div>
        </div>
      </div>
    </div>
  );
}