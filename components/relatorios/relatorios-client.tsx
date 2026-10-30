"use client"

import { useCallback, useEffect, useState } from "react"
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Condominio, UserPerfil } from "@/types"

interface Assembleia {
  id: string
  titulo: string
  status: string
}

interface Props {
  condominios: Condominio[]
  perfil: UserPerfil
}

function triggerDownload(url: string) {
  const a = document.createElement("a")
  a.href = url
  a.click()
}

export function RelatoriosClient({ condominios, perfil }: Props) {
  const canExport = perfil !== "visualizador"
  const isAdmin = perfil === "administrador"

  /* ─── Seção 1: Apuração ──────────────────────────────────────────────── */
  const [condApurId, setCondApurId] = useState("")
  const [assembleias, setAssembleias] = useState<Assembleia[]>([])
  const [assembleiaId, setAssembleiaId] = useState("")
  const [loadingAss, setLoadingAss] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [exportingXlsx, setExportingXlsx] = useState(false)

  useEffect(() => {
    setAssembleias([])
    setAssembleiaId("")
    if (!condApurId) return
    setLoadingAss(true)
    fetch(`/api/relatorios/assembleias?condominioId=${condApurId}`)
      .then((r) => r.json())
      .then((data: Assembleia[]) => {
        setAssembleias(data)
        setLoadingAss(false)
      })
      .catch(() => setLoadingAss(false))
  }, [condApurId])

  const handlePdf = useCallback(() => {
    if (!assembleiaId || !canExport) return
    setExportingPdf(true)
    triggerDownload(`/api/relatorios/apuracao/${assembleiaId}/pdf`)
    setTimeout(() => setExportingPdf(false), 3000)
  }, [assembleiaId, canExport])

  const handleXlsx = useCallback(() => {
    if (!assembleiaId || !canExport) return
    setExportingXlsx(true)
    triggerDownload(`/api/relatorios/apuracao/${assembleiaId}/xlsx`)
    setTimeout(() => setExportingXlsx(false), 3000)
  }, [assembleiaId, canExport])

  /* ─── Seção 2: Proprietários (admin only) ────────────────────────────── */
  const [condPropId, setCondPropId] = useState("")
  const [exportingProp, setExportingProp] = useState(false)

  const handleProp = useCallback(() => {
    if (!condPropId) return
    setExportingProp(true)
    triggerDownload(`/api/condominios/${condPropId}/exportar`)
    setTimeout(() => setExportingProp(false), 3000)
  }, [condPropId])

  const statusLabel: Record<string, string> = {
    rascunho: "Rascunho",
    aberta: "Aberta",
    encerrada: "Encerrada",
  }

  return (
    <div className="space-y-6">
      {/* ── Seção 1: Apuração ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-border/60 bg-card">
        <div className="border-b border-border/40 px-6 py-4">
          <h2 className="text-base font-semibold">Apuração de Assembleia</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Selecione a assembleia e exporte o relatório completo de votação.
          </p>
        </div>

        <div className="p-6 space-y-5">
          {/* Filtros */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="relatorio-condominio-apuracao" className="text-xs font-medium text-muted-foreground">
                Condomínio
              </label>
              <select
                id="relatorio-condominio-apuracao"
                value={condApurId}
                onChange={(e) => setCondApurId(e.target.value)}
                className="h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="">Selecione um condomínio…</option>
                {condominios.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="relatorio-assembleia-apuracao" className="text-xs font-medium text-muted-foreground">
                Assembleia
              </label>
              <select
                id="relatorio-assembleia-apuracao"
                value={assembleiaId}
                onChange={(e) => setAssembleiaId(e.target.value)}
                disabled={!condApurId || loadingAss}
                className="h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">
                  {loadingAss
                    ? "Carregando assembleias…"
                    : !condApurId
                      ? "Selecione um condomínio primeiro"
                      : assembleias.length === 0
                        ? "Nenhuma assembleia encontrada"
                        : "Selecione uma assembleia…"}
                </option>
                {assembleias.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.titulo}
                    {a.status ? ` (${statusLabel[a.status] ?? a.status})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Cartões de exportação */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* PDF */}
            <div
              className={`rounded-xl border p-5 space-y-4 transition-colors ${
                assembleiaId && canExport
                  ? "border-border/60 bg-card"
                  : "border-dashed border-border/40 bg-muted/20"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-rose-500/10 p-2 shrink-0">
                  <FileText className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Relatório PDF</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Cabeçalho institucional, tabelas por pauta (participantes e ponderado),
                    rodapé com numeração de páginas.
                  </p>
                </div>
              </div>
              <Button
                onClick={handlePdf}
                disabled={!assembleiaId || !canExport || exportingPdf}
                size="default"
                className="w-full"
              >
                {exportingPdf ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {exportingPdf ? "Gerando PDF…" : "Baixar PDF"}
              </Button>
            </div>

            {/* XLSX */}
            <div
              className={`rounded-xl border p-5 space-y-4 transition-colors ${
                assembleiaId && canExport
                  ? "border-border/60 bg-card"
                  : "border-dashed border-border/40 bg-muted/20"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-emerald-500/10 p-2 shrink-0">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Planilha Excel (4 abas)</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Resumo Geral · Resultados por Pauta · Participantes com status de
                    resposta · Unidades do condomínio.
                  </p>
                </div>
              </div>
              <Button
                onClick={handleXlsx}
                disabled={!assembleiaId || !canExport || exportingXlsx}
                size="default"
                variant="outline"
                className="w-full"
              >
                {exportingXlsx ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {exportingXlsx ? "Gerando Excel…" : "Baixar Excel (.xlsx)"}
              </Button>
            </div>
          </div>

          {!canExport && (
            <p className="text-center text-xs text-muted-foreground">
              Seu perfil (Visualizador) não tem permissão para exportar relatórios.
            </p>
          )}
          {/* Por que exportar está desabilitado quando o perfil PODE exportar:
              falta escolher a assembleia (não travar em silêncio). */}
          {canExport && !assembleiaId && (
            <p className="text-center text-xs text-muted-foreground">
              Selecione um condomínio e uma assembleia acima para habilitar a exportação.
            </p>
          )}
        </div>
      </div>

      {/* ── Seção 2: Proprietários e Unidades (admin only) ─────────────── */}
      {isAdmin && (
        <div className="rounded-xl border border-border/60 bg-card">
          <div className="border-b border-border/40 px-6 py-4">
            <h2 className="text-base font-semibold">Proprietários e Unidades</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Exporte a lista completa de proprietários e unidades de um condomínio.
            </p>
          </div>

          <div className="p-6 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="relatorio-condominio-proprietarios" className="text-xs font-medium text-muted-foreground">
                Condomínio
              </label>
              <select
                id="relatorio-condominio-proprietarios"
                value={condPropId}
                onChange={(e) => setCondPropId(e.target.value)}
                className="h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="">Selecione um condomínio…</option>
                {condominios.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>

            <Button
              onClick={handleProp}
              disabled={!condPropId || exportingProp}
              size="default"
              variant="outline"
              className="gap-2"
            >
              {exportingProp ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {exportingProp ? "Gerando…" : "Baixar lista (.xlsx)"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
