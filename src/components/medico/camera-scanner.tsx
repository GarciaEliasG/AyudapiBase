"use client";

import type { Html5Qrcode, Html5QrcodeCameraScanConfig } from "html5-qrcode";

import { CameraOff, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface CameraScannerProps {
  containerId: string;
  onDetected: (decodedText: string) => void;
  onError?: (message: string) => void;
}

export function CameraScanner({
  containerId,
  onDetected,
  onError,
}: CameraScannerProps) {
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const detectadoRef = useRef(false);
  const onErrorRef = useRef<((message: string) => void) | undefined>(onError);
  const onDetectedRef = useRef<((decodedText: string) => void) | undefined>(
    onDetected,
  );

  useEffect(() => {
    onDetectedRef.current = onDetected;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    let activo = true;
    let scanner: Html5Qrcode | null = null;

    async function iniciar() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (!activo) return;
        scanner = new Html5Qrcode(containerId);
        scannerRef.current = scanner;
        const config: Html5QrcodeCameraScanConfig = {
          fps: 10,
          qrbox: { height: 240, width: 240 },
        };
        await scanner.start(
          { facingMode: "environment" },
          config,
          (decodedText) => {
            if (detectadoRef.current) return;
            detectadoRef.current = true;
            void scanner?.stop().catch(() => undefined);
            scanner?.clear();
            if (activo) onDetectedRef.current?.(decodedText);
          },
          () => {
            // Errores de fotograma (QR aún no detectado): se ignoran.
          },
        );
        if (activo) setStarting(false);
      } catch (err) {
        if (!activo) return;
        try {
          await scanner?.stop();
        } catch {
          // Escáner nunca iniciado.
        }
        scanner?.clear();
        const mensaje =
          err instanceof Error ? err.message : "No se pudo acceder a la cámara.";
        setError(mensaje);
        onErrorRef.current?.(mensaje);
      }
    }

    void iniciar();

    return () => {
      activo = false;
      void (async () => {
        try {
          await scannerRef.current?.stop();
        } catch {
          // Escáner nunca iniciado.
        }
        scannerRef.current?.clear();
      })();
    };
  }, [containerId]);

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
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-gray-900/90 px-6 text-center">
          <CameraOff className="text-red-400" size={20} />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}
    </div>
  );
}