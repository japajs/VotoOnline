import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { getSession } from "@/lib/auth"
import { DashboardShell } from "@/components/layout/dashboard-shell"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect("/login")

  // Preferência de menu recolhido (desktop) — lida do cookie pra o primeiro
  // render já vir no estado certo, sem flash. Gravada no cliente pelo toggle.
  const collapsed = (await cookies()).get("votoonline_sidebar_collapsed")?.value === "1"

  return (
    <DashboardShell user={session} initialCollapsed={collapsed}>
      {children}
    </DashboardShell>
  )
}
