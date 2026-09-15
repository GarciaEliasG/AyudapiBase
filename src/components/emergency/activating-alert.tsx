"use client";

import { Bell, Check, Loader2, MapPin, Phone } from "lucide-react";
import { useState } from "react";

interface ContactoIce {
  nombre?: string;
  relacion?: string;
  telefono?: string;
}

interface AlertButtonProps {
  slug: string;
  shareLocation: boolean;
  contactos?: ContactoIce[];
}

type EstadoAlerta = "idle" | "localizando" | "enviando" | "enviada" | "error";

interface Posicion {
  exacta: boolean;
  lat?: number;
  lng?: number;
}

const TIMEOUT_GPS_MS = 3000;

function telHref(numero: string | undefined): string | null {
  if (!numero) return null;
  const digitos = numero.replace(/[^\d+]/g, "");
  return digitos ? `tel:${digitos}` : null;
}

function DialButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      className="flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl py-3 text-base transition-colors"
      href={href}
    >
      <Phone size={18} /> {label}
    </a>
  );
}

function LlamadasDirectas({ contactos }: { contactos: ContactoIce[] }) {
  const conTelefono = contactos.filter((c) => telHref(c.telefono));

  return (
    <div className="space-y-2">
      <p className="text-white/70 text-xs font-bold uppercase tracking-widest px-1">
        También podés llamar directamente
      </p>
      <div className="grid grid-cols-2 gap-2">
        <DialButton href="tel:107" label="SAME 107" />
        <DialButton href="tel:911" label="911" />
      </div>
      {conTelefono.length > 0 && (
        <div className="space-y-2">
          {conTelefono.map((c, i) => (
            <a
              className="flex items-center justify-between bg-[#1e2d3a] hover:bg-[#24384a] rounded-xl px-4 py-3 transition-colors"
              href={telHref(c.telefono) ?? "#"}
              key={i}
            >
              <span className="text-white text-sm font-semibold">{c.nombre ?? "Contacto ICE"}</span>
              <span className="text-green-300 text-sm font-mono font-semibold">{c.telefono}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function ActivarAlerta({ contactos = [], shareLocation, slug }: AlertButtonProps) {
  const [estado, setEstado] = useState<EstadoAlerta>("idle");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [sinUbicacion, setSinUbicacion] = useState(false);

  async function obtenerPosicion(): Promise<Posicion> {
    if (!shareLocation || typeof navigator === "undefined" || !navigator.geolocation) {
      return { exacta: false };
    }
    return new Promise<Posicion>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) =>
          resolve({
            exacta: true,
            lat: Number(coords.latitude.toFixed(6)),
            lng: Number(coords.longitude.toFixed(6)),
          }),
        () => resolve({ exacta: false }),
        { enableHighAccuracy: true, timeout: TIMEOUT_GPS_MS, maximumAge: 0 },
      );
    });
  }

  async function handleAlertar() {
    setEstado("localizando");
    setMensaje(null);
    setSinUbicacion(false);

    const posicion = await obtenerPosicion();
    if (!posicion.exacta) {
      setSinUbicacion(true);
    }

    setEstado("enviando");
    try {
      const res = await fetch("/api/alertas/emergencia", {
        body: JSON.stringify({
          lat: posicion.lat,
          lng: posicion.lng,
          precision: posicion.exacta ? "exacta" : "aproximada",
          slug,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await res.json()) as {
        error?: { message?: string };
        exacta?: boolean;
        notificaciones?: number;
      };
      if (!res.ok) {
        throw new Error(payload.error?.message ?? "No se pudo enviar la alerta.");
      }
      setEstado("enviada");
      setMensaje(
        payload.exacta
          ? `Alerta enviada con tu ubicación GPS · ${payload.notificaciones ?? 0} contacto(s) ICE notificados.`
          : `Alerta enviada · ${payload.notificaciones ?? 0} contacto(s) ICE notificados.`,
      );
    } catch (err) {
      setEstado("error");
      setMensaje(err instanceof Error ? err.message : "Error de conexión.");
    }
  }

  if (estado === "enviada") {
    return (
      <div className="space-y-3">
        <div className="bg-emerald-600 rounded-xl px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <Check className="text-white" size={18} />
          </div>
          <div>
            <p className="text-white font-bold text-base">Alerta enviada</p>
            <p className="text-white/80 text-xs">{mensaje}</p>
            {sinUbicacion && (
              <p className="text-white/80 text-xs mt-0.5 flex items-center gap-1">
                <MapPin size={11} /> No se obtuvo ubicación precisa. El SAME activó el protocolo de localización.
              </p>
            )}
          </div>
        </div>
        <LlamadasDirectas contactos={contactos} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-60 rounded-xl px-4 py-5 flex items-center gap-3 transition-colors"
        disabled={estado === "localizando" || estado === "enviando"}
        onClick={() => void handleAlertar()}
      >
        <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
          {estado === "localizando" || estado === "enviando" ? (
            <Loader2 className="animate-spin text-white" size={20} />
          ) : (
            <Bell className="text-white" size={20} />
          )}
        </div>
        <div className="flex-1 text-left">
          <p className="text-white font-extrabold text-base">
            {estado === "localizando"
              ? "Buscando ubicación GPS…"
              : estado === "enviando"
                ? "Enviando alerta al SAME…"
                : "Alertar al SAME / Ambulancia"}
          </p>
          <p className="text-white/75 text-xs">
            {estado === "localizando"
              ? "Estamos ubicando tu posición exacta"
              : "Envía alerta con geolocalización al servicio de emergencias"}
          </p>
        </div>
      </button>
      {(sinUbicacion || estado === "error") && (
        <>
          {mensaje && estado === "error" && (
            <p className="text-red-300 text-xs bg-red-950/50 border border-red-500/30 rounded-lg px-3 py-2">
              {mensaje}
            </p>
          )}
          {sinUbicacion && (
            <p className="text-amber-300 text-xs bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 flex items-center gap-1">
              <MapPin size={11} /> No se obtuvo la ubicación en 3 segundos. Podés llamar directamente mientras se envía la alerta.
            </p>
          )}
          <LlamadasDirectas contactos={contactos} />
        </>
      )}
    </div>
  );
}