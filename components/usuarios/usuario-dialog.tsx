"use client"

import { useState, useTransition } from "react"
import { Plus, Loader2, Pencil } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { createUsuarioAction, updateUsuarioAction } from "@/app/actions/usuarios"
import type { Condominio, Usuario, UserPerfil } from "@/types"

const PERFIL_OPCOES: { value: UserPerfil; label: string }[] = [
  { value: "administrador", label: "Administrador" },
  { value: "operador", label: "Operador" },
  { value: "visualizador", label: "Visualizador" },
]

interface Props {
  condominios: Condominio[]
  usuario?: Usuario
  condominiosAutorizadosIniciais?: string[]
}

export function UsuarioDialog({ condominios, usuario, condominiosAutorizadosIniciais }: Props) {
  const editando = !!usuario
  const [open, setOpen] = useState(false)
  const [nome, setNome] = useState(usuario?.nome ?? "")
  const [email, setEmail] = useState(usuario?.email ?? "")
  const [cpf, setCpf] = useState(usuario?.cpf ?? "")
  const [celular, setCelular] = useState(usuario?.celular ?? "")
  const [senha, setSenha] = useState("")
  const [perfil, setPerfil] = useState<UserPerfil>(usuario?.perfil ?? "operador")
  // MASTER = acesso total; PESSOAL = restrito aos condomínios marcados abaixo.
  const [tipoAcesso, setTipoAcesso] = useState<"master" | "pessoal">(
    usuario && !usuario.acesso_total ? "pessoal" : "master"
  )
  const [condominioIds, setCondominioIds] = useState<Set<string>>(
    new Set(condominiosAutorizadosIniciais ?? [])
  )
  const [isPending, startTransition] = useTransition()

  function reset() {
    setNome(usuario?.nome ?? "")
    setEmail(usuario?.email ?? "")
    setCpf(usuario?.cpf ?? "")
    setCelular(usuario?.celular ?? "")
    setSenha("")
    setPerfil(usuario?.perfil ?? "operador")
    setTipoAcesso(usuario && !usuario.acesso_total ? "pessoal" : "master")
    setCondominioIds(new Set(condominiosAutorizadosIniciais ?? []))
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset()
  }

  function toggleCondominio(id: string) {
    setCondominioIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSubmit() {
    startTransition(async () => {
      const input = {
        nome,
        email,
        cpf,
        celular,
        perfil,
        acessoTotal: tipoAcesso === "master",
        condominioIds: [...condominioIds],
      }
      const result = editando
        ? await updateUsuarioAction(usuario!.id, input)
        : await createUsuarioAction({ ...input, senha })

      if (result.success) {
        toast.success(editando ? "Usuário atualizado." : "Usuário criado com sucesso.")
        handleOpenChange(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  const canSubmit =
    nome.trim() &&
    email.trim() &&
    (editando || senha.length >= 8) &&
    (tipoAcesso === "master" || condominioIds.size > 0)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          editando ? (
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" />
          ) : (
            <Button size="sm" />
          )
        }
      >
        {editando ? (
          <>
            <Pencil className="h-3.5 w-3.5" />
            <span className="sr-only">Editar usuário</span>
          </>
        ) : (
          <>
            <Plus className="h-4 w-4" />
            Novo usuário
          </>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar usuário" : "Novo usuário"}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-4 overflow-y-auto px-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="usr-nome">Nome</Label>
              <Input id="usr-nome" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="usr-email">E-mail</Label>
              <Input
                id="usr-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="usr-cpf">CPF</Label>
              <Input id="usr-cpf" value={cpf} onChange={(e) => setCpf(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="usr-celular">Celular</Label>
              <Input
                id="usr-celular"
                placeholder="(64) 98146-9800"
                value={celular}
                onChange={(e) => setCelular(e.target.value)}
              />
            </div>
            {!editando && (
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="usr-senha">Senha</Label>
                <PasswordInput
                  id="usr-senha"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="usr-perfil">Permissão</Label>
            <select
              id="usr-perfil"
              value={perfil}
              onChange={(e) => setPerfil(e.target.value as UserPerfil)}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            >
              {PERFIL_OPCOES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Acesso aos condomínios
            </Label>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setTipoAcesso("master")}
                className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium ${tipoAcesso === "master" ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}
              >
                MASTER — todos os condomínios
              </button>
              <button
                type="button"
                onClick={() => setTipoAcesso("pessoal")}
                className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium ${tipoAcesso === "pessoal" ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}
              >
                PESSOAL — só os selecionados
              </button>
            </div>

            {tipoAcesso === "pessoal" && (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border/40 bg-background p-2">
                {condominios.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum condomínio cadastrado.</p>
                ) : (
                  condominios.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-accent/40">
                      <input
                        type="checkbox"
                        checked={condominioIds.has(c.id)}
                        onChange={() => toggleCondominio(c.id)}
                        className="accent-primary"
                      />
                      {c.nome}
                    </label>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !canSubmit} className="gap-2">
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {editando ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
