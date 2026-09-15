"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import { createBrowserClient } from "@/lib/supabase/browser";
import { perfilPacienteCompleto } from "@/lib/validation/profile";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    let activo = true;
    void (async () => {
      const client = createBrowserClient();
      const code = searchParams.get("code");

      let accessToken: string | null = null;
      if (code) {
        const { data, error } = await client.auth.exchangeCodeForSession(code);
        if (!error) {
          accessToken = data.session?.access_token ?? null;
        }
      } else {
        const { data } = await client.auth.getSession();
        accessToken = data.session?.access_token ?? null;
      }

      if (!activo) {
        return;
      }
      if (!accessToken) {
        router.replace("/");
        return;
      }

      try {
        const res = await fetch("/api/profile", {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        });
        const payload = (await res.json()) as {
          error?: { message?: string };
          perfil?: {
            alias?: string | null;
            fecha_nacimiento?: string | null;
            genero?: string | null;
            grupo_sanguineo?: string | null;
          } | null;
          rol?: string | null;
        };
        if (!res.ok) {
          throw new Error(payload.error?.message ?? "No se pudo leer el perfil.");
        }

        if (!activo) {
          return;
        }
        if (payload.rol === "paciente") {
          router.replace(
            perfilPacienteCompleto(payload.perfil ?? {}) ? "/mi-perfil" : "/crear-perfil",
          );
        } else {
          router.replace("/mi-perfil");
        }
      } catch {
        if (activo) {
          router.replace("/mi-perfil");
        }
      }
    })();

    return () => {
      activo = false;
    };
  }, [router, searchParams]);

  return (
    <div className="text-center">
      <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
      <p className="text-sm font-semibold text-gray-600">Preparando tu perfil…</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Suspense>
        <CallbackContent />
      </Suspense>
    </div>
  );
}