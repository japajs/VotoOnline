import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { listUsuarios, getCondominiosAutorizados } from "@/services/usuarios"
import { getAllCondominios } from "@/services/condominios"
import { UsuarioDialog } from "@/components/usuarios/usuario-dialog"
import { UsuariosList } from "@/components/usuarios/usuarios-list"
import { ROUTES } from "@/lib/constants"

export const metadata: Metadata = { title: "Usuários" }

export default async function UsuariosPage() {
  const session = await getSession()
  // Gestão de usuários é operação GLOBAL → restrita a MASTER (administrador com
  // acesso total). Um administrador PESSOAL (restrito a condomínios) não gere
  // usuários — senão poderia criar MASTER e se autopromover. Mesmo gate das
  // actions (requireMaster em app/actions/usuarios.ts) e do item no menu.
  if (!session || session.perfil !== "administrador" || !session.acessoTotal) {
    redirect(ROUTES.dashboard)
  }

  const [usuarios, condominios] = await Promise.all([
    listUsuarios().catch(() => []),
    getAllCondominios().catch(() => []),
  ])

  const pares = await Promise.all(
    usuarios
      .filter((u) => !u.acesso_total)
      .map(async (u) => [u.id, await getCondominiosAutorizados(u.id).catch(() => [])] as const)
  )
  const condominiosAutorizadosPorUsuario = Object.fromEntries(pares)

  return (
    <div className="flex flex-col gap-6 p-6 pt-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {usuarios.length} {usuarios.length === 1 ? "usuário cadastrado" : "usuários cadastrados"}
          </p>
        </div>
        <div className="shrink-0">
          <UsuarioDialog condominios={condominios} />
        </div>
      </div>

      <UsuariosList
        usuarios={usuarios}
        condominios={condominios}
        condominiosAutorizadosPorUsuario={condominiosAutorizadosPorUsuario}
      />
    </div>
  )
}
