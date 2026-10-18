"use client"

import { useState, useTransition } from "react"
import { UserPlus, Loader2, Search } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  getProprietariosSemVotoAction,
  iniciarVotoManualAction,
  registrarVotoManualAction,
} from "@/app/actions/assembleia-votos"
import { AssembleiaVotoForm } from "@/components/assembleias/assembleia-voto-form"
import type { ProprietarioSemVoto } from "@/services/assembleia-votos"
import type { Pauta } from "@/types"

interface Props {
  assembleiaId: string
  assembleiaTitulo: string
  condominioId: string
  pautas: Pauta[]
}

type Etapa = "escolher" | "votar"

// Auditoria de assembleias — Fase 7: quem não tem e-mail cadastrado nunca
// recebia link de voto (achado da auditoria) — ficava permanentemente
// excluído da votação eletrônica. Este dialog dá ao síndico um jeito de
// lançar o voto de quem votou presencialmente ou não tem e-mail, com o
// mesmo formulário e as mesmas travas de integridade do voto público (ver
// AssembleiaVotoForm + createAssembleiaRespostas) — só muda quem aciona.
export function RegistrarVotoManualDialog({ assembleiaId, assembleiaTitulo, condominioId, pautas }: Props) {
  const [open, setOpen] = useState(false)
  const [etapa, setEtapa] = useState<Etapa>("escolher")
  const [carregando, setCarregando] = useState(false)
  const [proprietarios, setProprietarios] = useState<ProprietarioSemVoto[]>([])
  // Modo presença pela mesa: a lista já vem só com os presentes (filtrado no
  // servidor). Guardamos o flag só pra ajustar a mensagem de lista vazia.
  const [exigePresenca, setExigePresenca] = useState(false)
  const [busca, setBusca] = useState("")
  const [proprietarioSelecionado, setProprietarioSelecionado] = useState<ProprietarioSemVoto | null>(null)
  const [sendId, setSendId] = useState<string | null>(null)
  // Pautas que o formulário vai oferecer pra esta pessoa (no modo pauta-por-pauta,
  // só as abertas que ela ainda não votou). Definido no "iniciar".
  const [pautaIdsParaVotar, setPautaIdsParaVotar] = useState<string[]>([])
  const [isPendingIniciar, startIniciarTransition] = useTransition()

  function reset() {
    setEtapa("escolher")
    setProprietarios([])
    setExigePresenca(false)
    setBusca("")
    setProprietarioSelecionado(null)
    setSendId(null)
    setPautaIdsParaVotar([])
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setCarregando(true)
      getProprietariosSemVotoAction(assembleiaId, condominioId).then((result) => {
        setCarregando(false)
        if (result.success) {
          setProprietarios(result.proprietarios)
          setExigePresenca(result.exigePresenca)
        } else {
          toast.error(result.error)
        }
      })
    } else {
      setTimeout(reset, 200)
    }
  }

  function handleEscolher(p: ProprietarioSemVoto) {
    setProprietarioSelecionado(p)
    startIniciarTransition(async () => {
      const result = await iniciarVotoManualAction(assembleiaId, condominioId, p.id)
      if (result.success && result.sendId) {
        const ids = result.pautaIds ?? []
        // Pauta-por-pauta: se não há pauta aberta pendente pra esta pessoa, não
        // entra no formulário (não dá pra lançar voto em pauta fechada/futura).
        if (ids.length === 0) {
          toast.message("Nenhuma pauta aberta para registrar o voto desta pessoa agora.")
          setProprietarioSelecionado(null)
          return
        }
        setPautaIdsParaVotar(ids)
        setSendId(result.sendId)
        setEtapa("votar")
      } else {
        toast.error(result.error)
        setProprietarioSelecionado(null)
      }
    })
  }

  // Busca por nome OU imóvel (ex.: "A0105") — o imóvel agora aparece na lista,
  // então a mesa consegue achar a pessoa digitando a unidade também (Carlos).
  const proprietariosFiltrados = proprietarios.filter((p) => {
    const q = busca.trim().toLowerCase()
    return !q || p.nome.toLowerCase().includes(q) || p.imoveis.toLowerCase().includes(q)
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <UserPlus className="h-3.5 w-3.5" />
        Registrar voto manual
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {etapa === "escolher" ? "Registrar voto manual" : `Votando por: ${proprietarioSelecionado?.nome}`}
          </DialogTitle>
          {etapa === "escolher" && (
            <DialogDescription>
              Pra quem votou presencialmente, por procuração em papel, ou não tem e-mail cadastrado.
              O voto fica registrado com seu nome como responsável pelo lançamento.
              {exigePresenca && (
                <>
                  {" "}
                  <span className="font-medium text-foreground">
                    Só aparecem proprietários já marcados como presentes pela mesa.
                  </span>
                </>
              )}
            </DialogDescription>
          )}
        </DialogHeader>

        {etapa === "escolher" ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar proprietário…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>

            <div className="max-h-72 space-y-1 overflow-y-auto">
              {carregando ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : proprietariosFiltrados.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {proprietarios.length === 0
                    ? exigePresenca
                      ? "Ninguém marcado como presente ainda. Marque a presença na Chamada antes de lançar o voto."
                      : "Todos os proprietários já votaram."
                    : "Nenhum proprietário encontrado."}
                </p>
              ) : (
                proprietariosFiltrados.map((p) => {
                  // Bloqueados JÁ NA LISTA (não deixa entrar na rotina de voto; o
                  // servidor também recusa): INADIMPLENTE (não vota de forma
                  // alguma — pra liberar, a mesa remove o status) e quem OUTORGOU
                  // procuração (quem vota é o representante). Inadimplente tem
                  // prioridade na mensagem.
                  const bloqueado = p.inadimplente || p.outorgouPara !== null
                  const subtitulo = p.inadimplente
                    ? "Inadimplente — não pode votar"
                    : p.outorgouPara !== null
                      ? `Procuração → ${p.outorgouPara} · quem vota é o representante`
                      : (p.email ?? "sem e-mail cadastrado")
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleEscolher(p)}
                      disabled={isPendingIniciar || bloqueado}
                      title={
                        p.inadimplente
                          ? "Inadimplente não pode votar. Pra liberar, remova o status de inadimplente no cadastro."
                          : p.outorgouPara !== null
                            ? `Outorgou procuração a ${p.outorgouPara} — quem vota é o representante`
                            : undefined
                      }
                      className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                        p.inadimplente
                          ? "cursor-not-allowed border-rose-400/40 bg-rose-500/5"
                          : p.outorgouPara !== null
                            ? "cursor-not-allowed border-amber-400/40 bg-amber-500/5"
                            : "border-border/60 hover:border-primary/40 hover:bg-accent/30 disabled:opacity-50"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {/* Imóvel na frente do nome, destacado — facilita a
                              identificação no voto manual (pedido do Carlos). */}
                          {p.imoveis ? (
                            <span className="text-primary">{p.imoveis} · </span>
                          ) : null}
                          {p.nome}
                        </p>
                        <p
                          className={`truncate text-xs ${
                            p.inadimplente
                              ? "text-rose-700 dark:text-rose-400"
                              : p.outorgouPara !== null
                                ? "text-amber-700 dark:text-amber-400"
                                : "text-muted-foreground"
                          }`}
                        >
                          {subtitulo}
                        </p>
                      </div>
                      {p.inadimplente ? (
                        <span className="shrink-0 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-400">
                          Inadimplente
                        </span>
                      ) : p.outorgouPara !== null ? (
                        <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                          Procuração
                        </span>
                      ) : (
                        isPendingIniciar &&
                        proprietarioSelecionado?.id === p.id && (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                        )
                      )}
                    </button>
                  )
                })
              )}
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
            </DialogFooter>
          </div>
        ) : sendId ? (
          <div className="max-h-[65vh] overflow-y-auto px-1">
            <AssembleiaVotoForm
              sendId={sendId}
              // Só as pautas liberadas pra esta pessoa (no pauta-por-pauta, as
              // abertas que ela ainda não votou) — na ordem original das pautas.
              pautas={pautas.filter((p) => pautaIdsParaVotar.includes(p.id))}
              assembleiaTitulo={assembleiaTitulo}
              registrarAction={(id, votos) => registrarVotoManualAction(id, assembleiaId, condominioId, votos)}
              onDone={() => {
                toast.success(`Voto de ${proprietarioSelecionado?.nome} registrado.`)
                setTimeout(() => handleOpenChange(false), 1200)
              }}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
