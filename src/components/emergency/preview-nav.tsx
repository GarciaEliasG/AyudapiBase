import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export function PreviewNav() {
  return (
    <nav className="fixed top-3 left-3 z-50">
      <Link
        className="flex items-center gap-2 rounded-full bg-[#1e2d3a]/95 px-4 py-2.5 text-white shadow-lg backdrop-blur transition-colors hover:bg-[#24384a]"
        href="/"
      >
        <ArrowLeft size={16} />
        <span className="text-sm font-bold">Volver al inicio</span>
      </Link>
    </nav>
  );
}