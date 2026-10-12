import { describe, it, expect, vi, beforeEach } from "vitest"

// verificarSenhaUsuarioAtual é a trava de segurança das exclusões: a senha é
// conferida no servidor (bcrypt) contra o usuário da sessão. Mockamos sessão,
// busca do usuário e o compare do bcrypt para exercitar cada caminho.
const h = vi.hoisted(() => ({
  session: { value: null as null | { email: string } },
  user: { value: null as null | { id: string; email: string; senha_hash: string } },
  compareImpl: (senha: string, _hash: string) => Promise.resolve(senha === "correta"),
}))

vi.mock("@/lib/auth", () => ({ getSession: () => Promise.resolve(h.session.value) }))
vi.mock("@/services/usuarios", () => ({ findUsuarioByEmail: () => Promise.resolve(h.user.value) }))
vi.mock("bcryptjs", () => ({ compare: (s: string, hsh: string) => h.compareImpl(s, hsh) }))

import { verificarSenhaUsuarioAtual } from "@/lib/confirmar-senha"

beforeEach(() => {
  h.session.value = { email: "a@a.com" }
  h.user.value = { id: "u1", email: "a@a.com", senha_hash: "hash" }
  h.compareImpl = (senha) => Promise.resolve(senha === "correta")
})

describe("verificarSenhaUsuarioAtual", () => {
  it("recusa senha vazia (sem nem consultar o usuário)", async () => {
    const r = await verificarSenhaUsuarioAtual("")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.toLowerCase()).toContain("senha")
  })

  it("recusa quando não há sessão", async () => {
    h.session.value = null
    const r = await verificarSenhaUsuarioAtual("correta")
    expect(r.ok).toBe(false)
  })

  it("recusa quando o usuário não é encontrado", async () => {
    h.user.value = null
    const r = await verificarSenhaUsuarioAtual("correta")
    expect(r.ok).toBe(false)
  })

  it("recusa senha incorreta", async () => {
    const r = await verificarSenhaUsuarioAtual("errada")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/incorreta/i)
  })

  it("aceita a senha correta", async () => {
    const r = await verificarSenhaUsuarioAtual("correta")
    expect(r.ok).toBe(true)
  })
})
