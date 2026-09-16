import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * URL base del sitio. Prioridad:
 * 1. `NEXT_PUBLIC_SITE_URL` (para fijar el dominio de producción en Vercel).
 * 2. `VERCEL_PROJECT_PRODUCTION_URL` (solo cuando la variable de preview existe).
 * 3. `VERCEL_URL` (deployments de preview en Vercel).
 * 4. `http://localhost:3000` (desarrollo local).
 */
export function getSiteUrl(): string {
  const explícita = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explícita) {
    return explícita.replace(/\/+$/, "");
  }
  const proyectoVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (proyectoVercel) {
    return `https://${proyectoVercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  }
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  }
  return "http://localhost:3000";
}