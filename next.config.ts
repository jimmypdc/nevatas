import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
      // Server actions reject requests whose Origin doesn't match the app's
      // host. The default is just the request host; in dev we routinely
      // bounce between localhost / 127.0.0.1 / different ports / tunnels,
      // so list the common ones explicitly. Production additionally accepts
      // APP_URL's host (parsed below).
      allowedOrigins: [
        "localhost:3000",
        "127.0.0.1:3000",
        "localhost:3001",
        "127.0.0.1:3001",
        ...(process.env.APP_URL ? [hostFromUrl(process.env.APP_URL)] : []),
      ].filter(Boolean) as string[],
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

function hostFromUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

export default nextConfig;
