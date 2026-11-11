import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// The sandbox has an opaque origin, so its public modules need anonymous CORS.
const referencePolicy =
  "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "isolated-lab-pages",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = new URL(req.url ?? "/", "http://localhost");
          const workbench = url.pathname.startsWith("/proto-lab/");
          if (workbench || url.pathname.startsWith("/arduino-reference/")) {
            if (url.pathname.endsWith("/")) {
              url.pathname += "index.html";
              req.url = url.pathname + url.search;
            }
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
            res.setHeader("Referrer-Policy", "no-referrer");
            if (
              url.pathname.endsWith(".html")
            ) {
              res.setHeader("Content-Security-Policy", referencePolicy + (workbench ? " allow-downloads" : ""));
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
