"use client"

import { useRef, useTransition } from "react"
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { notificarNaoVotaramAction } from "@/app/actions/assembleia-votos"
import type { Assembleia, AssembleiaApuracao, Proprietario } from "@/types"

// Barra de AÇÕES da assembleia (fusão / barra única, pedido do Carlos). Os menus
// vivem na MESMA toolbar que o Cadastro ▾ / Filtros ▾ da lista — uma barra só.
//
// Pra a ordem dos 5 menus bater com o layout "sem poluição visual" do Carlos
// (Assembleia · Cadastro · Filtros · Operacionais · Relatórios), a barra é
// quebrada em DUAS seções, montadas em pontos diferentes da toolbar da lista:
//   • "assembleia" → o menu "Assembleia ▾" (com a Chamada / Presença dentro),
//     renderizado ANTES do Cadastro ▾.
//   • "operacoes"  → "Operacionais ▾" + "Relatórios ▾", DEPOIS dos Filtros ▾.
// Cada seção monta só os seus diálogos (ocultos, triggerClassName="hidden") e os
// abre pelos itens do menu via `abrirPeloTrigger`.

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
  // Lista de proprietários — usada pelo "Disparar" / "Anular voto" dos menus.
  proprietarios: Proprietario[]
  // Visualizador = só leitura: esconde os menus de operação (fica só Relatórios).
  canExport: boolean
  // Apuração — daqui saem `pendentes` (badge do "Lembrar") e `temVotos`
  // (restringe a edição da assembleia).
  apuracao: AssembleiaApuracao
}

export function BarraAcoesAssembleia({
  secao,
  assembleia,
  condominioId,
  proprietarios,
  canExport,
  apuracao,
}: Props) {
  const pendentes = apuracao.total_enviados - apuracao.total_respondidos
  const temVotos = apuracao.pautas.some(
    (p) =>
      p.por_participantes.sim + p.por_participantes.nao + p.por_participantes.abstencao > 0 ||
      (p.opcoes_resultado?.some((o) => o.participantes > 0) ?? false)
  )
  const emAndamento = assembleia.status === "aberta" || assembleia.status === "pausada"

  const [isPendingLembrete, startLembreteTransition] = useTransition()

  // Gatilhos ocultos dos diálogos agrupados nos menus.
  const editarAssembleiaRef = useRef<HTMLButtonElement>(null)
  const adicionarPautaRef = useRef<HTMLButtonElement>(null)
  const procuracoesRef = useRef<HTMLButtonElement>(null)
  const presencaRef = useRef<HTMLButtonElement>(null)
  const historicoRef = useRef<HTMLButtonElement>(null)
  const mesaRef = useRef<HTMLButtonElement>(null)
  const votoManualRef = useRef<HTMLButtonElement>(null)
  const dispararRef = useRef<HTMLButtonElement>(null)
  const anularRef = useRef<HTMLButtonElement>(null)

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

  // ===== Seção "Assembleia ▾" (Editar / Incluir pauta / Procurações / Chamada
  // / Presença). Só pra quem opera; o visualizador não vê nenhuma dessas. =====
  if (secao === "assembleia") {
    if (!canExport) return null
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
        {assembleia.status === "aberta" && (
          <AdicionarPautaDialog
            assembleiaId={assembleia.id}
            condominioId={condominioId}
            triggerRef={adicionarPautaRef}
            triggerClassName="hidden"
          />
        )}
        {assembleia.status === "aberta" && (
          <ProcuracoesDialog
            assembleiaId={assembleia.id}
            condominioId={condominioId}
            triggerRef={procuracoesRef}
            triggerClassName="hidden"
          />
        )}
        {/* Chamada / Presença — agora DENTRO do menu Assembleia ▾ (pedido do
            Carlos: um botão a menos solto na barra). */}
        {assembleia.status !== "rascunho" && (
          <PresencaDialog
            assembleiaId={assembleia.id}
            condominioId={condominioId}
            podeLembrar={assembleia.status === "aberta"}
            triggerRef={presencaRef}
            triggerClassName="hidden"
          />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="gap-1.5" />}>
            <Settings2 className="h-3.5 w-3.5" />
            Assembleia
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => abrirPeloTrigger(editarAssembleiaRef)}>
              <Pencil className="h-4 w-4" />
              Editar assembleia
            </DropdownMenuItem>
            {assembleia.status === "aberta" && (
              <DropdownMenuItem onClick={() => abrirPeloTrigger(adicionarPautaRef)}>
                <Plus className="h-4 w-4" />
                Incluir pauta
              </DropdownMenuItem>
            )}
            {assembleia.status === "aberta" && (
              <DropdownMenuItem onClick={() => abrirPeloTrigger(procuracoesRef)}>
                <FileSignature className="h-4 w-4" />
                Procurações
              </DropdownMenuItem>
            )}
            {assembleia.status !== "rascunho" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => abrirPeloTrigger(presencaRef)}>
                  <Users className="h-4 w-4" />
                  Chamada / Presença
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    )
  }

  // ===== Seção "Operacionais ▾" + "Relatórios ▾". Operacionais é só pra quem
  // opera; Relatórios tem itens pra todos (Apuração em nova aba + Imprimir). =====
  return (
    <>
      {canExport && (
        <>
          {/* Grupo "Operacionais ▾": Registrar voto manual + Anular voto +
              Disparar e-mails + Lembrar quem não votou. Diálogos montados
              OCULTOS, abertos pelos itens. */}
          {assembleia.status === "aberta" && (
            <RegistrarVotoManualDialog
              assembleiaId={assembleia.id}
              assembleiaTitulo={assembleia.titulo}
              condominioId={condominioId}
              pautas={assembleia.pautas ?? []}
              triggerRef={votoManualRef}
              triggerClassName="hidden"
            />
          )}
          {assembleia.status !== "encerrada" && (
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
          {assembleia.status === "encerrada" && (
            <MesaAssembleiaDialog
              assembleiaId={assembleia.id}
              condominioId={condominioId}
              presidenteInicial={assembleia.mesa_presidente ?? null}
              secretarioInicial={assembleia.mesa_secretario ?? null}
              triggerRef={mesaRef}
              triggerClassName="hidden"
            />
          )}
          {assembleia.status !== "encerrada" && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="gap-1.5" />}>
                <Zap className="h-3.5 w-3.5" />
                Operacionais
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {assembleia.status === "aberta" && (
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
                {assembleia.status === "aberta" && pendentes > 0 && (
                  <DropdownMenuItem onClick={handleNotificarNaoVotaram} disabled={isPendingLembrete}>
                    <BellRing className="h-4 w-4" />
                    Lembrar quem não votou ({pendentes})
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </>
      )}
      {/* "Relatórios ▾": Apuração (nova aba) + PDFs + Histórico + Mesa/Ata +
          Imprimir. Apuração e Imprimir pra todos; PDF/Excel só pra quem exporta. */}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="gap-1.5" />}>
          <FileText className="h-3.5 w-3.5" />
          Relatórios
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* Apuração (resultados) abre em NOVA ABA, igual ao Telão. */}
          <DropdownMenuItem
            onClick={() => window.open(`/apuracao/${assembleia.id}`, "_blank", "noopener")}
          >
            <BarChart3 className="h-4 w-4" />
            Apuração (abrir em nova aba)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
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
              {assembleia.status === "encerrada" && (
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
