"use client"

import { useState, useTransition } from "react"
import { Plus, X, Loader2 } from "lucide-react"
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
import { Label } from "@/components/ui/label"
import { createProprietarioAction } from "@/app/actions/proprietarios"

interface CriarProprietarioDialogProps {
  condominioId: string
}

export function CriarProprietarioDialog({ condominioId }: CriarProprietarioDialogProps) {
  const [open, setOpen] = useState(false)
  const [nome, setNome] = useState("")
  const [email, setEmail] = useState("")
  const [cpf, setCpf] = useState("")
  const [telefone, setTelefone] = useState("")
  const [conjuge, setConjuge] = useState("")
  const [unidades, setUnidades] = useState<string[]>([""])
  // Aviso de homônimo: nome do proprietário já existente no condomínio quando o
  // servidor sinaliza possível duplicata (ver createProprietarioAction). Null =
  // sem aviso. Quando setado, a tela pede confirmação ("Cadastrar assim mesmo")
  // em vez de criar direto.
  const [avisoDuplicado, setAvisoDuplicado] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function reset() {
    setNome("")
    setEmail("")
    setCpf("")
    setTelefone("")
    setConjuge("")
    setUnidades([""])
    setAvisoDuplicado(null)
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset()
  }

  function addUnidade() {
    setUnidades((prev) => [...prev, ""])
  }

  function setUnidadeAt(index: number, value: string) {
    setUnidades((prev) => prev.map((u, i) => (i === index ? value : u)))
  }

  function removeUnidade(index: number) {
    setUnidades((prev) => prev.filter((_, i) => i !== index))
  }

  // permitirHomonimo só vira true quando o operador confirma na tela que é mesmo
  // outra pessoa com o nome igual (botão "Cadastrar assim mesmo"). No clique
  // normal ("Criar") vai false, então o servidor barra a duplicata e devolve o
  // aviso.
  function handleSubmit(permitirHomonimo = false) {
    startTransition(async () => {
      const result = await createProprietarioAction({
        condominio_id: condominioId,
        nome,
        email,
        cpf,
        telefone,
        conjuge,
        unidades: unidades.filter((u) => u.trim()),
        permitirHomonimo,
      })
      if (result.success) {
        toast.success("Proprietário criado com sucesso.")
        handleOpenChange(false)
      } else if (result.duplicado && result.nomeExistente) {
        // Possível duplicata por nome: não cria de cara — mostra o aviso e
        // deixa o operador decidir (cancelar ou confirmar que é outra pessoa).
        setAvisoDuplicado(result.nomeExistente)
      } else {
        toast.error(result.error)
      }
    })
  }

  // E-mail OU CPF: o condômino que vota pelo link presencial entra por unidade
  // + CPF; quem recebe convite por e-mail usa o e-mail. Pelo menos um é preciso.
  const canSubmit = nome.trim() && (email.trim() || cpf.trim())

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Plus className="h-4 w-4" />
        Novo proprietário / procurador
      </DialogTrigger>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Novo proprietário / procurador</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nome-prop">Nome</Label>
            <Input
              id="nome-prop"
              placeholder="Nome completo"
              value={nome}
              // Nome não tem números — remove dígitos conforme digita (Carlos).
              // Mexer no nome descarta o aviso de homônimo (nome mudou → precisa
              // checar de novo; se ficou diferente, o botão volta a ser "Criar").
              onChange={(e) => {
                setNome(e.target.value.replace(/[0-9]/g, ""))
                if (avisoDuplicado) setAvisoDuplicado(null)
              }}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cpf-prop">CPF</Label>
            <Input
              id="cpf-prop"
              inputMode="numeric"
              placeholder="Somente números"
              value={cpf}
              // CPF só tem dígitos — remove não-números e limita a 11 (Carlos).
              onChange={(e) => setCpf(e.target.value.replace(/\D/g, "").slice(0, 11))}
            />
            <p className="text-xs text-muted-foreground">
              Chave de acesso ao link de voto (o condômino entra com a unidade + o CPF).
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email-prop">
              E-mail <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="email-prop"
              type="email"
              placeholder="email@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="telefone-prop">
              Celular <span className="text-muted-foreground font-normal">(opcional)</span>
            </Label>
            <Input
              id="telefone-prop"
              type="tel"
              placeholder="(64) 98146-9800"
              value={telefone}
              // Celular não tem letras — mantém só dígitos e pontuação de
              // telefone, bloqueia letras conforme digita (Carlos).
              onChange={(e) => setTelefone(e.target.value.replace(/[^\d()+\-\s]/g, ""))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="conjuge-prop">
              Cônjuge / 2º participante{" "}
              <span className="text-muted-foreground font-normal">(opcional)</span>
            </Label>
            <Input
              id="conjuge-prop"
              placeholder="Nome do cônjuge (co-dono que costuma comparecer)"
              value={conjuge}
              onChange={(e) => setConjuge(e.target.value.replace(/[0-9]/g, ""))}
            />
            <p className="text-xs text-muted-foreground">
              Na assembleia, vira um atalho para anotar quem participou pelo imóvel.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Unidades (imóveis)</Label>
              <button
                type="button"
                onClick={addUnidade}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Plus className="h-3 w-3" />
                Adicionar
              </button>
            </div>
            <div className="space-y-1.5">
              {unidades.map((u, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder={`Ex.: 101`}
                    value={u}
                    onChange={(e) => setUnidadeAt(i, e.target.value)}
                    className="h-8 text-sm"
                  />
                  {unidades.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeUnidade(i)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Quantidade de votos deste proprietário, calculada automaticamente pelo número de
              unidades vinculadas.
            </p>
          </div>
        </div>

        {/* Aviso de homônimo: já existe alguém com este nome no condomínio.
            Não bloqueia de vez (pode ser outra pessoa com o mesmo nome) — deixa
            cancelar (se for duplicata) ou confirmar (se for outra pessoa). */}
        {avisoDuplicado && (
          <div className="rounded-lg border border-amber-400/60 bg-amber-500/10 px-3 py-2.5">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              Já existe “{avisoDuplicado}” neste condomínio.
            </p>
            <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
              Se for a mesma pessoa, cancele para não duplicar. Se for outra pessoa com o mesmo nome,
              confirme abaixo.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          {avisoDuplicado ? (
            <Button
              onClick={() => handleSubmit(true)}
              disabled={isPending || !canSubmit}
              className="gap-2 bg-amber-600 text-white hover:bg-amber-700"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Cadastrar assim mesmo
            </Button>
          ) : (
            <Button onClick={() => handleSubmit(false)} disabled={isPending || !canSubmit} className="gap-2">
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
