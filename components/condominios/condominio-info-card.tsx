"use client"

import { useState, useTransition } from "react"
import { MapPin, User, Phone, Pencil, Loader2, Save, X, Scale, Building2, FileSignature } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { updateCondominioInfoAction } from "@/app/actions/condominios"
import type { Condominio, CriterioPeso } from "@/types"

interface Props {
  condominio: Condominio
}

const CRITERIO_LABEL: Record<CriterioPeso, string> = {
  unidade: "Por unidade (1 unidade = 1 voto)",
  fracao_ideal: "Por fração ideal",
}

export function CondominioInfoCard({ condominio }: Props) {
  const [editing, setEditing] = useState(false)
  const [nome, setNome] = useState(condominio.nome)
  const [cnpj, setCnpj] = useState(condominio.cnpj ?? "")
  const [endereco, setEndereco] = useState(condominio.endereco ?? "")
  const [sindicoNome, setSindicoNome] = useState(condominio.sindico_nome ?? "")
  const [sindicoContato, setSindicoContato] = useState(condominio.sindico_contato ?? "")
  const [criterioPeso, setCriterioPeso] = useState<CriterioPeso>(condominio.criterio_peso)
  const [limiteProcuracoes, setLimiteProcuracoes] = useState(
    condominio.limite_procuracoes != null ? String(condominio.limite_procuracoes) : ""
  )
  const [isPending, startTransition] = useTransition()

  const hasInfo =
    condominio.cnpj || condominio.endereco || condominio.sindico_nome || condominio.sindico_contato

  function handleCancel() {
    setNome(condominio.nome)
    setCnpj(condominio.cnpj ?? "")
    setEndereco(condominio.endereco ?? "")
    setSindicoNome(condominio.sindico_nome ?? "")
    setSindicoContato(condominio.sindico_contato ?? "")
    setCriterioPeso(condominio.criterio_peso)
    setLimiteProcuracoes(condominio.limite_procuracoes != null ? String(condominio.limite_procuracoes) : "")
    setEditing(false)
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updateCondominioInfoAction(condominio.id, nome, {
        cnpj,
        endereco,
        sindico_nome: sindicoNome,
        sindico_contato: sindicoContato,
        criterio_peso: criterioPeso,
        limite_procuracoes: limiteProcuracoes,
      })
      if (result.success) {
        toast.success("Informações atualizadas.")
        setEditing(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  if (editing) {
    return (
      <div className="rounded-xl border border-primary/30 bg-card p-4 space-y-4">
        <p className="text-sm font-semibold text-foreground">Editar informações</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ci-nome" className="text-xs">Nome do condomínio</Label>
            <Input
              id="ci-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Residencial das Flores"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ci-cnpj" className="text-xs">CNPJ</Label>
            <Input
              id="ci-cnpj"
              value={cnpj}
              // Só dígitos e a pontuação do CNPJ — bloqueia letras conforme
              // digita (mesma ideia dos campos de CPF/celular).
              onChange={(e) => setCnpj(e.target.value.replace(/[^\d./-]/g, ""))}
              placeholder="00.000.000/0000-00"
              inputMode="numeric"
            />
            <p className="text-xs text-muted-foreground">
              Exigido pelo cartório para o registro da ata — sai nos relatórios.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ci-endereco" className="text-xs">Endereço</Label>
            <Input
              id="ci-endereco"
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              placeholder="Rua Exemplo, 100 – Bairro"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ci-sindico" className="text-xs">Nome do síndico</Label>
            <Input
              id="ci-sindico"
              value={sindicoNome}
              onChange={(e) => setSindicoNome(e.target.value)}
              placeholder="João Silva"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ci-contato" className="text-xs">Contato do síndico</Label>
            <Input
              id="ci-contato"
              value={sindicoContato}
              onChange={(e) => setSindicoContato(e.target.value)}
              placeholder="(11) 99999-9999 / email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ci-criterio" className="text-xs">Critério de peso do voto</Label>
            <Select value={criterioPeso} onValueChange={(v) => setCriterioPeso(v as CriterioPeso)}>
              <SelectTrigger id="ci-criterio" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unidade">{CRITERIO_LABEL.unidade}</SelectItem>
                <SelectItem value="fracao_ideal">{CRITERIO_LABEL.fracao_ideal}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Fração ideal exige preencher o campo em toda unidade antes de trocar.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ci-limite-proc" className="text-xs">
              Limite de procurações por representante
            </Label>
            <Input
              id="ci-limite-proc"
              value={limiteProcuracoes}
              // Só dígitos; vazio = sem limite.
              onChange={(e) => setLimiteProcuracoes(e.target.value.replace(/\D/g, ""))}
              placeholder="Sem limite"
              inputMode="numeric"
            />
            <p className="text-xs text-muted-foreground">
              Máximo de procurações que uma mesma pessoa pode receber por assembleia (varia por
              convenção — ex.: 1, 3, 6). Em branco = sem limite. Avisa na hora de registrar.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isPending || !nome.trim()}
            className="gap-1.5"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isPending} className="gap-1.5">
            <X className="h-3.5 w-3.5" />
            Cancelar
          </Button>
        </div>
      </div>
    )
  }

  if (!hasInfo) {
    return (
      <div className="space-y-2">
        <button
          onClick={() => setEditing(true)}
          className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-border/80 hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5 shrink-0" />
          Adicionar endereço e informações do síndico
        </button>
        <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <Scale className="h-3.5 w-3.5 shrink-0 text-primary/60" />
          <span>Peso do voto: {CRITERIO_LABEL[condominio.criterio_peso]}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-card px-4 py-3.5">
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        {condominio.cnpj && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Building2 className="h-3.5 w-3.5 shrink-0 text-primary/60" />
            <span>CNPJ: <span className="font-medium text-foreground">{condominio.cnpj}</span></span>
          </div>
        )}
        {condominio.endereco && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-primary/60" />
            <span>{condominio.endereco}</span>
          </div>
        )}
        {condominio.sindico_nome && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="h-3.5 w-3.5 shrink-0 text-primary/60" />
            <span>Síndico: <span className="font-medium text-foreground">{condominio.sindico_nome}</span></span>
          </div>
        )}
        {condominio.sindico_contato && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Phone className="h-3.5 w-3.5 shrink-0 text-primary/60" />
            <span>{condominio.sindico_contato}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Scale className="h-3.5 w-3.5 shrink-0 text-primary/60" />
          <span>{CRITERIO_LABEL[condominio.criterio_peso]}</span>
        </div>
        {condominio.limite_procuracoes != null && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileSignature className="h-3.5 w-3.5 shrink-0 text-primary/60" />
            <span>
              Limite de procurações:{" "}
              <span className="font-medium text-foreground">{condominio.limite_procuracoes}</span> por
              representante
            </span>
          </div>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setEditing(true)}
        className="h-9 w-9 shrink-0 p-0 text-muted-foreground hover:text-foreground"
      >
        <Pencil className="h-3.5 w-3.5" />
        <span className="sr-only">Editar informações</span>
      </Button>
    </div>
  )
}
