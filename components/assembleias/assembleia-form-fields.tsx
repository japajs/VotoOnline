"use client"

import { Plus, X, ChevronUp, ChevronDown, Lock } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { MAX_PAUTAS, MIN_OPCOES, type AssembleiaFormApi } from "./use-assembleia-form"

interface Props {
  form: AssembleiaFormApi
  /** Sempre true na criação. Na edição, false quando a assembleia já tem
   * voto registrado ou está encerrada — bloqueia só a parte de pautas,
   * título/descrição/datas continuam editáveis. */
  pautasEditaveis: boolean
  mensagemPautasBloqueadas?: string
  idPrefix: string
}

export function AssembleiaFormFields({ form, pautasEditaveis, mensagemPautasBloqueadas, idPrefix }: Props) {
  return (
    <div className="max-h-[62vh] overflow-y-auto space-y-4 px-1">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-titulo`}>Título</Label>
        <Input
          id={`${idPrefix}-titulo`}
          placeholder="Ex.: Assembleia Geral Ordinária 2025"
          value={form.titulo}
          onChange={(e) => form.setTitulo(e.target.value)}
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-desc`}>
          Descrição <span className="font-normal text-muted-foreground">(opcional)</span>
        </Label>
        <Textarea
          id={`${idPrefix}-desc`}
          placeholder="Contexto adicional para os proprietários…"
          value={form.descricao}
          onChange={(e) => form.setDescricao(e.target.value)}
          rows={2}
          className="resize-none"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-data-abertura`} className="text-xs">
            Abertura <span className="font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <Input
            id={`${idPrefix}-data-abertura`}
            type="datetime-local"
            value={form.dataAbertura}
            onChange={(e) => form.setDataAbertura(e.target.value)}
            className="text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-data-encerramento`} className="text-xs">
            Encerramento <span className="font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <Input
            id={`${idPrefix}-data-encerramento`}
            type="datetime-local"
            value={form.dataEncerramento}
            onChange={(e) => form.setDataEncerramento(e.target.value)}
            className="text-xs"
          />
        </div>
      </div>

      {/* Auditoria de assembleias — Fase 1: quórum mínimo pra assembleia
          valer, sobre o peso do condomínio inteiro (não só quem foi
          convidado). Vazio = sem checagem, comportamento de sempre. */}
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-quorum-minimo`} className="text-xs">
          Quórum mínimo (%){" "}
          <span className="font-normal text-muted-foreground">
            {form.data1aConvocacao ? "— 1ª convocação" : "(opcional)"}
          </span>
        </Label>
        <Input
          id={`${idPrefix}-quorum-minimo`}
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          placeholder="Ex.: 50 — sem preencher, não checa quórum"
          value={form.quorumMinimo}
          onChange={(e) => form.setQuorumMinimo(e.target.value)}
          className="text-xs"
        />
      </div>

      {/* Auditoria de assembleias — Fase 2: 1ª/2ª convocação, adaptada pra
          votação assíncrona — não é hora marcada + tolerância, é uma
          data-limite. Vazia = sem 1ª/2ª convocação (só o quórum mínimo
          acima, comportamento único da Fase 1). */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-1a-convocacao`} className="text-xs">
            Data-limite da 1ª convocação{" "}
            <span className="font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <Input
            id={`${idPrefix}-1a-convocacao`}
            type="datetime-local"
            value={form.data1aConvocacao}
            onChange={(e) => form.setData1aConvocacao(e.target.value)}
            className="text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-quorum-2a`} className="text-xs">
            Quórum da 2ª convocação (%){" "}
            <span className="font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <Input
            id={`${idPrefix}-quorum-2a`}
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            placeholder="Vazio = sem checagem na 2ª"
            value={form.quorumMinimo2a}
            onChange={(e) => form.setQuorumMinimo2a(e.target.value)}
            disabled={!form.data1aConvocacao}
            className="text-xs"
          />
        </div>
      </div>
      {!form.convocacaoValida && (
        <p className="text-xs text-destructive">
          A data-limite da 1ª convocação precisa estar entre a abertura e o encerramento da
          assembleia.
        </p>
      )}

      {/* Pautas */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Pautas</Label>
          {pautasEditaveis && (
            <span className="text-xs text-muted-foreground">
              {form.pautas.length}/{MAX_PAUTAS}
            </span>
          )}
        </div>

        {!pautasEditaveis && mensagemPautasBloqueadas && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {mensagemPautasBloqueadas}
          </div>
        )}

        <div className="space-y-2">
          {form.pautas.map((pauta, i) => {
            const opcoesValidas = pauta.opcoes.map((o) => o.trim()).filter(Boolean).length
            return (
              <div
                key={i}
                className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Pauta {i + 1}
                  </span>
                  {pautasEditaveis && form.pautas.length > 1 && (
                    <button
                      type="button"
                      onClick={() => form.removePauta(i)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <Input
                  placeholder="Título da pauta"
                  value={pauta.titulo}
                  onChange={(e) => form.updatePauta(i, "titulo", e.target.value)}
                  disabled={!pautasEditaveis}
                  className="h-8 text-sm"
                />
                <Textarea
                  placeholder="Descrição (opcional)"
                  value={pauta.descricao}
                  onChange={(e) => form.updatePauta(i, "descricao", e.target.value)}
                  disabled={!pautasEditaveis}
                  rows={2}
                  className="resize-none text-sm"
                />

                {/* Tipo da pauta */}
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => form.updatePautaTipo(i, "sim_nao")}
                    disabled={!pautasEditaveis}
                    className={cn(
                      "flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-70",
                      pauta.tipo === "sim_nao"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-primary/40"
                    )}
                  >
                    Sim / Não
                  </button>
                  <button
                    type="button"
                    onClick={() => form.updatePautaTipo(i, "multipla_escolha")}
                    disabled={!pautasEditaveis}
                    className={cn(
                      "flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-70",
                      pauta.tipo === "multipla_escolha"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-primary/40"
                    )}
                  >
                    Múltipla escolha
                  </button>
                </div>

                {/* Auditoria de assembleias — Fase 1: só se aplica a Sim/Não
                    — múltipla escolha não tem "aprovada", é sempre "opção
                    mais votada" (ver services/assembleia-votos.ts). */}
                {pauta.tipo === "sim_nao" && (
                  <div className="flex items-center gap-1.5">
                    <Label
                      htmlFor={`${idPrefix}-pauta-${i}-quorum`}
                      className="shrink-0 text-xs text-muted-foreground"
                    >
                      Quórum de aprovação (%)
                    </Label>
                    <Input
                      id={`${idPrefix}-pauta-${i}-quorum`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      value={pauta.quorumAprovacao}
                      onChange={(e) => form.updatePautaQuorum(i, e.target.value)}
                      disabled={!pautasEditaveis}
                      className="h-7 text-xs"
                    />
                  </div>
                )}

                {/* Auditoria de assembleias — Fase 5: sigiloso se aplica aos
                    dois tipos (o clássico é eleição de síndico, geralmente
                    múltipla escolha) — só muda o que aparece no
                    detalhamento do PDF/Excel, nunca o resultado agregado. */}
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={pauta.sigiloso}
                    onChange={() => form.toggleSigiloso(i)}
                    disabled={!pautasEditaveis}
                    className="accent-primary"
                  />
                  Voto sigiloso
                  <span className="font-normal">(oculta nome↔voto no PDF/Excel)</span>
                </label>

                {pauta.tipo === "multipla_escolha" && (
                  <div className="space-y-2 rounded-md border border-border/50 bg-card/60 p-2">
                    <div className="space-y-1.5">
                      {pauta.opcoes.map((opcao, oi) => (
                        <div key={oi} className="flex items-center gap-1">
                          <Input
                            placeholder={`Opção ${oi + 1}`}
                            value={opcao}
                            onChange={(e) => form.updateOpcao(i, oi, e.target.value)}
                            disabled={!pautasEditaveis}
                            className="h-8 text-sm"
                          />
                          {pautasEditaveis && (
                            <>
                              <button
                                type="button"
                                onClick={() => form.moveOpcao(i, oi, -1)}
                                disabled={oi === 0}
                                className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                              >
                                <ChevronUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => form.moveOpcao(i, oi, 1)}
                                disabled={oi === pauta.opcoes.length - 1}
                                className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                              >
                                <ChevronDown className="h-3.5 w-3.5" />
                              </button>
                              {pauta.opcoes.length > MIN_OPCOES && (
                                <button
                                  type="button"
                                  onClick={() => form.removeOpcao(i, oi)}
                                  className="text-muted-foreground hover:text-destructive transition-colors"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>

                    {pautasEditaveis && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => form.addOpcao(i)}
                        className="h-7 w-full gap-1.5 text-xs"
                      >
                        <Plus className="h-3 w-3" />
                        Adicionar opção
                      </Button>
                    )}

                    {opcoesValidas < MIN_OPCOES && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Adicione pelo menos {MIN_OPCOES} opções preenchidas.
                      </p>
                    )}

                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={pauta.permiteAbstencao}
                        onChange={() => form.togglePermiteAbstencao(i)}
                        disabled={!pautasEditaveis}
                        className="accent-primary"
                      />
                      Permitir abstenção
                    </label>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {pautasEditaveis && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={form.addPauta}
            disabled={form.pautas.length >= MAX_PAUTAS}
            className="w-full gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar pauta
            {form.pautas.length >= MAX_PAUTAS && (
              <span className="text-muted-foreground">(máximo atingido)</span>
            )}
          </Button>
        )}
      </div>
    </div>
  )
}
