import { describe, it, expect, vi } from "vitest"

// rate-limit importa o cliente Supabase no topo; mockamos pra o teste das
// chaves (puras) não depender de env/DB.
vi.mock("@/lib/supabase/server", () => ({ createServerClient: () => ({}) }))

import { rateLimitKey } from "@/lib/rate-limit"

describe("rateLimitKey — contagem que não bloqueia condôminos no mesmo IP", () => {
  it("entrada: unidades diferentes no MESMO IP geram chaves diferentes (não compartilham balde)", () => {
    const ip = "200.1.2.3"
    expect(rateLimitKey.entrada(ip, "a101")).not.toBe(rateLimitKey.entrada(ip, "a102"))
  })

  it("entrada: a MESMA unidade no mesmo IP gera a mesma chave (brute-force de CPF segue limitado)", () => {
    const ip = "200.1.2.3"
    expect(rateLimitKey.entrada(ip, "a101")).toBe(rateLimitKey.entrada(ip, "a101"))
  })

  it("entrada: unidade vazia (null) usa um marcador estável", () => {
    expect(rateLimitKey.entrada("200.1.2.3", null)).toBe("entrar:200.1.2.3:?")
  })

  it("abrir voto: tokens diferentes geram chaves diferentes", () => {
    expect(rateLimitKey.votoView("tok-A")).not.toBe(rateLimitKey.votoView("tok-B"))
  })

  it("enviar voto: envios diferentes geram chaves diferentes", () => {
    expect(rateLimitKey.votoSubmit("send-A")).not.toBe(rateLimitKey.votoSubmit("send-B"))
  })
})
