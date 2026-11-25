// "Nº no edital" (pedido do Carlos — sub-pautas): um rótulo livre que a mesa
// digita por pauta pra a numeração bater com o EDITAL de convocação, inclusive
// quando uma pauta do edital é quebrada em sub-pautas (1, 2, 2.1, 2.2, 3). É só
// EXIBIÇÃO — não muda voto, peso nem apuração. Quando vazio/null, a tela cai no
// número automático de sempre (posição/ordem).

// Rótulo a exibir pra uma pauta: o numero_edital digitado, ou o número
// automático (fallback) quando ele está vazio.
export function rotuloPauta(
  pauta: { numero_edital?: string | null },
  fallback: number | string
): string {
  const custom = pauta.numero_edital?.trim()
  return custom && custom.length > 0 ? custom : String(fallback)
}

// Normaliza o que vem do formulário: apara as pontas, colapsa espaços, limita o
// tamanho (é um rótulo curto tipo "2.1", não um texto) e vira null quando vazio.
export function limparNumeroEdital(valor: string | null | undefined): string | null {
  const t = (valor ?? "").trim().replace(/\s+/g, " ")
  return t ? t.slice(0, 20) : null
}
