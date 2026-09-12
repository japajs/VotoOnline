import type {
  ImportacaoErro,
  ImportacaoLinha,
  ImportacaoPreview,
  ProprietarioImport,
} from "@/types"
import { dividirCandidatosContato, normalizarCelular, validarEmailFormato } from "@/lib/format"

// ─── E-mail / Celular ─────────────────────────────────────────────────────────
// Validação de formato compartilhada com o cadastro manual/edição — ver
// lib/format.ts. Aqui também é preciso lidar com célula-com-mais-de-um-valor
// (alguém colou dois contatos separados por vírgula/barra/"e" na mesma
// célula da planilha): detecta os candidatos e deixa o valor padrão como o
// primeiro válido, sinalizando a ambiguidade para o usuário resolver na
// revisão em vez de silenciosamente descartar ou concatenar os dois.

interface ResultadoCampoContato {
  valor: string | null
  candidatos?: string[]
}

function resolverEmail(valorBruto: string | null): ResultadoCampoContato {
  if (!valorBruto) return { valor: null }

  const candidatosUnicos = [...new Set(dividirCandidatosContato(valorBruto).map((v) => v.toLowerCase()))]
  const validos = candidatosUnicos.filter(validarEmailFormato)

  if (validos.length === 0) return { valor: null }
  if (validos.length === 1) return { valor: validos[0] }
  return { valor: validos[0], candidatos: validos }
}

function resolverTelefone(valorBruto: string | null): ResultadoCampoContato {
  if (!valorBruto) return { valor: null }

  const candidatos = dividirCandidatosContato(valorBruto)
  const normalizados = [...new Set(candidatos.map(normalizarCelular).filter((v): v is string => v !== null))]

  if (normalizados.length === 0) return { valor: null }
  if (normalizados.length === 1) return { valor: normalizados[0] }
  return { valor: normalizados[0], candidatos: normalizados }
}

// ─── Chave de agrupamento ─────────────────────────────────────────────────────
// Remove acentos (case/espaço já eram tratados) — sem isso, "José Silva" e
// "Jose Silva" (mesma pessoa, mesma célula de e-mail, só a grafia do nome
// variando entre duas linhas da planilha) virariam chaves diferentes:
// deixariam de se fundir num só cadastro E disparariam falsamente o aviso
// de "e-mail compartilhado por nomes diferentes" abaixo, mascarando o caso
// real que esse aviso existe pra pegar. Preserva os espaços (ao contrário
// de normalizarBusca em lib/format.ts, que também remove espaço/hífen —
// bom pra busca livre, mas agressivo demais pra decidir se duas linhas são
// a mesma pessoa).
function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
}

// Agrupa por e-mail + nome juntos (não só e-mail): achado de auditoria —
// quando várias unidades de donos DIFERENTES compartilham um mesmo contato
// (zelador, administradora, portaria), agrupar só por e-mail fundia todo
// mundo num único cadastro (ex.: 5 unidades de 5 pessoas diferentes viraram
// "1 proprietário com 5 aptos", e as outras 4 pessoas nunca ganhavam
// cadastro próprio). Incluir o nome na chave garante que só duas linhas com
// o MESMO nome E mesmo e-mail se fundem (o caso legítimo: a mesma pessoa
// com mais de uma unidade) — nomes diferentes com o mesmo e-mail viram
// proprietários separados, e o e-mail compartilhado só gera um aviso (ver
// nomesPorEmail abaixo), não uma fusão silenciosa.
function chaveProprietario(email: string | null, nome: string): string {
  const nomeChave = normalizarNome(nome)
  if (email) return `email:${email.toLowerCase()}|nome:${nomeChave}`
  return `nome:${nomeChave}`
}

// ─── Processamento principal ──────────────────────────────────────────────────

export function processarLinhas(linhas: ImportacaoLinha[]): ImportacaoPreview {
  const erros: ImportacaoErro[] = []
  const mapa = new Map<string, ProprietarioImport>()
  // Rastreia todo nome visto sob cada e-mail (nome normalizado -> 1ª linha
  // onde apareceu) — não decide mais a fusão (isso já é feito por
  // chaveProprietario, que inclui o nome; mesma normalizarNome, pra não
  // divergir da chave de fusão), só alimenta o aviso abaixo quando um mesmo
  // e-mail aparece com nomes diferentes, com linha de cada um pra localizar
  // na planilha.
  const nomesPorEmail = new Map<string, Map<string, number>>()
  let duplicidades = 0
  let linhasIgnoradas = 0

  for (const linha of linhas) {
    // Normaliza nome
    const nome = linha.nome.trim().replace(/\s+/g, " ")
    if (!nome) {
      erros.push({ linha: linha._linhaOriginal, campo: "Nome", mensagem: "Nome vazio" })
      linhasIgnoradas++
      continue
    }

    // Normaliza imóvel
    const imovel = linha.imovel.trim().toUpperCase()
    if (!imovel) {
      erros.push({ linha: linha._linhaOriginal, campo: "Imóvel", mensagem: "Imóvel vazio" })
      linhasIgnoradas++
      continue
    }

    // Valida e-mail — e detecta célula com mais de um e-mail
    const { valor: email, candidatos: emailCandidatos } = resolverEmail(linha.email)
    if (linha.email && !email) {
      erros.push({
        linha: linha._linhaOriginal,
        campo: "E-mail",
        mensagem: "E-mail inválido — será ignorado",
        dados: linha.email,
      })
    } else if (emailCandidatos) {
      erros.push({
        linha: linha._linhaOriginal,
        campo: "E-mail",
        mensagem: `Mais de um e-mail encontrado nesta célula — "${emailCandidatos[0]}" será usado, selecione o correto na revisão`,
        dados: emailCandidatos.join(", "),
      })
    }

    // Valida celular — e detecta célula com mais de um celular
    const { valor: telefone, candidatos: telefoneCandidatos } = resolverTelefone(linha.whatsapp)
    if (linha.whatsapp && !telefone) {
      erros.push({
        linha: linha._linhaOriginal,
        campo: "Celular",
        mensagem: "Celular inválido — será ignorado",
        dados: linha.whatsapp,
      })
    } else if (telefoneCandidatos) {
      erros.push({
        linha: linha._linhaOriginal,
        campo: "Celular",
        mensagem: "Mais de um celular encontrado nesta célula — o primeiro será usado, selecione o correto na revisão",
        dados: telefoneCandidatos.join(", "),
      })
    }

    if (email) {
      const porNome = nomesPorEmail.get(email) ?? new Map<string, number>()
      const nomeNormalizado = normalizarNome(nome)
      if (!porNome.has(nomeNormalizado)) porNome.set(nomeNormalizado, linha._linhaOriginal)
      nomesPorEmail.set(email, porNome)
    }

    const chave = chaveProprietario(email, nome)

    if (mapa.has(chave)) {
      // Proprietário já existe (mesmo nome E mesmo e-mail) — só adiciona a
      // unidade.
      const prop = mapa.get(chave)!

      if (prop.unidades.includes(imovel)) {
        erros.push({
          linha: linha._linhaOriginal,
          campo: "Imóvel",
          mensagem: "Unidade duplicada para este proprietário — ignorada",
          dados: imovel,
        })
        linhasIgnoradas++
        continue
      }

      prop.unidades.push(imovel)
      prop.linhasOrigem.push(linha._linhaOriginal)
      duplicidades++
    } else {
      mapa.set(chave, {
        nome,
        email,
        telefone,
        unidades: [imovel],
        linhasOrigem: [linha._linhaOriginal],
        ...(emailCandidatos ? { emailCandidatos } : {}),
        ...(telefoneCandidatos ? { telefoneCandidatos } : {}),
      })
    }
  }

  // Achado de auditoria: agrupar só por e-mail fundia num único cadastro
  // várias unidades de donos DIFERENTES que compartilham um mesmo contato
  // (zelador, administradora, portaria) — as outras pessoas nunca ganhavam
  // cadastro próprio. Agora cada nome vira um proprietário separado (ver
  // chaveProprietario acima); isto só avisa que o e-mail é compartilhado,
  // pra confirmar se é intencional ou erro de digitação na planilha.
  for (const [emailCompartilhado, porNome] of nomesPorEmail) {
    if (porNome.size > 1) {
      // "dados" traz nome + linha de cada ocorrência — sem isso, um e-mail
      // compartilhado por muitas linhas (ex.: 5+) vira um aviso genérico
      // sem indicar onde cada nome está na planilha original.
      const ocorrencias = [...porNome.entries()]
        .sort((a, b) => a[1] - b[1])
        .map(([nome, linha]) => `${nome} (linha ${linha})`)
        .join(", ")
      erros.push({
        linha: Math.min(...porNome.values()),
        campo: "E-mail",
        mensagem: `E-mail "${emailCompartilhado}" está associado a ${porNome.size} nomes diferentes — cada um virou um proprietário separado. Confirme se o e-mail compartilhado é intencional (ex.: portaria) ou erro de digitação.`,
        dados: ocorrencias,
      })
    }
  }

  const proprietarios = Array.from(mapa.values())

  return {
    proprietarios,
    totalLinhas: linhas.length,
    totalProprietarios: proprietarios.length,
    totalUnidades: proprietarios.reduce((sum, p) => sum + p.unidades.length, 0),
    duplicidades,
    erros,
    linhasIgnoradas,
  }
}
