import Link from "next/link";

import { AyudapiLogo } from "@/components/brand/logo";

export function Footer() {
  return (
    <footer className="bg-[#0F1929] py-8 px-4 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 sm:flex-row">
        <Link className="opacity-90" href="/">
          <AyudapiLogo dark />
        </Link>
        <p className="text-xs text-white/40">
          Sistema de asistencia médica de emergencia · Argentina · 2025
        </p>
        <p className="text-xs text-white/40">Ley 25.326 · Art. 34 y 108 CP</p>
      </div>
    </footer>
  );
}