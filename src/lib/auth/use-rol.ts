"use client";

import { useEffect, useState } from "react";

import type { RolUsuario } from "@/lib/supabase/database";

import { apiFetch } from "@/lib/api/client";
import { useSession } from "@/lib/auth/use-session";

interface RolState {
  role: RolUsuario | null;
  userId: string;
}

/**
 * Expone el rol del usuario autenticado en el cliente. Mientras se resuelve el
 * rol de la sesión actual, `loading` sigue en true para evitar destellos de
 * interfaz con el rol incorrecto.
 */
export function useRol() {
  const { loading: loadingSession, session } = useSession();
  const [rolState, setRolState] = useState<RolState | null>(null);

  useEffect(() => {
    if (!session) return;
    let active = true;

    apiFetch<{ rol: RolUsuario | null }>("/api/auth/rol", session)
      .then((res) => {
        if (active) {
          setRolState({ role: res.rol ?? null, userId: session.user.id });
        }
      })
      .catch(() => {
        if (active) {
          setRolState({ role: null, userId: session.user.id });
        }
      });

    return () => {
      active = false;
    };
  }, [session]);

  const loading =
    loadingSession || (session !== null && rolState?.userId !== session.user.id);
  const rol =
    session && rolState?.userId === session.user.id ? rolState.role : null;

  return { loading, rol, session };
}