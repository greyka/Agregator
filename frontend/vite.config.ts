import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      // backend now runs in host networking (for LAN multicast discovery),
      // so the frontend container reaches it via host.docker.internal.
      "/api": { target: "http://host.docker.internal:8000", changeOrigin: true },
      "/ws": { target: "ws://host.docker.internal:8000", ws: true },
    },
  },
});
