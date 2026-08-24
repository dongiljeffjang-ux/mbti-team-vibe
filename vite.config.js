import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // vercel dev(포트 3000)로 /api 요청을 넘겨 로컬에서도 서버리스 함수를 쓴다.
    proxy: { "/api": { target: "http://localhost:3000", changeOrigin: true } },
  },
});
