"use client"

import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

// Extraído depois que o mesmo toggle de mostrar/ocultar senha (antes só em
// login/setup) passou a se repetir em mais telas (redefinir senha, criar
// usuário, alterar senha da conta) — um componente só evita reimplementar o
// aria-label e o botão em cada lugar novo.
function PasswordInput({ className, ...props }: React.ComponentProps<"input">) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      {/* `type` vem depois do spread de propósito — assim nenhum `type`
          passado por um chamador (permitido pelo tipo ComponentProps<"input">)
          consegue desativar o mascaramento da senha. */}
      <Input {...props} className={cn("pr-10", className)} type={visible ? "text" : "password"} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        disabled={props.disabled}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

export { PasswordInput }
