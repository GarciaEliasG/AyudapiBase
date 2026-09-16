"use client";

import { LogIn, LogOut, Menu, Stethoscope, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { LoginModal } from "@/components/auth/login-modal";
import { AyudapiLogo } from "@/components/brand/logo";
import { useRol } from "@/lib/auth/use-rol";
import { createBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

interface NavLink {
  href: string;
  label: string;
  onlyLoggedIn: boolean;
}

export function Navbar() {
  const pathname = usePathname();
  const { loading, rol, session } = useRol();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  const esMedico = session !== null && rol === "medico";
  const rolInstitucion = session !== null && rol === "institucion";

  const links: NavLink[] = [
    { href: "/mi-perfil", label: "Mi perfil", onlyLoggedIn: true },
    {
      href: esMedico ? "/medico/escanear" : "/acceso-medico",
      label: esMedico ? "Mi panel médico" : "Acceso médico",
      onlyLoggedIn: esMedico,
    },
    { href: "/institucional", label: "Institucional", onlyLoggedIn: false },
  ];

  const linksVisibles = links.filter((link) => !link.onlyLoggedIn || session);

  async function handleLogout() {
    setMenuOpen(false);
    await createBrowserClient().auth.signOut();
  }

  function linkClase(href: string) {
    return cn(
      "transition-colors hover:text-gray-900",
      pathname === href && "text-blue-600 font-semibold",
    );
  }

  return (
    <>
      <nav className="bg-white/95 border-b border-gray-100 sticky top-0 z-40 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" onClick={() => setMenuOpen(false)}>
            <AyudapiLogo />
          </Link>

          {/* Navegación de escritorio */}
          <div className="hidden items-center gap-6 text-sm font-medium text-gray-600 md:flex">
            {linksVisibles.map((link) => (
              <Link className={linkClase(link.href)} href={link.href} key={link.href}>
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
                  className="hidden text-gray-400 hover:text-gray-600 transition-colors md:block"
                  onClick={() => void handleLogout()}
                >
                  <LogOut size={16} />
                </button>
                {esMedico ? (
                  <Link
                    className="hidden md:inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                    href="/medico/escanear"
                  >
                    <Stethoscope size={15} /> Panel médico
                  </Link>
                ) : (
                  <Link
                    className="hidden md:inline-flex bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                    href={rolInstitucion ? "/mi-perfil" : "/crear-perfil"}
                  >
                    {rolInstitucion ? "Administrar perfil" : "Editar perfil"}
                  </Link>
                )}
              </>
            ) : (
              <button
                className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                onClick={() => setShowLogin(true)}
              >
                <LogIn size={15} /> Iniciar sesión
              </button>
            )}

            {/* Hamburguesa (solo móvil/tablet) */}
            <button
              aria-expanded={menuOpen}
              aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
              className="md:hidden text-gray-600 hover:text-gray-900 transition-colors"
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Menú desplegable móvil */}
        {menuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white px-4 py-2 shadow-lg">
            <div className="space-y-1">
              {linksVisibles.map((link) => (
                <Link
                  className={cn(
                    "block rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50",
                    pathname === link.href && "bg-blue-50 text-blue-700 font-semibold",
                  )}
                  href={link.href}
                  key={link.href}
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </div>
            <div className="border-t border-gray-100 mt-2 pt-2 space-y-1">
              {session ? (
                <>
                  <p className="px-3 py-1 text-xs text-gray-400 truncate">
                    {esMedico ? "Cuenta con rol médico" : session.user.email}
                  </p>
                  <Link
                    className="block rounded-lg px-3 py-2.5 text-sm font-semibold bg-blue-600 text-white text-center hover:bg-blue-700 transition-colors"
                    href={esMedico ? "/medico/escanear" : "/crear-perfil"}
                    onClick={() => setMenuOpen(false)}
                  >
                    {esMedico ? "Abrir panel médico" : rolInstitucion ? "Administrar perfil" : "Editar perfil"}
                  </Link>
                  <button
                    className="w-full block rounded-lg px-3 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors text-left"
                    onClick={() => void handleLogout()}
                  >
                    <LogOut className="inline mr-1.5" size={14} /> Cerrar sesión
                  </button>
                </>
              ) : (
                <button
                  className="w-full block rounded-lg px-3 py-2.5 text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  onClick={() => {
                    setMenuOpen(false);
                    setShowLogin(true);
                  }}
                >
                  Iniciar sesión
                </button>
              )}
            </div>
          </div>
        )}
      </nav>
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </>
  );
}