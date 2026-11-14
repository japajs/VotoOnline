"use client"

import { useRef, useState, useTransition } from "react"
import {
  Settings2,
  ChevronDown,
  Pencil,
  Plus,
  FileSignature,
  Users,
  Zap,
  UserPlus,
  Undo2,
  Send,
  BellRing,
  FileText,
  BarChart3,
  FileSpreadsheet,
  ClipboardList,
  History,
  Printer,
  Tv,
  DoorOpen,
  QrCode,
  CalendarPlus,
  Unlock,
  Pause,
  Play,
  LockKeyhole,
  RotateCcw,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { EditarAssembleiaDialog } from "@/components/assembleias/editar-assembleia-dialog"
import { AdicionarPautaDialog } from "@/components/assembleias/adicionar-pauta-dialog"
import { RegistrarVotoManualDialog } from "@/components/assembleias/registrar-voto-manual-dialog"
import { MesaAssembleiaDialog } from "@/components/assembleias/mesa-assembleia-dialog"
import { ProcuracoesDialog } from "@/components/assembleias/procuracoes-dialog"
import { HistoricoDisparosDialog } from "@/components/assembleias/historico-disparos-dialog"
import { DispararAssembleiaDialog } from "@/components/assembleias/disparar-assembleia-dialog"
import { AnularVotoDialog } from "@/components/assembleias/anular-voto-dialog"
import { PresencaDialog } from "@/components/assembleias/presenca-dialog"
import { CriarAssembleiaDialog } from "@/components/assembleias/criar-assembleia-dialog"
import { QrEntradaDialog } from "@/components/assembleias/qr-entrada-dialog"
import { ConfirmarSenhaDialog } from "@/components/ui/confirmar-senha-dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { notificarNaoVotaramAction } from "@/app/actions/assembleia-votos"
import {
  updateAssembleiaStatusAction,
  reabrirAssembleiaAction,
} from "@/app/actions/assembleias"
import type { Assembleia, AssembleiaApuracao, Proprietario } from "@/types"

// Barra de AÇÕES da assembleia (fusão / barra única, pedido do Carlos). Os menus
// vivem na MESMA toolbar que o Cadastro ▾ / Filtros ▾ da lista — uma barra só.
//
// Pra a ordem dos 5 menus bater com o layout "sem poluição visual" do Carlos
// (Assembleia · Cadastro · Filtros · Operacionais · Relatórios), a barra é
// quebrada em DUAS seções, montadas em pontos diferentes da toolbar da lista:
//   • "assembleia" → o menu "Assembleia ▾".
//   • "operacoes"  → "Operacionais ▾" + "Relatórios ▾", DEPOIS dos Filtros ▾.
// Cada seção monta só os seus diálogos (ocultos, triggerClassName="hidden") e os
// abre pelos itens do menu via `abrirPeloTrigger`.
//
// Reorganização pedida pelo Carlos (2026-11-14), com decisões do Cleiton:
//   • Apuração (era Relatórios) e Telão (era Cadastro) vieram pro "Assembleia ▾"
//     — e esse menu agora aparece TAMBÉM pro visualizador, só com esses dois
//     itens de leitura (ele não perde o acesso que tinha).
//   • "Incluir nova assembleia" e a mudança de status (Abrir/Pausar/Retomar/
//     Encerrar/Reabrir) — que só existiam na tela de gestão — entraram no
//     "Assembleia ▾" (sem criar um 6º menu, pra não repoluir a barra).
//   • Link e QR de entrada (eram Cadastro) vieram pro "Operacionais ▾".

// Abre um diálogo a partir de um item de menu: clica o botão-gatilho oculto do
// diálogo. setTimeout(…,0) deixa o menu fechar/devolver o foco antes.
function abrirPeloTrigger(ref: { current: HTMLButtonElement | null }) {
  setTimeout(() => ref.current?.click(), 0)
}

interface Props {
  // Qual metade da barra renderizar (ver comentário acima).
  secao: "assembleia" | "operacoes"
  assembleia: Assembleia
  condominioId: string
  // Nome do condomínio — usado no cartaz do QR de entrada (menu Operacionais ▾).
  condominioNome: string
  // Lista de proprietários — usada pelo "Disparar" / "Anular voto" dos menus.
  proprietarios: Proprietario[]
  // Visualizador = só leitura: esconde as ações de operação. O "Assembleia ▾"
  // ainda aparece pra ele, mas só com Apuração + Telão (leitura).
  canExport: boolean
  // Apuração — daqui saem `pendentes` (badge do "Lembrar") e `temVotos`
  // (restringe a edição da assembleia).
  apuracao: AssembleiaApuracao
}

export function BarraAcoesAssembleia({
  secao,
  assembleia,
  condominioId,
  condominioNome,
  proprietarios,
  canExport,
  apuracao,
}: Props) {
  const status = assembleia.status
  const pendentes = apuracao.total_enviados - apuracao.total_respondidos
  const temVotos = apuracao.pautas.some(
    (p) =>
      p.por_participantes.sim + p.por_participantes.nao + p.por_participantes.abstencao > 0 ||
      (p.opcoes_resultado?.some((o) => o.participantes > 0) ?? false)
  )
  const emAndamento = status === "aberta" || status === "pausada"
  // Telão e Apuração são leitura ao vivo — valem até na encerrada; só não na
  // rascunho (ainda não há o que projetar).
  const telaoOn = status !== "rascunho"

  const [isPendingLembrete, startLembreteTransition] = useTransition()
  const [isPendingStatus, startStatusTransition] = useTransition()
  const [encerrarOpen, setEncerrarOpen] = useState(false)
  const [reabrirOpen, setReabrirOpen] = useState(false)

  // Gatilhos ocultos dos diálogos agrupados nos menus.
  const editarAssembleiaRef = useRef<HTMLButtonElement>(null)
  const adicionarPautaRef = useRef<HTMLButtonElement>(null)
  const procuracoesRef = useRef<HTMLButtonElement>(null)
  const presencaRef = useRef<HTMLButtonElement>(null)
  const criarAssembleiaRef = useRef<HTMLButtonElement>(null)
  const historicoRef = useRef<HTMLButtonElement>(null)
  const mesaRef = useRef<HTMLButtonElement>(null)
  const votoManualRef = useRef<HTMLButtonElement>(null)
  const dispararRef = useRef<HTMLButtonElement>(null)
  const anularRef = useRef<HTMLButtonElement>(null)
  const qrEntradaRef = useRef<HTMLButtonElement>(null)
  // Foco inicial do diálogo de Reabrir fica no "Cancelar" (ação excepcional).
  const cancelReabrirRef = useRef<HTMLButtonElement>(null)

  // Lembrete manual pra quem ainda não votou. Confirmação antes (e-mail de
  // verdade indo pra pessoas de verdade, não só dado).
  function handleNotificarNaoVotaram() {
    if (
      !confirm(
        `Enviar lembrete de votação por e-mail para ${pendentes} proprietário(s) que ainda não votou/votaram?`
      )
    )
      return
    startLembreteTransition(async () => {
      const result = await notificarNaoVotaramAction(assembleia.id)
      if (result.success) {
        toast.success(`${result.sent} lembrete(s) enviado(s).`)
      } else {
        toast.error(result.error)
      }
    })
  }

  // Mudança de status (Abrir/Pausar/Retomar). Encerrar e Reabrir têm fluxo
  // próprio (senha / aviso) por serem (quase) definitivos.
  function handleStatusChange(next: "aberta" | "pausada", successMsg: string) {
    startStatusTransition(async () => {
      const result = await updateAssembleiaStatusAction(assembleia.id, condominioId, next)
      if (result.success) {
        toast.success(successMsg)
      } else {
        toast.error(result.error)
      }
    })
  }

  // Reabrir = correção excepcional (bypassa a trava "encerrada é definitiva").
  function handleReabrir() {
    setReabrirOpen(false)
    startStatusTransition(async () => {
      const result = await reabrirAssembleiaAction(assembleia.id, condominioId)
      if (result.success) {
        toast.success("Assembleia reaberta.")
      } else {
        toast.error(result.error)
      }
    })
  }

  // Link de entrada (copia pro WhatsApp). Mesmo link da rota /entrar.
  function copiarLinkEntrada() {
    const url = `${window.location.origin}/entrar/${assembleia.id}`
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(
        () => toast.success("Link de entrada copiado — cole no grupo do WhatsApp."),
        () => toast.message(url)
      )
    } else {
      toast.message(url)
    }
  }

  // ===== Seção "Assembleia ▾" =====================================
  if (secao === "assembleia") {
    // Apuração + Telão: leitura, pra TODOS os perfis (inclusive visualizador).
    const apuracaoItem = (
      <DropdownMenuItem
        onClick={() => window.open(`/apuracao/${assembleia.id}`, "_blank", "noopener")}
      >
        <BarChart3 className="h-4 w-4" />
        Apuração (abrir em nova aba)
      </DropdownMenuItem>
    )
    const telaoItem = telaoOn ? (
      <DropdownMenuItem
        onClick={() => window.open(`/telao/${assembleia.id}`, "_blank", "noopener")}
      >
        <Tv className="h-4 w-4" />
        Telão ao vivo
      </DropdownMenuItem>
    ) : null

    // Visualizador: só os itens de leitura (Apuração + Telão). Mantém o acesso
    // que ele tinha antes de a reorganização mover esses itens pra cá.
    if (!canExport) {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="gap-1.5" />}>
            <Settings2 className="h-3.5 w-3.5" />
            Assembleia
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {apuracaoItem}
            {telaoItem}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }

    // Operador: menu completo.
    return (
      <>
        {/* Diálogos montados OCULTOS, abertos pelos itens do menu. */}
        <EditarAssembleiaDialog
          assembleia={assembleia}
          condominioId={condominioId}
          temVotos={temVotos}
          triggerRef={editarAssembleiaRef}
          triggerClassName="hidden"
        />
        {status === "aberta" && (
          <AdicionarPautaDialog
            assembleiaId={assembleia.id}
            condominioId={condominioId}
            triggerRef={adicionarPautaRef}
            triggerClassName="hidden"
          />
        )}
        {status === "aberta" && (
          <ProcuracoesDialog
            assembleiaId={assembleia.id}
            condominioId={condominioId}
            triggerRef={procuracoesRef}
            triggerClassName="hidden"
          />
        )}
        {status !== "rascunho" && (
          <PresencaDialog
            assembleiaId={assembleia.id}
            condominioId={condominioId}
            podeLembrar={status === "aberta"}
            triggerRef={presencaRef}
            triggerClassName="hidden"
          />
        )}
        {/* "Incluir nova assembleia" — antes só na tela de gestão; agora também
            daqui (pedido do Carlos: criar sem sair da tela da assembleia). */}
        <CriarAssembleiaDialog
          condominioId={condominioId}
          triggerRef={criarAssembleiaRef}
          triggerClassName="hidden"
        />
        {/* Encerrar pede SENHA (encerramento acidental já machucou o Carlos). */}
        <ConfirmarSenhaDialog
          open={encerrarOpen}
          onOpenChange={setEncerrarOpen}
          titulo="Encerrar assembleia"
          confirmLabel="Encerrar"
          descricao={
            <>
              <strong className="text-foreground">&quot;{assembleia.titulo}&quot;</strong> deixará de
              aceitar novos votos. Reabrir depois só em caráter excepcional. Confirme com a sua senha
              para evitar o encerramento acidental.
            </>
          }
          onConfirmar={(senha) =>
            updateAssembleiaStatusAction(assembleia.id, condominioId, "encerrada", senha)
          }
          onSuccess={() => toast.success("Assembleia encerrada com sucesso.")}
        />
        {/* Reabrir = ação excepcional, com aviso (foco inicial no Cancelar). */}
        <AlertDialog open={reabrirOpen} onOpenChange={setReabrirOpen}>
          <AlertDialogContent initialFocus={cancelReabrirRef}>
            <AlertDialogHeader>
              <AlertDialogTitle>Reabrir assembleia?</AlertDialogTitle>
              <AlertDialogDescription>
                <strong>&quot;{assembleia.titulo}&quot;</strong> volta para &quot;Aberta&quot; e todas
                as pautas voltam a aceitar voto — inclusive uma apuração já divulgada pode mudar
                enquanto estiver reaberta. Use só pra corrigir um problema pontual (ex.: remover um
                voto indevido) e encerre de novo assim que terminar.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel ref={cancelReabrirRef}>Cancelar</AlertDialogCancel>
              <AlertDialogAction variant="outline" onClick={handleReabrir}>
                Reabrir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="gap-1.5" />}>
            <Settings2 className="h-3.5 w-3.5" />
            Assembleia
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {/* Configuração */}
            <DropdownMenuItem onClick={() => abrirPeloTrigger(editarAssembleiaRef)}>
              <Pencil className="h-4 w-4" />
              Editar assembleia
            </DropdownMenuItem>
            {status === "aberta" && (
              <DropdownMenuItem onClick={() => abrirPeloTrigger(adicionarPautaRef)}>
                <Plus className="h-4 w-4" />
                Incluir pauta
              </DropdownMenuItem>
            )}
            {status === "aberta" && (
              <DropdownMenuItem onClick={() => abrirPeloTrigger(procuracoesRef)}>
                <FileSignature className="h-4 w-4" />
                Procurações
              </DropdownMenuItem>
            )}
            {/* Condução ao vivo */}
            <DropdownMenuSeparator />
            {status !== "rascunho" && (
              <DropdownMenuItem onClick={() => abrirPeloTrigger(presencaRef)}>
                <Users className="h-4 w-4" />
                Chamada / Presença
              </DropdownMenuItem>
            )}
            {apuracaoItem}
            {telaoItem}
            {/* Ciclo de vida: mudar o estado + criar a próxima */}
            <DropdownMenuSeparator />
            {status === "rascunho" && (
              <DropdownMenuItem
                onClick={() => handleStatusChange("aberta", "Votação aberta.")}
                disabled={isPendingStatus}
              >
                <Unlock className="h-4 w-4" />
                Abrir votação
              </DropdownMenuItem>
            )}
            {status === "aberta" && (
              <DropdownMenuItem
                onClick={() => handleStatusChange("pausada", "Assembleia pausada.")}
                disabled={isPendingStatus}
              >
                <Pause className="h-4 w-4" />
                Pausar
              </DropdownMenuItem>
            )}
            {status === "pausada" && (
              <DropdownMenuItem
                onClick={() => handleStatusChange("aberta", "Votação retomada.")}
                disabled={isPendingStatus}
              >
                <Play className="h-4 w-4" />
                Retomar
              </DropdownMenuItem>
            )}
            {emAndamento && (
              <DropdownMenuItem onClick={() => setEncerrarOpen(true)} disabled={isPendingStatus}>
                <LockKeyhole className="h-4 w-4" />
                Encerrar
              </DropdownMenuItem>
            )}
            {status === "encerrada" && (
              <DropdownMenuItem onClick={() => setReabrirOpen(true)} disabled={isPendingStatus}>
                <RotateCcw className="h-4 w-4" />
                Reabrir
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => abrirPeloTrigger(criarAssembleiaRef)}>
              <CalendarPlus className="h-4 w-4" />
              Incluir nova assembleia
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    )
  }

  // ===== Seção "Operacionais ▾" + "Relatórios ▾" ==================
  // Operacionais é só pra quem opera; Relatórios tem itens pra todos (Imprimir).
  const linkEntradaOn = status === "aberta" || status === "pausada"
  return (
    <>
      {canExport && (
        <>
          {/* Grupo "Operacionais ▾": Registrar voto manual + Anular voto +
              Disparar e-mails + Lembrar quem não votou + Link/QR de entrada.
              Diálogos montados OCULTOS, abertos pelos itens. */}
          {status === "aberta" && (
            <RegistrarVotoManualDialog
              assembleiaId={assembleia.id}
              assembleiaTitulo={assembleia.titulo}
              condominioId={condominioId}
              pautas={assembleia.pautas ?? []}
              triggerRef={votoManualRef}
              triggerClassName="hidden"
            />
          )}
          {status !== "encerrada" && (
            <DispararAssembleiaDialog
              assembleia={assembleia}
              proprietarios={proprietarios}
              triggerRef={dispararRef}
              triggerClassName="hidden"
            />
          )}
          {emAndamento && (
            <AnularVotoDialog
              assembleiaId={assembleia.id}
              condominioId={condominioId}
              proprietarios={proprietarios}
              triggerRef={anularRef}
              triggerClassName="hidden"
            />
          )}
          <HistoricoDisparosDialog
            assembleiaId={assembleia.id}
            condominioId={condominioId}
            triggerRef={historicoRef}
            triggerClassName="hidden"
          />
          {status === "encerrada" && (
            <MesaAssembleiaDialog
              assembleiaId={assembleia.id}
              condominioId={condominioId}
              presidenteInicial={assembleia.mesa_presidente ?? null}
              secretarioInicial={assembleia.mesa_secretario ?? null}
              triggerRef={mesaRef}
              triggerClassName="hidden"
            />
          )}
          {/* QR de entrada (item do Operacionais ▾), montado oculto. Vale
              enquanto não encerrada — igual ao que era no Cadastro ▾. */}
          {status !== "encerrada" && (
            <QrEntradaDialog
              assembleiaId={assembleia.id}
              assembleiaTitulo={assembleia.titulo}
              condominioNome={condominioNome}
              triggerRef={qrEntradaRef}
              triggerClassName="hidden"
            />
          )}
          {status !== "encerrada" && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="gap-1.5" />}>
                <Zap className="h-3.5 w-3.5" />
                Operacionais
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {status === "aberta" && (
                  <DropdownMenuItem onClick={() => abrirPeloTrigger(votoManualRef)}>
                    <UserPlus className="h-4 w-4" />
                    Registrar voto manual
                  </DropdownMenuItem>
                )}
                {emAndamento && (
                  <DropdownMenuItem onClick={() => abrirPeloTrigger(anularRef)}>
                    <Undo2 className="h-4 w-4" />
                    Anular voto registrado
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => abrirPeloTrigger(dispararRef)}>
                  <Send className="h-4 w-4" />
                  Disparar e-mails
                </DropdownMenuItem>
                {status === "aberta" && pendentes > 0 && (
                  <DropdownMenuItem onClick={handleNotificarNaoVotaram} disabled={isPendingLembrete}>
                    <BellRing className="h-4 w-4" />
                    Lembrar quem não votou ({pendentes})
                  </DropdownMenuItem>
                )}
                {/* Entrada da assembleia (Link + QR) — vieram do Cadastro ▾
                    (pedido do Carlos): é operação, fica junto do resto que a
                    secretária dispara. Nomes padronizados com verbo nos dois. */}
                <DropdownMenuSeparator />
                {linkEntradaOn && (
                  <DropdownMenuItem onClick={copiarLinkEntrada}>
                    <DoorOpen className="h-4 w-4" />
                    Copiar link de entrada
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => abrirPeloTrigger(qrEntradaRef)}>
                  <QrCode className="h-4 w-4" />
                  Gerar QR de entrada
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </>
      )}
      {/* "Relatórios ▾": PDFs + Histórico + Mesa/Ata + Imprimir. A Apuração (em
          nova aba) saiu daqui — foi pro "Assembleia ▾". Imprimir fica pra todos;
          PDF/Excel só pra quem exporta. */}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="gap-1.5" />}>
          <FileText className="h-3.5 w-3.5" />
          Relatórios
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canExport && (
            <>
              <DropdownMenuItem
                onClick={() => {
                  const a = document.createElement("a")
                  a.href = `/api/relatorios/apuracao/${assembleia.id}/pdf`
                  a.click()
                }}
              >
                <FileText className="h-4 w-4" />
                Relatório de apuração (PDF)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const a = document.createElement("a")
                  a.href = `/api/relatorios/apuracao/${assembleia.id}/xlsx`
                  a.click()
                }}
              >
                <FileSpreadsheet className="h-4 w-4" />
                Relatório de apuração (Excel)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const a = document.createElement("a")
                  a.href = `/api/relatorios/participacao/${assembleia.id}/pdf`
                  a.click()
                }}
              >
                <ClipboardList className="h-4 w-4" />
                Extrato de participação (PDF)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => abrirPeloTrigger(historicoRef)}>
                <History className="h-4 w-4" />
                Histórico de e-mail
              </DropdownMenuItem>
              {status === "encerrada" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => abrirPeloTrigger(mesaRef)}>
                    <Users className="h-4 w-4" />
                    Mesa (presidente/secretário)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      const a = document.createElement("a")
                      a.href = `/api/relatorios/apuracao/${assembleia.id}/ata`
                      a.click()
                    }}
                  >
                    <FileText className="h-4 w-4" />
                    Ata (PDF)
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
            </>
          )}
          {/* Imprimir = boletim da apuração (o corpo de resultados fica montado
              oculto na ApuracaoAssembleia, com print:block). */}
          <DropdownMenuItem onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Imprimir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
