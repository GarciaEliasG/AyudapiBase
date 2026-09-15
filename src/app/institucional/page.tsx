import { BarChart3, Shield } from "lucide-react";
import Link from "next/link";

import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";

export default function InstitucionalPage() {
  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "Inter, sans-serif" }}>
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <div className="w-16 h-16 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <BarChart3 className="text-violet-600" size={28} />
        </div>
        <h1 className="text-3xl font-extrabold text-gray-900 mb-3">Panel institucional</h1>
        <p className="text-gray-500 text-sm max-w-md mx-auto mb-4">
          Dashboards de siniestralidad, mapas de calor y tiempos de respuesta para obras sociales y hospitales.
        </p>
        <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700 mb-8">
          <Shield size={16} /> Este módulo (DEV3) se habilita con datos anonimizados y auditoría.
        </div>
        <div>
          <Link className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700" href="/">
            Volver al inicio
          </Link>
        </div>
      </div>
      <Footer />
    </div>
  );
}