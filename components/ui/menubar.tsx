"use client"

import * as React from "react"
import { Menubar as MenubarPrimitive } from "@base-ui/react/menubar"

import { cn } from "@/lib/utils"

// Barra de menus (base-ui Menubar): os DropdownMenu (Menu.Root) que ficam DENTRO
// dela passam a se comportar como menu nativo — um clique ABRE um menu e, com um
// aberto, passar o mouse pelos outros TROCA na hora, sem precisar clicar de novo
// (pedido do Carlos). Com todos fechados, o hover não abre nada: continua sendo
// o clique que "entra nos menus". modal=false porque é uma toolbar — fechar ao
// clicar fora, sem travar/escurecer a página.
function Menubar({
  className,
  modal = false,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive>) {
  return (
    <MenubarPrimitive data-slot="menubar" modal={modal} className={cn(className)} {...props} />
  )
}

export { Menubar }
