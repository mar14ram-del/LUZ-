import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 重要：base 要換成「/你的 repo 名稱/」，例如 repo 叫 salon-app 就寫 '/salon-app/'
// 如果你是用「使用者名稱.github.io」這種根網域的 repo，base 保持 '/' 就好
export default defineConfig({
  plugins: [react()],
  base: "/LUZ-/",
});
