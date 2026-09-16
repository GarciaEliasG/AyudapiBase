"use client";

import type {
  Html5Qrcode,
  Html5QrcodeCameraScanConfig,
} from "html5-qrcode";

import { CameraOff, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export type ScannerErrorCategoria =
  | "inseguro"
  | "permisos"
  | "sin-camara"
  | "ocupada"
  | "bloqueada"
  | "desconocido";

export interface ScannerErrorInfo {
  categoria: ScannerErrorCategoria;
  mensaje: string;
  hint?: string;
}

interface CameraScannerProps {
  containerId: string;
  onDetected: (decodedText: string) => void;
  onError?: (info: ScannerErrorInfo) => void;
}

function clasificarError(err: unknown): ScannerErrorInfo {
  const nombre =
    err instanceof DOMException
      ? err.name
      : err instanceof Error
        ? err.name || "Error"
        : "Error";

  switch (nombre) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return {
        categoria: "permisos",
        mensaje: "El acceso a la cámara fue denegado.",
        hint: "Si la cámara no se abre, abrí este enlace en el navegador (Chrome o Safari) en lugar de dentro de la app de Google/WhatsApp, y tocá “Permitir” cuando lo pida.",
      };
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return {
        categoria: "sin-camara",
        mensaje: "No encontramos una cámara disponible en este dispositivo.",
        hint: "Probá con el campo de slug manual de más abajo.",
      };
    case "NotReadableError":
    case "TrackStartError":
      return {
        categoria: "ocupada",
        mensaje: "La cámara está ocupada por otra aplicación.",
        hint: "Cerrá la otra app que está usando la cámara y tocá “Reintentar”.",
      };
    case "SecurityError":
    case "NotSupportedError":
      return {
        categoria: "bloqueada",
        mensaje: "Este dispositivo o contexto no permite acceder a la cámara.",
        hint: "Usá el campo de slug manual de más abajo.",
      };
    default:
      return {
        categoria: "desconocido",
        mensaje:
          err instanceof Error
            ? err.message
            : "No se pudo iniciar la cámara.",
        hint: "Podés continuar ingresando el slug del QR manualmente.",
      };
  }
}

export function CameraScanner({
  containerId,
  onDetected,
  onError,
}: CameraScannerProps) {
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState<ScannerErrorInfo | null>(null);
  const [intento, setIntento] = useState(0); // Fuerza un reinicio tras reintentar.
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const detectadoRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onDetectedRef.current = onDetected;
    onErrorRef.current = onError;
  }, [onDetected, onError]);

  const reiniciar = useCallback(() => {
    detectadoRef.current = false;
    setError(null);
    setStarting(true);
    setIntento((v) => v + 1);
  }, []);

  useEffect(() => {
    let activo = true;
    let scanner: Html5Qrcode | null = null;

    async function iniciar() {
      if (
        typeof window === "undefined" ||
        typeof window.isSecureContext !== "boolean" ||
        !window.isSecureContext
      ) {
        const info: ScannerErrorInfo = {
          categoria: "inseguro",
          mensaje: "La cámara solo está disponible a través de HTTPS.",
          hint: "Usá el campo de slug manual de más abajo, o abrí el panel con el enlace https de producción.",
        };
        setError(info);
        onErrorRef.current?.(info);
        return;
      }
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== "function"
      ) {
        const info = clasificarError(
          new DOMException(
            "getUserMedia no está disponible.",
            "NotSupportedError",
          ),
        );
        setError(info);
        onErrorRef.current?.(info);
        return;
      }

      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (!activo) return;

        const camaras = await Html5Qrcode.getCameras().catch(() => []);

        scanner = new Html5Qrcode(containerId);
        scannerRef.current = scanner;

        const config: Html5QrcodeCameraScanConfig = {
          fps: 10,
          qrbox: { height: 240, width: 240 },
        };

        const fuente =
          camaras.length > 1
            ? {
                deviceId: {
                  exact:
                    camaras.find((c) => /back|trasera|rear/i.test(c.label))
                      ?.id ??
                    camaras[camaras.length - 1].id,
                },
              }
            : { facingMode: "environment" };

        await scanner.start(fuente, config, (decodedText) => {
          if (detectadoRef.current) return;
          detectadoRef.current = true;
          void scanner?.stop().catch(() => undefined);
          scanner?.clear();
          if (activo) onDetectedRef.current?.(decodedText);
        }, () => {
          // Errores de fotograma (QR aún no detectado): se ignoran.
        });

        if (activo) {
          setError(null);
          setStarting(false);
        }
      } catch (err) {
        if (!activo) return;
        try {
          await scanner?.stop();
        } catch {
          // Escáner nunca llegó a iniciarse.
        }
        scanner?.clear();
        const info = clasificarError(err);
        setError(info);
        setStarting(false);
        onErrorRef.current?.(info);
      }
    }

    void iniciar();

    return () => {
      activo = false;
      void (async () => {
        try {
          await scannerRef.current?.stop();
        } catch {
          // Escáner nunca llegó a iniciarse.
        }
        scannerRef.current?.clear();
      })();
    };
  }, [containerId, intento]);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gray-900">
      <div className="w-full" id={containerId} />
      {starting && !error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 text-gray-300">
          <Loader2 className="animate-spin text-white" size={20} />
          <p className="text-sm">Activando cámara…</p>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-gray-900/95 px-6 text-center">
          <div className="w-12 h-12 bg-red-500/15 rounded-2xl flex items-center justify-center">
            {error.categoria === "inseguro" || error.categoria === "bloqueada" ? (
              <ShieldAlert className="text-amber-400" size={22} />
            ) : (
              <CameraOff className="text-red-400" size={22} />
            )}
          </div>
          <p className="text-sm font-semibold text-white">{error.mensaje}</p>
          {error.hint && <p className="text-xs text-gray-300 leading-relaxed">{error.hint}</p>}
          {error.categoria !== "inseguro" && (
            <button
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
              onClick={() => void reiniciar()}
            >
              <RefreshCw size={13} /> Reintentar cámara
            </button>
          )}
        </div>
      )}
    </div>
  );
}