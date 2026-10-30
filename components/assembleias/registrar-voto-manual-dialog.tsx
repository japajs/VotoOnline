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
import { normalizarBusca } from "@/lib/format"
import type { ProprietarioSemVoto } from "@/services/assembleia-votos"
import type { Pauta } from "@/types"

interface Props {
  assembleiaId: string
  assembleiaTitulo: string
  condominioId: string
  pautas: Pauta[]
  // Modo DIRETO (pedido do Carlos): acionado pelo botão da linha, na coluna
  // Ações — já sabe quem é, então pula a busca e vai direto pro voto dessa
  // pessoa. O gatilho vira um ícone compacto. Ausente = modo lista (busca).
  proprietarioDireto?: { id: string; nome: string }
}

type Etapa = "escolher" | "votar"

// "Agora" no formato do input datetime-local ("YYYY-MM-DDTHH:mm"), no fuso do
// navegador (operador no Brasil). Usado como padrão e como teto (max) do campo.
function agoraDatetimeLocal(): string {
  const d = new Date()
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

// Auditoria de assembleias — Fase 7: quem não tem e-mail cadastrado nunca
// recebia link de voto (achado da auditoria) — ficava permanentemente
// excluído da votação eletrônica. Este dialog dá ao síndico um jeito de
// lançar o voto de quem votou presencialmente ou não tem e-mail, com o
// mesmo formulário e as mesmas travas de integridade do voto público (ver
// AssembleiaVotoForm + createAssembleiaRespostas) — só muda quem aciona.
export function RegistrarVotoManualDialog({
  assembleiaId,
  assembleiaTitulo,
  condominioId,
  pautas,
  proprietarioDireto,
}: Props) {
  const [open, setOpen] = useState(false)
  const [etapa, setEtapa] = useState<Etapa>("escolher")
  const [carregando, setCarregando] = useState(false)
  const [proprietarios, setProprietarios] = useState<ProprietarioSemVoto[]>([])
  // Modo presença pela mesa: a lista já vem só com os presentes (filtrado no
  // servidor). Guardamos o flag só pra ajustar a mensagem de lista vazia.
  const [exigePresenca, setExigePresenca] = useState(false)
  const [busca, setBusca] = useState("")
  const [proprietarioSelecionado, setProprietarioSelecionado] = useState<ProprietarioSemVoto | null>(null)
  // Nome de quem está votando (título/toast do passo votar). Vale pros dois
  // modos: na busca vem do item escolhido, no direto vem do proprietarioDireto.
  const [nomeVotante, setNomeVotante] = useState("")
  const [sendId, setSendId] = useState<string | null>(null)
  // Pautas que o formulário vai oferecer pra esta pessoa (no modo pauta-por-pauta,
  // só as abertas que ela ainda não votou). Definido no "iniciar".
  const [pautaIdsParaVotar, setPautaIdsParaVotar] = useState<string[]>([])
  // Data/hora do voto — ajustável pro lançamento retroativo (votou no chat da
  // reunião ontem, a mesa lança hoje). Padrão: agora. Definida ao entrar no
  // passo de votar.
  const [dataVoto, setDataVoto] = useState("")
  // Valor padrão capturado ao abrir o passo de votar. Só enviamos a data ao
  // servidor quando o operador REALMENTE mudou (dataVoto !== dataVotoPadrao) —
  // assim deixar no padrão "agora" não sobrepõe um votado_em anterior (a data
  // informada tem prioridade no núcleo; ver createAssembleiaRespostas).
  const [dataVotoPadrao, setDataVotoPadrao] = useState("")
  const [isPendingIniciar, startIniciarTransition] = useTransition()

  function reset() {
    setEtapa("escolher")
    setProprietarios([])
    setExigePresenca(false)
    setBusca("")
    setProprietarioSelecionado(null)
    setNomeVotante("")
    setSendId(null)
    setPautaIdsParaVotar([])
    setDataVoto("")
    setDataVotoPadrao("")
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      // Modo direto (botão da linha): já sabe quem é — pula a busca e abre o
      // voto dessa pessoa na hora.
      if (proprietarioDireto) {
        iniciarPara(proprietarioDireto.id, proprietarioDireto.nome)
        return
      }
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

  // Abre o passo de votar para um proprietário (id + nome). Compartilhado pelos
  // dois modos: a busca chama com o item escolhido; o direto, com o da linha.
  function iniciarPara(id: string, nome: string) {
    setNomeVotante(nome)
    startIniciarTransition(async () => {
      const result = await iniciarVotoManualAction(assembleiaId, condominioId, id)
      if (result.success && result.sendId) {
        const ids = result.pautaIds ?? []
        // Pauta-por-pauta: se não há pauta aberta pendente pra esta pessoa, não
        // entra no formulário (não dá pra lançar voto em pauta fechada/futura).
        if (ids.length === 0) {
          toast.message("Nenhuma pauta aberta para registrar o voto desta pessoa agora.")
          setProprietarioSelecionado(null)
          // No modo direto não há lista pra voltar — fecha o dialog.
          if (proprietarioDireto) setOpen(false)
          return
        }
        setPautaIdsParaVotar(ids)
        setSendId(result.sendId)
        const agora = agoraDatetimeLocal()
        setDataVoto(agora)
        setDataVotoPadrao(agora)
        setEtapa("votar")
      } else {
        toast.error(result.error)
        setProprietarioSelecionado(null)
        if (proprietarioDireto) setOpen(false)
      }
    })
  }

  function handleEscolher(p: ProprietarioSemVoto) {
    setProprietarioSelecionado(p)
    iniciarPara(p.id, p.nome)
  }

  // Busca por nome OU imóvel (ex.: "A0105"), insensível a acento/hífen/espaço
  // (normalizarBusca) — "araujo" acha "ARAÚJO", "A-0105"/"a 0105" acha "A0105".
  const proprietariosFiltrados = proprietarios.filter((p) => {
    const q = normalizarBusca(busca.trim())
    return !q || normalizarBusca(p.nome).includes(q) || normalizarBusca(p.imoveis).includes(q)
  })

  // No modo direto o passo "escolher" (busca) não existe: ou está carregando o
  // "iniciar" dessa pessoa, ou já foi pro "votar".
  const mostrarBusca = !proprietarioDireto && etapa === "escolher"

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {proprietarioDireto ? (
        // Gatilho compacto (ícone) pra caber na coluna Ações da linha.
        <DialogTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-primary"
            />
          }
        >
          <UserPlus className="h-3.5 w-3.5" />
          <span className="sr-only">Registrar voto manual de {proprietarioDireto.nome}</span>
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          <UserPlus className="h-3.5 w-3.5" />
          Registrar voto manual
        </DialogTrigger>
      )}

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {etapa === "votar"
              ? `Votando por: ${nomeVotante}`
              : proprietarioDireto
                ? `Registrar voto de ${proprietarioDireto.nome}`
                : "Registrar voto manual"}
          </DialogTitle>
          {mostrarBusca && (
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

        {mostrarBusca ? (
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
            {/* Data/hora do voto — ajustável pro lançamento retroativo (pedido
                do Carlos: votaram no chat da reunião ontem, a mesa lança hoje;
                sem isto, gravava a data de hoje). Padrão: agora. */}
            <div className="mb-3 rounded-lg border border-border/60 bg-muted/20 p-3">
              <label htmlFor="data-voto-manual" className="text-xs font-medium text-foreground">
                Data e hora do voto
              </label>
              <Input
                id="data-voto-manual"
                type="datetime-local"
                value={dataVoto}
                max={agoraDatetimeLocal()}
                onChange={(e) => setDataVoto(e.target.value)}
                className="mt-1 h-9"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Ajuste se o voto foi dado antes (ex.: no chat da reunião). Padrão: agora.
              </p>
            </div>
            <AssembleiaVotoForm
              sendId={sendId}
              // Só as pautas liberadas pra esta pessoa (no pauta-por-pauta, as
              // abertas que ela ainda não votou) — na ordem original das pautas.
              pautas={pautas.filter((p) => pautaIdsParaVotar.includes(p.id))}
              assembleiaTitulo={assembleiaTitulo}
              registrarAction={(id, votos) =>
                registrarVotoManualAction(
                  id,
                  assembleiaId,
                  condominioId,
                  votos,
                  // Só envia a data quando o operador mudou do padrão "agora" —
                  // assim um lançamento comum não sobrepõe um votado_em anterior.
                  dataVoto && dataVoto !== dataVotoPadrao
                    ? new Date(dataVoto).toISOString()
                    : null
                )
              }
              onDone={() => {
                toast.success(`Voto de ${nomeVotante} registrado.`)
                setTimeout(() => handleOpenChange(false), 1200)
              }}
            />
          </div>
        ) : (
          // Modo direto enquanto o "iniciar" carrega (ou se foi fechado por
          // bloqueio): spinner, nunca um dialog vazio.
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
