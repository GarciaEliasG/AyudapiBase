"use client";

import {
  AlertTriangle,
  Bell,
  Check,
  ChevronDown,
  ChevronUp,
  Heart,
  MapPin,
  Phone,
  Shield,
  User,
} from "lucide-react";
import { useState } from "react";

import { AccesoMedicoDiscreto } from "@/components/emergency/acceso-medico-discreto";
import { PreviewNav } from "@/components/emergency/preview-nav";

const CONDICIONES_CRITICAS = [
  { tipo: "ALERGIA", label: "PENICILINA — RIESGO DE ANAFILAXIA" },
  { tipo: "ENFERMEDAD", label: "DIABÉTICO TIPO 2 — INSULINODEPENDIENTE" },
];
const CONDICIONES_OTRAS = [
  { tipo: "ENFERMEDAD", label: "HIPERTENSIÓN ARTERIAL" },
  { tipo: "ALERGIA", label: "IBUPROFENO — INTOLERANCIA GÁSTRICA" },
];
const CONTACTOS = [
  { name: "María Méndez", relation: "Esposa", phone: "+54 11 4523-8871" },
  { name: "Dr. Roberto López", relation: "Médico de cabecera", phone: "+54 11 5230-4490" },
  { name: "Lucía Méndez", relation: "Hija", phone: "+54 11 6781-2234" },
];

export default function EmergencyPage() {
  const [alertSent, setAlertSent] = useState(false);
  const [iceExpanded, setIceExpanded] = useState(false);
  const [legalExpanded, setLegalExpanded] = useState(false);

  return (
    <div className="min-h-screen bg-[#0F1929] flex flex-col items-center" style={{ fontFamily: "Inter, sans-serif" }}>
      <PreviewNav />
      <div className="w-full max-w-sm">
        {/* Barra de emergencia (rojo reservado exclusivamente para emergencias) */}
        <div className="bg-red-600 px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-2 mb-0.5">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <span className="text-white text-xs font-black tracking-widest uppercase">Perfil de emergencia activo</span>
            <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
          </div>
          <p className="text-white/80 text-xs">AyudAPI · Sistema de Asistencia Médica</p>
        </div>

        <div className="px-3 py-3 space-y-3">
          <div className="bg-white rounded-2xl p-4">
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Persona que necesita asistencia</p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                <User className="text-gray-400" size={20} />
              </div>
              <div>
                <h1 className="text-2xl font-black text-gray-900">Carlos M.</h1>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="flex items-center gap-1 bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">
                    <Heart className="fill-red-700" size={10} /> A+
                  </span>
                  <span className="text-gray-500 text-xs">Masculino</span>
                  <span className="text-gray-400 text-xs">·</span>
                  <span className="text-gray-500 text-xs">178cm · 82kg</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <AlertTriangle className="text-red-400" size={12} />
              <p className="text-red-400 text-xs font-bold uppercase tracking-widest">Condiciones críticas</p>
            </div>
            {CONDICIONES_CRITICAS.map(({ tipo, label }) => (
              <div className="bg-red-600 rounded-xl px-4 py-3 mb-2" key={label}>
                <div className="flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="text-white/80" size={13} />
                  <span className="text-white/80 text-xs font-bold uppercase tracking-wide">{tipo}</span>
                </div>
                <p className="text-white font-black text-sm tracking-wide">{label}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2 px-1">Otras condiciones</p>
            {CONDICIONES_OTRAS.map(({ tipo, label }) => (
              <div className="bg-amber-500 rounded-xl px-4 py-3 mb-2" key={label}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-white/80 text-xs font-bold uppercase tracking-wide">{tipo}</span>
                </div>
                <p className="text-white font-bold text-sm">{label}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2 px-1">Acciones de emergencia</p>

            {!alertSent ? (
              <button
                className="w-full bg-red-600 hover:bg-red-700 rounded-xl px-4 py-5 mb-2 flex items-center gap-3 transition-colors"
                onClick={() => {
                  setAlertSent(true);
                  setIceExpanded(true);
                }}
              >
                <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Bell className="text-white" size={20} />
                </div>
                <div className="text-left">
                  <p className="text-white font-extrabold text-base">Alertar al SAME / Ambulancia</p>
                  <p className="text-white/70 text-xs">Envía alerta con geolocalización al servicio de emergencias</p>
                </div>
              </button>
            ) : (
              <div className="bg-green-600 rounded-xl px-4 py-4 mb-2 flex items-center gap-3">
                <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Check className="text-white" size={18} />
                </div>
                <div>
                  <p className="text-white font-bold text-sm">¡Alerta enviada al SAME!</p>
                  <p className="text-white/80 text-xs">Ubicación GPS enviada · Unidad más cercana notificada</p>
                </div>
              </div>
            )}

            <div className="bg-green-700 rounded-xl mb-2 overflow-hidden">
              <button className="w-full px-4 py-4 flex items-center gap-3" onClick={() => setIceExpanded(!iceExpanded)}>
                <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Phone className="text-white" size={18} />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-white font-bold text-sm">Llamar al contacto ICE</p>
                  <p className="text-green-200 text-xs">{CONTACTOS[0].name} · {CONTACTOS[0].relation}</p>
                </div>
                {iceExpanded ? <ChevronUp className="text-white/60" size={16} /> : <ChevronDown className="text-white/60" size={16} />}
              </button>
              {iceExpanded && (
                <div className="bg-[#1a2a1a] px-3 pb-3 space-y-2">
                  {CONTACTOS.map((c) => (
                    <div className="flex items-center justify-between py-2.5 border-b border-white/10 last:border-0" key={c.name}>
                      <div className="flex items-center gap-2">
                        <Phone className="text-green-400" size={14} />
                        <div>
                          <p className="text-white text-sm font-semibold">{c.name}</p>
                          <p className="text-green-300 text-xs">{c.relation}</p>
                        </div>
                      </div>
                      <a className="text-green-400 text-sm font-mono font-semibold hover:text-green-300" href={`tel:${c.phone.replace(/\s/g, "")}`}>
                        {c.phone}
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <a className="bg-[#1e2d3a] rounded-xl px-4 py-4 mb-2 flex items-center gap-3 transition-colors hover:bg-[#24384a]" href={`tel:${"911".replace(/[^\d+]/g, "")}`}>
              <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <Phone className="text-white/70" size={20} />
              </div>
              <div>
                <p className="text-white font-bold text-base">Llamar al 911</p>
                <p className="text-gray-400 text-xs">Emergencias policiales y bomberos</p>
              </div>
            </a>

            <a className="bg-[#1e2d3a] rounded-xl px-4 py-4 mb-2 flex items-center gap-3 transition-colors hover:bg-[#24384a]" href="tel:107">
              <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <Phone className="text-white/70" size={20} />
              </div>
              <div>
                <p className="text-white font-bold text-base">Llamar al 107 (SAME)</p>
                <p className="text-gray-400 text-xs">Ambulancias y asistencia médica de emergencia</p>
              </div>
            </a>

            {alertSent && (
              <div className="bg-green-900/60 border border-green-600/40 rounded-xl px-4 py-3 mb-2 flex items-start gap-2">
                <MapPin className="text-green-400 mt-0.5 flex-shrink-0" size={14} />
                <div>
                  <p className="text-green-400 text-xs font-bold">Ubicación GPS capturada y enviada</p>
                  <p className="text-green-300/70 text-xs mt-0.5">La unidad de emergencias más cercana fue notificada. Permanecé junto a la persona afectada.</p>
                </div>
              </div>
            )}

            <div className="bg-[#1e2d3a] rounded-xl overflow-hidden mb-2">
              <button className="w-full px-4 py-3.5 flex items-center justify-between" onClick={() => setLegalExpanded(!legalExpanded)}>
                <div className="flex items-center gap-2">
                  <Shield className="text-gray-400" size={15} />
                  <span className="text-white/80 text-sm font-medium">Autorización legal del titular</span>
                </div>
                {legalExpanded ? <ChevronUp className="text-gray-500" size={15} /> : <ChevronDown className="text-gray-500" size={15} />}
              </button>
              {legalExpanded && (
                <div className="px-4 pb-4">
                  <p className="text-gray-400 text-xs leading-relaxed">
                    El titular de este perfil autorizó expresamente, al momento del registro, que cualquier persona que encuentre este QR en su persona pueda revisar sus pertenencias en caso de emergencia, conforme el Art. 34 del Código Penal (Estado de Necesidad) y el Art. 108 (Obligación de Socorro). Ley 25.326.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-amber-500/15 border border-amber-500/30 rounded-xl px-4 py-3">
            <p className="text-amber-300 text-xs font-semibold text-center leading-relaxed">
              Solo autorizado para esta emergencia. Queda prohibido cualquier otro uso de la información.
            </p>
          </div>

          <AccesoMedicoDiscreto afterAuthPath="/medico/escanear" slug="demo" />

          <div className="text-center pb-4 pt-2 border-t border-white/10">
            <div className="flex items-center justify-center gap-1.5 mb-2">
              <div className="w-5 h-5 bg-blue-600 rounded-md flex items-center justify-center">
                <Heart className="text-white fill-white" size={10} />
              </div>
              <span className="text-white/60 text-xs font-semibold">AyudAPI · Sistema de Asistencia Médica</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}