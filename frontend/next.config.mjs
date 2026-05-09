/** @type {import('next').NextConfig} */
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL;
const apiMediaPatterns = (() => {
  if (!apiUrl) return [];
  try {
    const u = new URL(apiUrl);
    const pattern = {
      protocol: u.protocol.replace(":", ""),
      hostname: u.hostname,
      ...(u.port ? { port: u.port } : {}),
      pathname: "/media/**",
    };
    return [pattern];
  } catch {
    return [];
  }
})();

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "127.0.0.1", port: "8000", pathname: "/media/**" },
      { protocol: "http", hostname: "localhost", port: "8000", pathname: "/media/**" },
      ...apiMediaPatterns,
    ],
  },
  async headers() {
    return [
      {
        // Force Telegram (and any proxy) to always fetch latest mini-app HTML
        source: "/mini-app/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
    ];
  },
};

export default nextConfig;
