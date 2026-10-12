import react from "@vitejs/plugin-react-swc";
import path from "path";
import { defineConfig } from "vite";

// build vai pra ../admin (servido em joggpix.com/admin/). A API fica em outra
// origem (VITE_API_URL); no `npm run dev` o proxy manda /api pro servidor local.
export default defineConfig({
  base: "/admin/",
  server: {
    port: 8090,
    proxy: { "/api": { target: "http://localhost:3001" } },
  },
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build: { outDir: "../admin", emptyOutDir: true },
});
