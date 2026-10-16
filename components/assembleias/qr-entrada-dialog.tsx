"use client"

import { useRef, useState } from "react"
import { QrCode, Printer, Copy } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { QrEntrada, useEntradaUrl } from "./qr-entrada"

interface Props {
  assembleiaId: string
  assembleiaTitulo: string
  condominioNome?: string | null
}

// Escapa texto antes de injetar no HTML do cartaz de impressão — um título
// legítimo com "&", "<" ou aspas (ex.: "Prestação de contas & orçamento")
// quebraria o documento sem isso.
const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]!)
}

// QR de entrada pro operador: projetar no telão, copiar o link ou IMPRIMIR um
// cartaz pra colar na entrada do salão (pedido do Carlos: QR em todo ponto
// possível, inclusive impresso pras reuniões presenciais). O condômino que
// escaneia cai direto na tela de identificação (unidade + CPF) — mesmo link
// público de sempre, sem risco novo.
export function QrEntradaDialog({ assembleiaId, assembleiaTitulo, condominioNome }: Props) {
  const [open, setOpen] = useState(false)
  const url = useEntradaUrl(assembleiaId)
  const qrRef = useRef<HTMLDivElement>(null)

  function copiar() {
    if (!url) return
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(
        () => toast.success("Link de entrada copiado."),
        () => toast.message(url)
      )
    } else {
      toast.message(url)
    }
  }

  // Imprime um cartaz A4 reaproveitando o MESMO SVG já renderizado no diálogo
  // (sem segunda geração nem dependência extra). Abre uma janela limpa só com
  // o cartaz e dispara a impressão.
  function imprimir() {
    const svg = qrRef.current?.querySelector("svg")?.outerHTML
    if (!svg || !url) {
      toast.message("Aguarde o QR carregar e tente de novo.")
      return
    }
    const win = window.open("", "_blank", "width=720,height=900")
    if (!win) {
      toast.error("Permita pop-ups neste site para imprimir o cartaz.")
      return
    }
    const tituloCartaz = escapeHtml(
      condominioNome ? `${condominioNome} — ${assembleiaTitulo}` : assembleiaTitulo
    )
    win.document.write(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>QR de entrada — ${tituloCartaz}</title>
<style>
  *{box-sizing:border-box} html,body{margin:0}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#16233F;text-align:center;padding:48px 32px}
  h1{font-size:34px;margin:0 0 6px}
  h2{font-size:18px;font-weight:600;color:#555;margin:0 0 32px}
  .qr{display:inline-block;padding:20px;border:1px solid #D8D2C2;border-radius:16px}
  .qr svg{width:320px;height:320px;display:block}
  .instr{font-size:18px;line-height:1.6;max-width:460px;margin:32px auto 0}
  .instr b{color:#16233F}
  .url{font-size:12px;color:#999;margin-top:20px;word-break:break-all}
  .rodape{font-size:11px;color:#bbb;margin-top:36px}
</style></head>
<body>
  <h1>Escaneie para votar</h1>
  <h2>${tituloCartaz}</h2>
  <div class="qr">${svg}</div>
  <p class="instr">Aponte a câmera do seu celular para o código. Em seguida, informe a sua <b>unidade</b> e o seu <b>CPF</b> cadastrados para entrar e votar.</p>
  <div class="url">${escapeHtml(url)}</div>
  <div class="rodape">© Cleiton Salazar · VotoOnline · uso licenciado por sessão de assembleia</div>
</body></html>`)
    win.document.close()
    win.focus()
    // Pequeno atraso pra o SVG pintar antes do diálogo de impressão.
    setTimeout(() => win.print(), 300)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="gap-1.5" />}>
        <QrCode className="h-3.5 w-3.5" />
        QR de entrada
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>QR de entrada</DialogTitle>
          <DialogDescription>
            Projete no telão ou imprima pra colar na entrada. Quem escanear cai direto na tela de
            votar e se identifica por unidade + CPF.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          <div ref={qrRef} className="rounded-xl border border-border/60 bg-white p-4">
            <QrEntrada url={url} size={224} />
          </div>
          {url && (
            <p className="break-all text-center text-xs text-muted-foreground">{url}</p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copiar} className="gap-1.5">
              <Copy className="h-3.5 w-3.5" />
              Copiar link
            </Button>
            <Button size="sm" onClick={imprimir} className="gap-1.5">
              <Printer className="h-3.5 w-3.5" />
              Imprimir cartaz
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
