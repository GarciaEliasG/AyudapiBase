import { ArrowLeft } from "lucide-react";
import Link from "next/link";

/**
 * Barra superior estática de los paneles de emergencia. Reemplaza al botón
 * flotante que se superponía con los datos críticos: ahora convive en el
 * encabezado de la página sin tapar la información.
 */
export function PreviewNav() {
  return (
    <nav className="w-full border-b border-white/10 bg-[#0F1929]/95 sticky top-0 z-40">
      <div className="mx-auto flex w-full max-w-sm items-center justify-between gap-2 px-3 py-2.5">
        <Link
          className="flex items-center gap-2 rounded-lg bg-[#1e2d3a] px-3 py-2 text-white transition-colors hover:bg-[#24384a]"
          href="/"
        >
          <ArrowLeft size={14} />
          <span className="text-xs font-bold">Volver al inicio</span>
        </Link>
        <span className="text-white/40 text-[10px] font-semibold uppercase tracking-wider">
          AyudAPI · Emergencia
        </span>
      </div>
    </nav>
  );
}