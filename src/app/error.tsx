"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

export default function RootError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-100 p-6 shadow-sm text-center">
        <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="text-amber-600" size={22} />
        </div>
        <h1 className="text-lg font-bold text-gray-900 mb-1">Algo salió mal</h1>
        <p className="text-sm text-gray-500 mb-5">
          No pudimos completar la operación. Reintentá o volvé a intentar en unos segundos.
        </p>
        <button
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
          onClick={() => reset()}
        >
          <RefreshCw size={14} /> Reintentar
        </button>
      </div>
    </div>
  );
}