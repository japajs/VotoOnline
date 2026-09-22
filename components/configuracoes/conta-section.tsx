"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Loader2, Save } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  updateAdminNomeAction,
  updateAdminEmailAction,
  updateSenhaAction,
} from "@/app/actions/configuracoes"

interface ContaSectionProps {
  adminNome: string
  adminEmail: string
}

export function ContaSection({ adminNome, adminEmail }: ContaSectionProps) {
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-base">Conta</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <NomeForm initialNome={adminNome} />
        <div className="border-t border-border/40" />
        <EmailForm initialEmail={adminEmail} />
        <div className="border-t border-border/40" />
        <SenhaForm />
      </CardContent>
    </Card>
  )
}

function NomeForm({ initialNome }: { initialNome: string }) {
  const [nome, setNome] = useState(initialNome)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      const result = await updateAdminNomeAction(nome)
      if (result.success) toast.success("Nome atualizado.")
      else toast.error(result.error)
    })
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Nome do administrador</p>
        <p className="text-xs text-muted-foreground">Exibido no sistema.</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Administrador"
          className="max-w-sm"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={handleSave}
          disabled={isPending || nome === initialNome || !nome.trim()}
          className="shrink-0 gap-1.5"
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Salvar
        </Button>
      </div>
    </div>
  )
}

function EmailForm({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      const result = await updateAdminEmailAction(email)
      if (result.success) toast.success("E-mail atualizado.")
      else toast.error(result.error)
    })
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">E-mail do administrador</p>
        <p className="text-xs text-muted-foreground">Usado para receber e-mails de teste.</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@exemplo.com"
          className="max-w-sm"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={handleSave}
          disabled={isPending || email === initialEmail || !email.trim()}
          className="shrink-0 gap-1.5"
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Salvar
        </Button>
      </div>
    </div>
  )
}

function SenhaForm() {
  const [senhaAtual, setSenhaAtual] = useState("")
  const [novaSenha, setNovaSenha] = useState("")
  const [confirmaSenha, setConfirmaSenha] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    if (novaSenha !== confirmaSenha) {
      toast.error("As senhas não coincidem.")
      return
    }
    startTransition(async () => {
      const result = await updateSenhaAction(senhaAtual, novaSenha)
      if (result.success) {
        toast.success("Senha atualizada. Faça login novamente para continuar.")
        setSenhaAtual("")
        setNovaSenha("")
        setConfirmaSenha("")
      } else {
        toast.error(result.error)
      }
    })
  }

  const canSave = senhaAtual && novaSenha.length >= 8 && confirmaSenha === novaSenha

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Alterar senha</p>
        <p className="text-xs text-muted-foreground">Mínimo de 8 caracteres.</p>
      </div>
      <div className="grid gap-3 sm:max-w-sm">
        <div className="space-y-1.5">
          <Label htmlFor="senha-atual" className="text-xs">Senha atual</Label>
          <PasswordInput
            id="senha-atual"
            value={senhaAtual}
            onChange={(e) => setSenhaAtual(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nova-senha" className="text-xs">Nova senha</Label>
          <PasswordInput
            id="nova-senha"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirma-senha" className="text-xs">Confirmar nova senha</Label>
          <PasswordInput
            id="confirma-senha"
            value={confirmaSenha}
            onChange={(e) => setConfirmaSenha(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        <Button
          size="default"
          variant="outline"
          onClick={handleSave}
          disabled={isPending || !canSave}
          className="w-full gap-1.5 sm:w-fit"
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Alterar senha
        </Button>
      </div>
    </div>
  )
}
