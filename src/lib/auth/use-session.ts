"use client";

import type { Session } from "@supabase/supabase-js";

import { useEffect, useState } from "react";

import { notificarActividadSesion } from "@/lib/auth/actividad";
import { MODO_GOOGLE_KEY, RUTA_DESTINO_KEY } from "@/lib/auth/destino";
import {
  marcarPestanaActiva,
  pestanaYaMarcada,
} from "@/lib/auth/persistencia-sesion";
import { createBrowserClient } from "@/lib/supabase/browser";

/**
 * Sesión actual del navegador.
 *
 * Política de persistencia: si al montar no hay marcador de pestaña en
 * `sessionStorage` (pestaña nueva tras cerrar el navegador/pestaña) pero sí
 * una sesión persistida en cookies, esa sesión heredada se destruye con
 * `signOut()` y se informa `null`. Las recargas conservan el marcador y no
 * cierran sesión. Todo el flujo es tolerante a fallos: ante cualquier error
 * se continúa sin sesión heredada en lugar de romper la UI.
 */
export function useSession() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let active = true;
    const client = createBrowserClient();

    void (async () => {
      try {
        const { data } = await client.auth.getSession();
        if (!active) {
          return;
        }
        if (data.session && !pestanaYaMarcada()) {
          // Pestaña nueva con sesión heredada: se destruye por política de
          // seguridad (cierre previo de pestaña/navegador).
          try {
            await client.auth.signOut();
          } catch {
            // Si el cierre falla, igual se informa sin sesión.
          }
          if (!active) {
            return;
          }
          setSession(null);
        } else {
          setSession(data.session);
        }
      } catch {
        if (active) {
          setSession(null);
        }
      } finally {
        marcarPestanaActiva();
        if (active) {
          setLoading(false);
        }
      }
    })();

    const { data: subscription } = client.auth.onAuthStateChange((event, next) => {
      if (!active) {
        return;
      }
      if (event === "SIGNED_OUT") {
        // Cambio de sesión: se purgan intenciones pendientes del usuario
        // anterior (destino post-login, modo OAuth) para que el siguiente
        // login no reanude su flujo ni muestre pantallas precargadas.
        try {
          window.sessionStorage.removeItem(RUTA_DESTINO_KEY);
          window.sessionStorage.removeItem(MODO_GOOGLE_KEY);
        } catch {
          // Sin storage no hay nada que purgar.
        }
        setSession(null);
        setLoading(false);
        return;
      }
      setSession(next);
      setLoading(false);
      if (event === "SIGNED_IN" && next) {
        // Red de seguridad: notifica el inicio de sesión (el servidor
        // deduplica por ventana temporal, así que reintentos no duplican).
        marcarPestanaActiva();
        void notificarActividadSesion(next.access_token, "inicio_sesion");
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return { loading, session };
}
