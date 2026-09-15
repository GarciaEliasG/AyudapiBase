"use client";

import { LogIn, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { LoginModal } from "@/components/auth/login-modal";
import { AyudapiLogo } from "@/components/brand/logo";
import { useRol } from "@/lib/auth/use-rol";
import { createBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

export function Navbar() {
  const pathname = usePathname();
  const { loading, rol, session } = useRol();
  const [showLogin, setShowLogin] = useState(false);

  const esMedico = session !== null && rol === "medico";

  const links = [
    { href: "/mi-perfil", label: "Mi perfil", onlyLoggedIn: true },
    {
      href: esMedico ? "/medico/escanear" : "/acceso-medico",
      label: esMedico ? "Ver mi perfil médico" : "Acceso médico",
      onlyLoggedIn: esMedico,
    },
    { href: "/institucional", label: "Institucional", onlyLoggedIn: false },
  ];

  async function handleLogout() {
    await createBrowserClient().auth.signOut();
  }

  return (
    <>
      <nav className="bg-white/95 border-b border-gray-100 sticky top-0 z-40 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/">
            <AyudapiLogo />
          </Link>
          <div className="hidden items-center gap-6 text-sm font-medium text-gray-600 sm:flex">
            {links
              .filter((link) => !link.onlyLoggedIn || session)
              .map((link) => (
                <Link
                  className={cn(
                    "transition-colors hover:text-gray-900",
                    pathname === link.href && "text-blue-600 font-semibold",
                  )}
                  href={link.href}
                  key={link.href}
                >
                  {link.label}
                </Link>
              ))}
          </div>
          <div className="flex items-center gap-2">
            {loading ? (
              <>
                <div className="h-7 w-7 rounded-full bg-gray-100 animate-pulse" />
                <div className="hidden sm:block h-4 w-28 bg-gray-100 animate-pulse rounded" />
              </>
            ) : session ? (
              <>
                <Link
                  className="hidden items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 sm:flex"
                  href="/mi-perfil"
                >
                  <span className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-xs font-bold text-blue-700">
                      {(session.user.email ?? "U").slice(0, 1).toUpperCase()}
                    </span>
                  </span>
                  <span className="max-w-[160px] truncate">{session.user.email}</span>
                </Link>
                <button
                  aria-label="Cerrar sesión"
                  className="hidden text-gray-400 hover:text-gray-600 transition-colors sm:block"
                  onClick={() => void handleLogout()}
                >
                  <LogOut size={16} />
                </button>
                <Link
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                  href="/crear-perfil"
                >
                  Editar perfil
                </Link>
              </>
            ) : (
              <button
                className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                onClick={() => setShowLogin(true)}
              >
                <LogIn size={15} /> Iniciar sesión
              </button>
            )}
          </div>
        </div>
      </nav>
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </>
  );
}