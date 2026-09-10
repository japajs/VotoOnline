"use client"

import { useState, useTransition } from "react"
import { Pencil, History, AlertTriangle, Lock, ArrowRightLeft, Link2, Users, X, Loader2 } from "lucide-react"
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
import { Textarea } from "@/components/ui/textarea"
import {
  updateProprietarioAction,
  updateCpfProprietarioAction,
  transferUnidadeAction,
  updateFracaoIdealAction,
} from "@/app/actions/proprietarios"
import {
  getCoproprietariosPorUnidadesAction,
  createCoproprietarioAction,
  deleteCoproprietarioAction,
} from "@/app/actions/coproprietarios"
import { formatUnidade } from "@/lib/unidade-format"
import type { Proprietario, CriterioPeso, CoproprietarioComNome } from "@/types"

interface Props {
  proprietario: Proprietario
  condominioId: string
  todosProprietarios: Proprietario[]
  jaVotou: boolean
  isAdmin: boolean
  // Só mostra o campo de fração ideal quando o condomínio realmente usa
  // esse critério de peso — evita confundir quem vota por unidade.
  criterioPeso: CriterioPeso
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// Achado de auditoria LGPD: o CPF/CNPJ aparecia em texto puro pra qualquer
// perfil que conseguisse abrir este diálogo — só a EDIÇÃO já era restrita a
// administrador (isAdmin), a LEITURA não. Mascara para quem não é admin,
// mostrando só os últimos 4 dígitos.
function maskCpf(valor: string): string {
  const digitos = valor.replace(/\D/g, "")
  if (digitos.length <= 4) return "•".repeat(valor.length)
  const visiveis = digitos.slice(-4)
  return `${"•".repeat(digitos.length - 4)}${visiveis}`
}

// Painel com título + ícone, usado para separar visualmente "Editar
// cadastro", "Transferência de unidade" e "Vincular unidade" — três ações
// com objetivos diferentes que antes ficavam só divididas por uma linha.
function Secao({
  icon: Icon,
  titulo,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  titulo: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-3.5">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {titulo}
        </Label>
      </div>
      {children}
    </div>
  )
}

export function EditarProprietarioDialog({
  proprietario,
  condominioId,
  todosProprietarios,
  jaVotou,
  isAdmin,
  criterioPeso,
}: Props) {
  const [open, setOpen] = useState(false)

  const [fracaoIdealPorUnidade, setFracaoIdealPorUnidade] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        (proprietario.unidades ?? []).map((u) => [u.id, u.fracao_ideal?.toString() ?? ""])
      )
  )
  const [salvandoFracaoId, setSalvandoFracaoId] = useState<string | null>(null)
  const [, startTransitionFracao] = useTransition()

  function handleSalvarFracaoIdeal(unidadeId: string) {
    const bruto = fracaoIdealPorUnidade[unidadeId]?.trim() ?? ""
    const valor = bruto === "" ? null : Number(bruto.replace(",", "."))
    if (valor !== null && Number.isNaN(valor)) {
      toast.error("Fração ideal inválida.")
      return
    }
    setSalvandoFracaoId(unidadeId)
    startTransitionFracao(async () => {
      const result = await updateFracaoIdealAction(unidadeId, condominioId, valor)
      setSalvandoFracaoId(null)
      if (result.success) {
        toast.success("Fração ideal salva.")
      } else {
        toast.error(result.error)
      }
    })
  }

  const [nome, setNome] = useState(proprietario.nome)
  const [email, setEmail] = useState(proprietario.email ?? "")
  const [telefone, setTelefone] = useState(proprietario.telefone ?? "")
  const [observacoes, setObservacoes] = useState(proprietario.observacoes ?? "")
  const [inadimplente, setInadimplente] = useState(proprietario.inadimplente)

  // Campo-chave (item 6): CPF/CNPJ não é editado junto com o resto do
  // cadastro — fica bloqueado por padrão, com uma ação administrativa
  // separada e explícita para alterá-lo.
  const [mostrarAlterarCpf, setMostrarAlterarCpf] = useState(false)
  const [novoCpfAdmin, setNovoCpfAdmin] = useState(proprietario.cpf ?? "")
  const [confirmarAlterarCpf, setConfirmarAlterarCpf] = useState(false)

  const [transferindoUnidadeId, setTransferindoUnidadeId] = useState<string | null>(null)
  const [destinoTipo, setDestinoTipo] = useState<"existente" | "novo">("existente")
  const [destinoProprietarioId, setDestinoProprietarioId] = useState("")
  const [novoNome, setNovoNome] = useState("")
  const [novoEmail, setNovoEmail] = useState("")
  const [novoTelefone, setNovoTelefone] = useState("")

  const [vincularUnidadeId, setVincularUnidadeId] = useState("")

  // Auditoria de assembleias — Fase 9: coproprietários são puramente
  // informativos (ver services/coproprietarios.ts) — carregados sob
  // demanda, ao abrir o diálogo, um por unidade deste proprietário.
  const [coproprietariosPorUnidade, setCoproprietariosPorUnidade] = useState<
    Record<string, CoproprietarioComNome[]>
  >({})
  const [carregandoCoproprietarios, setCarregandoCoproprietarios] = useState(false)
  const [novoCoprop, setNovoCoprop] = useState<Record<string, string>>({})
  const [isPendingCoprop, startCoproprietarioTransition] = useTransition()
  const [removendoCoprop, setRemovendoCoprop] = useState<string | null>(null)

  const [isPendingSalvar, startSalvarTransition] = useTransition()
  const [isPendingCpf, startCpfTransition] = useTransition()
  const [isPendingTransferir, startTransferirTransition] = useTransition()
  const [isPendingVincular, startVincularTransition] = useTransition()

  // Sincroniza os campos sempre que os dados do proprietário mudarem (ex.:
  // após uma transferência revalidar a página) — o modal fica aberto entre
  // ações para permitir várias correções na mesma sessão. Ajuste de estado
  // durante a renderização (não em um efeito), como recomendado pelo React
  // para "resetar estado quando uma prop muda".
  const [proprietarioSincronizado, setProprietarioSincronizado] = useState(proprietario)
  if (proprietarioSincronizado !== proprietario) {
    setProprietarioSincronizado(proprietario)
    setNome(proprietario.nome)
    setEmail(proprietario.email ?? "")
    setTelefone(proprietario.telefone ?? "")
    setObservacoes(proprietario.observacoes ?? "")
    setInadimplente(proprietario.inadimplente)
    setNovoCpfAdmin(proprietario.cpf ?? "")
  }

  function carregarCoproprietarios() {
    const unidadeIds = (proprietario.unidades ?? []).map((u) => u.id)
    if (unidadeIds.length === 0) {
      setCoproprietariosPorUnidade({})
      return
    }
    setCarregandoCoproprietarios(true)
    getCoproprietariosPorUnidadesAction(unidadeIds, condominioId).then((result) => {
      setCarregandoCoproprietarios(false)
      if (result.success) {
        setCoproprietariosPorUnidade(result.porUnidade)
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      carregarCoproprietarios()
    } else {
      setMostrarAlterarCpf(false)
      setConfirmarAlterarCpf(false)
      setTransferindoUnidadeId(null)
      setVincularUnidadeId("")
      setNovoCoprop({})
    }
  }

  function handleAdicionarCoproprietario(unidadeId: string) {
    const proprietarioId = novoCoprop[unidadeId]
    if (!proprietarioId) return
    startCoproprietarioTransition(async () => {
      const result = await createCoproprietarioAction(unidadeId, proprietarioId, condominioId)
      if (result.success) {
        toast.success("Coproprietário registrado.")
        setNovoCoprop((prev) => ({ ...prev, [unidadeId]: "" }))
        carregarCoproprietarios()
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleRemoverCoproprietario(id: string) {
    setRemovendoCoprop(id)
    startCoproprietarioTransition(async () => {
      const result = await deleteCoproprietarioAction(id, condominioId)
      setRemovendoCoprop(null)
      if (result.success) {
        toast.success("Coproprietário removido.")
        carregarCoproprietarios()
      } else {
        toast.error(result.error)
      }
    })
  }

  const algumCampoMudou =
    nome.trim() !== proprietario.nome ||
    (email.trim() || null) !== (proprietario.email ?? null) ||
    (telefone.trim() || null) !== (proprietario.telefone ?? null) ||
    (observacoes.trim() || null) !== (proprietario.observacoes ?? null) ||
    inadimplente !== proprietario.inadimplente
  const canSalvar = algumCampoMudou && nome.trim().length > 0

  function handleSalvarDados() {
    startSalvarTransition(async () => {
      const result = await updateProprietarioAction({
        id: proprietario.id,
        condominioId,
        nome,
        email,
        telefone,
        observacoes,
        inadimplente,
      })
      if (result.success) {
        toast.success("Cadastro atualizado.")
      } else {
        toast.error(result.error)
      }
    })
  }

  const cpfMudou = (novoCpfAdmin.trim() || "") !== (proprietario.cpf ?? "")
  const canSalvarCpf = confirmarAlterarCpf && cpfMudou

  function handleSalvarCpf() {
    startCpfTransition(async () => {
      const result = await updateCpfProprietarioAction({
        id: proprietario.id,
        condominioId,
        novoCpf: novoCpfAdmin,
        confirmar: confirmarAlterarCpf,
      })
      if (result.success) {
        toast.success("CPF/CNPJ atualizado.")
        setMostrarAlterarCpf(false)
        setConfirmarAlterarCpf(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  const outrosProprietarios = todosProprietarios.filter((p) => p.id !== proprietario.id)
  const unidadesDeOutros = outrosProprietarios.flatMap((p) =>
    (p.unidades ?? []).map((u) => ({ ...u, proprietarioNome: p.nome }))
  )

  function handleTransferir() {
    if (!transferindoUnidadeId) return
    startTransferirTransition(async () => {
      const result = await transferUnidadeAction({
        unidadeId: transferindoUnidadeId,
        condominioId,
        novoProprietarioId: destinoTipo === "existente" ? destinoProprietarioId : undefined,
        novoProprietario:
          destinoTipo === "novo"
            ? { nome: novoNome, email: novoEmail, telefone: novoTelefone }
            : undefined,
      })
      if (result.success) {
        toast.success("Unidade transferida.")
        setTransferindoUnidadeId(null)
        setDestinoProprietarioId("")
        setNovoNome("")
        setNovoEmail("")
        setNovoTelefone("")
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleVincular() {
    if (!vincularUnidadeId) return
    startVincularTransition(async () => {
      const result = await transferUnidadeAction({
        unidadeId: vincularUnidadeId,
        condominioId,
        novoProprietarioId: proprietario.id,
      })
      if (result.success) {
        toast.success("Unidade vinculada.")
        setVincularUnidadeId("")
      } else {
        toast.error(result.error)
      }
    })
  }

  const transferDestinoValido =
    destinoTipo === "existente" ? !!destinoProprietarioId : novoNome.trim() && novoEmail.trim()

  const historico = [...proprietario.historico_alteracoes].reverse()

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground"
          />
        }
      >
        <Pencil className="h-3.5 w-3.5" />
        <span className="sr-only">Editar Cadastro</span>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar Cadastro</DialogTitle>
        </DialogHeader>

        <div className="max-h-[68vh] overflow-y-auto space-y-4 px-1">
          {/* ── Editar cadastro ──────────────────────────────────────── */}
          <Secao icon={Pencil} titulo="Editar cadastro">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-nome">Nome</Label>
                <Input id="edit-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-email">E-mail</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-telefone">Celular</Label>
                <Input
                  id="edit-telefone"
                  placeholder="(64) 98146-9800"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                />
              </div>

              {/* Campo-chave: CPF/CNPJ nunca é editado aqui — só exibido,
                  bloqueado, com uma ação administrativa separada abaixo. */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-cpf" className="flex items-center gap-1.5">
                  CPF/CNPJ
                  <Lock className="h-3 w-3 text-muted-foreground/70" />
                </Label>
                <Input
                  id="edit-cpf"
                  value={proprietario.cpf ? (isAdmin ? proprietario.cpf : maskCpf(proprietario.cpf)) : ""}
                  disabled
                  placeholder="Não cadastrado"
                  className="disabled:opacity-70"
                />
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => setMostrarAlterarCpf((v) => !v)}
                    className="text-xs text-primary hover:underline"
                  >
                    {mostrarAlterarCpf ? "Cancelar alteração de CPF/CNPJ" : "Alterar CPF/CNPJ…"}
                  </button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    A alteração de CPF/CNPJ requer perfil administrador.
                  </p>
                )}

                {mostrarAlterarCpf && (
                  <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
                    <div className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        Esta é uma ação administrativa: altera a identidade legal do
                        proprietário{jaVotou ? " e ele já votou em alguma assembleia" : ""}. Use
                        apenas para corrigir um cadastro incorreto.
                      </span>
                    </div>
                    <Input
                      value={novoCpfAdmin}
                      onChange={(e) => setNovoCpfAdmin(e.target.value)}
                      placeholder="Novo CPF/CNPJ"
                      className="h-9 text-xs"
                    />
                    <label className="flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={confirmarAlterarCpf}
                        onChange={(e) => setConfirmarAlterarCpf(e.target.checked)}
                        className="accent-primary"
                      />
                      Confirmo que desejo alterar o CPF/CNPJ deste proprietário.
                    </label>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      disabled={isPendingCpf || !canSalvarCpf}
                      onClick={handleSalvarCpf}
                    >
                      {isPendingCpf ? "Salvando…" : "Confirmar alteração de CPF/CNPJ"}
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-obs">Observações</Label>
                <Textarea
                  id="edit-obs"
                  rows={2}
                  className="resize-none bg-background"
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={inadimplente}
                  onChange={(e) => setInadimplente(e.target.checked)}
                  className="accent-primary"
                />
                Inadimplente
                <span className="text-xs font-normal text-muted-foreground">
                  (impede votar — Código Civil)
                </span>
              </label>

              <Button
                onClick={handleSalvarDados}
                disabled={isPendingSalvar || !canSalvar}
                className="w-full"
              >
                {isPendingSalvar ? "Salvando…" : "Salvar dados cadastrais"}
              </Button>
            </div>
          </Secao>

          {/* ── Transferência de unidade ─────────────────────────────── */}
          <Secao icon={ArrowRightLeft} titulo="Transferência de unidade">
            <div className="space-y-2">
              {(proprietario.unidades ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhuma unidade vinculada.</p>
              )}
              {(proprietario.unidades ?? []).map((u) => (
                <div key={u.id} className="rounded-lg border border-border/60 bg-background p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{formatUnidade(u)}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setTransferindoUnidadeId(transferindoUnidadeId === u.id ? null : u.id)
                      }
                      className="text-xs text-primary hover:underline"
                    >
                      {transferindoUnidadeId === u.id ? "Cancelar" : "Transferir…"}
                    </button>
                  </div>

                  {criterioPeso === "fracao_ideal" && (
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor={`fracao-${u.id}`} className="text-xs text-muted-foreground shrink-0">
                        Fração ideal
                      </Label>
                      <Input
                        id={`fracao-${u.id}`}
                        inputMode="decimal"
                        placeholder="ex.: 0.014235"
                        className="h-7 text-xs"
                        value={fracaoIdealPorUnidade[u.id] ?? ""}
                        onChange={(e) =>
                          setFracaoIdealPorUnidade((prev) => ({ ...prev, [u.id]: e.target.value }))
                        }
                        onBlur={() => {
                          const original = u.fracao_ideal?.toString() ?? ""
                          if ((fracaoIdealPorUnidade[u.id] ?? "") !== original) {
                            handleSalvarFracaoIdeal(u.id)
                          }
                        }}
                        disabled={salvandoFracaoId === u.id}
                      />
                    </div>
                  )}

                  {transferindoUnidadeId === u.id && (
                    <div className="space-y-2 rounded-md bg-muted/30 p-2">
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDestinoTipo("existente")}
                          className={`flex-1 rounded-md border px-2 py-1 text-xs ${destinoTipo === "existente" ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}
                        >
                          Proprietário existente
                        </button>
                        <button
                          type="button"
                          onClick={() => setDestinoTipo("novo")}
                          className={`flex-1 rounded-md border px-2 py-1 text-xs ${destinoTipo === "novo" ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}
                        >
                          Novo proprietário
                        </button>
                      </div>

                      {destinoTipo === "existente" ? (
                        <select
                          value={destinoProprietarioId}
                          onChange={(e) => setDestinoProprietarioId(e.target.value)}
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                        >
                          <option value="">Selecione o novo proprietário…</option>
                          {outrosProprietarios.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nome}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="space-y-1.5">
                          <Input
                            placeholder="Nome"
                            value={novoNome}
                            onChange={(e) => setNovoNome(e.target.value)}
                            className="h-9 text-xs"
                          />
                          <Input
                            placeholder="E-mail"
                            value={novoEmail}
                            onChange={(e) => setNovoEmail(e.target.value)}
                            className="h-9 text-xs"
                          />
                          <Input
                            placeholder="Celular (opcional)"
                            value={novoTelefone}
                            onChange={(e) => setNovoTelefone(e.target.value)}
                            className="h-9 text-xs"
                          />
                        </div>
                      )}

                      <Button
                        size="sm"
                        className="w-full"
                        disabled={isPendingTransferir || !transferDestinoValido}
                        onClick={handleTransferir}
                      >
                        {isPendingTransferir ? "Transferindo…" : "Confirmar transferência"}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Secao>

          {/* ── Coproprietários ───────────────────────────────────────── */}
          {(proprietario.unidades ?? []).length > 0 && (
            <Secao icon={Users} titulo="Coproprietários">
              <p className="text-xs text-muted-foreground">
                Registro apenas informativo (ex.: cônjuge, herdeiros) — não altera quem vota pela
                unidade nem o peso do voto. Para um coproprietário votar de fato, use Procurações
                na assembleia.
              </p>
              {carregandoCoproprietarios ? (
                <div className="flex items-center justify-center py-4 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : (
                <div className="space-y-2">
                  {(proprietario.unidades ?? []).map((u) => {
                    const lista = coproprietariosPorUnidade[u.id] ?? []
                    const elegiveis = outrosProprietarios.filter(
                      (p) => !lista.some((c) => c.proprietario_id === p.id)
                    )
                    return (
                      <div
                        key={u.id}
                        className="rounded-lg border border-border/60 bg-background p-2.5 space-y-2"
                      >
                        <span className="text-sm font-medium">{formatUnidade(u)}</span>

                        {lista.length > 0 && (
                          <div className="space-y-1">
                            {lista.map((c) => (
                              <div
                                key={c.id}
                                className="flex items-center justify-between rounded-md bg-muted/30 px-2 py-1 text-xs"
                              >
                                <span className="min-w-0 truncate">{c.proprietario_nome}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoverCoproprietario(c.id)}
                                  disabled={isPendingCoprop}
                                  className="shrink-0 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                                >
                                  {isPendingCoprop && removendoCoprop === c.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <X className="h-3 w-3" />
                                  )}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {elegiveis.length > 0 && (
                          <div className="flex gap-1.5">
                            <select
                              value={novoCoprop[u.id] ?? ""}
                              onChange={(e) =>
                                setNovoCoprop((prev) => ({ ...prev, [u.id]: e.target.value }))
                              }
                              className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                            >
                              <option value="">Adicionar coproprietário…</option>
                              {elegiveis.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.nome}
                                </option>
                              ))}
                            </select>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 px-2 text-xs"
                              disabled={!novoCoprop[u.id] || isPendingCoprop}
                              onClick={() => handleAdicionarCoproprietario(u.id)}
                            >
                              Adicionar
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </Secao>
          )}

          {/* ── Vincular unidade ──────────────────────────────────────── */}
          {unidadesDeOutros.length > 0 && (
            <Secao icon={Link2} titulo="Vincular unidade">
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  Vincula uma unidade que hoje pertence a outro proprietário a este cadastro.
                </p>
                <select
                  value={vincularUnidadeId}
                  onChange={(e) => setVincularUnidadeId(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="">Selecione uma unidade…</option>
                  {unidadesDeOutros.map((u) => (
                    <option key={u.id} value={u.id}>
                      {formatUnidade(u)} — atualmente com {u.proprietarioNome}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={isPendingVincular || !vincularUnidadeId}
                  onClick={handleVincular}
                >
                  {isPendingVincular ? "Vinculando…" : "Vincular"}
                </Button>
              </div>
            </Secao>
          )}

          {/* ── Histórico recente ─────────────────────────────────────── */}
          <div className="space-y-2 border-t border-border/40 pt-4">
            <div className="flex items-center gap-1.5">
              <History className="h-3.5 w-3.5 text-muted-foreground" />
              <Label className="text-xs">Histórico de alterações</Label>
            </div>
            {historico.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma alteração registrada ainda.</p>
            ) : (
              <ul className="space-y-1.5">
                {historico.map((h, i) => (
                  <li key={i} className="text-xs text-muted-foreground">
                    <span className="font-mono">{formatDate(h.data)}</span> ·{" "}
                    <span className="text-foreground">{h.campo}</span>: &quot;
                    {h.valor_anterior ?? "—"}&quot; → &quot;{h.valor_novo ?? "—"}&quot;
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
