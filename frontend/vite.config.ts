import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// The sandbox has an opaque origin, so its public modules need anonymous CORS.
const referencePolicy =
  "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "isolated-arduino-reference",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith("/arduino-reference/")) {
            if (req.url.endsWith("/")) req.url += "index.html";
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
            res.setHeader("Referrer-Policy", "no-referrer");
            if (
              req.url.split("?")[0].endsWith("/") ||
              req.url.includes(".html")
            ) {
              res.setHeader("Content-Security-Policy", referencePolicy);
              res.setHeader(
                "Permissions-Policy",
                "camera=(), microphone=(), geolocation=()",
              );
            }
          }
          next();
        });
      },
    },
  ],
  server: { proxy: { "/api": { target: "http://127.0.0.1:8000", ws: true } } },
});
