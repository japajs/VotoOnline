import { defineConfig } from "vitest/config"
import path from "node:path"

// Testes rodam isolados no computador de quem desenvolve (ou na esteira de
// CI) — nunca contra o Supabase de produção. Por isso a primeira leva de
// testes cobre só funções puras (lib/peso.ts, lib/importacao/processor.ts):
// nenhuma delas chama createServerClient(), então não existe conexão de
// banco nenhuma pra simular ou apontar pra outro lugar.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules", ".next"],
  },
})
