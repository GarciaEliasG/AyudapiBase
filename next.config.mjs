/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    const noStore = [
      { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, private" },
      { key: "Pragma", value: "no-cache" },
      { key: "Expires", value: "0" },
    ];
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      // Endpoints de autenticación, perfiles, QR y estudios: nunca cachear
      // (navegador, bfcache ni proxies) para evitar sesiones cruzadas.
      { source: "/api/:path*", headers: noStore },
      // Páginas críticas con datos sensibles o revocables.
      { source: "/mi-perfil", headers: noStore },
      { source: "/crear-perfil", headers: noStore },
      { source: "/medico/:path*", headers: noStore },
      { source: "/e/:path*", headers: noStore },
      { source: "/auth/:path*", headers: noStore },
    ];
  },
};

export default nextConfig;