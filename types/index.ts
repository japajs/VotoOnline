// ─── Usuários e sessão ────────────────────────────────────────────────────────

export type UserPerfil = "administrador" | "operador" | "visualizador"

export interface SessionUser {
  userId: string
  email: string
  nome: string
  perfil: UserPerfil
  // Escopo por condomínio (MASTER/PESSOAL): true = enxerga todos os
  // condomínios (comportamento de sempre); false = só os vinculados em
  // usuario_condominios. Vai no próprio JWT para não precisar consultar o
  // banco a cada checagem — ver lib/auth.ts.
  acessoTotal: boolean
}

export interface Usuario {
  id: string
  nome: string
  email: string
  cpf: string | null
  celular: string | null
  perfil: UserPerfil
  acesso_total: boolean
  ativo: boolean
  created_at: string
}

// ─── Send status (compartilhado entre envios) ────────────────────────────────

export type SendStatus = "sent" | "failed" | "pending"

// ─── Dashboard (condomínio) ────────────────────────────────────────────────

export interface CondoDashboardStats {
  total_condominios: number
  total_proprietarios: number
  total_unidades: number
  total_assembleias: number
}

// Resumo por condomínio (dashboard) — respeita o mesmo escopo MASTER/PESSOAL
// de usuario_condominios que o resto do sistema (ver getResumoPorCondominio
// em services/dashboard.ts).
export interface CondominioResumo {
  id: string
  nome: string
  total_proprietarios: number
  total_unidades: number
  assembleias_abertas: number
}

export interface AssembleiaRecente {
  id: string
  titulo: string
  status: AssembleiaStatus
  created_at: string
  data_encerramento: string | null
  condominio_id: string
  condominio_nome: string
  total_enviados: number
  total_respondidos: number
}

// ─── API ─────────────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  data?: T
  error?: string
}

// ─── Condomínio ────────────────────────────────────────────────────────────

// "unidade" (padrão) = 1 unidade = peso 1, sempre — comportamento histórico.
// "fracao_ideal" = peso de cada proprietário é a soma de unidades.fracao_ideal
// — regra padrão de condomínio no Brasil salvo disposição diversa na
// convenção. Ver lib/peso.ts.
export type CriterioPeso = "unidade" | "fracao_ideal"

export interface Condominio {
  id: string
  nome: string
  endereco: string | null
  sindico_nome: string | null
  sindico_contato: string | null
  criterio_peso: CriterioPeso
  created_at: string
}

// ─── Proprietário / Unidade ───────────────────────────────────────────────
// Cadastro permanente: o peso de voto de um proprietário é `unidades.length`
// ou a soma de `unidades.fracao_ideal`, dependendo de
// `condominios.criterio_peso` — nunca um campo armazenado. Ver lib/peso.ts.

export interface Unidade {
  id: string
  proprietario_id: string
  numero: string
  bloco: string | null
  // Fração ideal da unidade em relação ao condomínio (ex.: 0.014235). Só é
  // usada/exigida quando o condomínio tem criterio_peso = "fracao_ideal".
  fracao_ideal: number | null
  created_at: string
  // joined
  coproprietarios?: CoproprietarioComNome[]
}

// Auditoria de assembleias — Fase 9: registro puramente informativo de um
// dono ADICIONAL de uma unidade (ex.: cônjuge, herdeiros). Nunca lido por
// lib/peso.ts ou services/assembleia-votos.ts — quem vota pela unidade
// continua sendo só unidades.proprietario_id. Se um coproprietário quiser
// votar de fato, o caminho é procuração (Procuracao), não este cadastro.
export interface Coproprietario {
  id: string
  unidade_id: string
  proprietario_id: string
  created_at: string
}

export interface CoproprietarioComNome extends Coproprietario {
  proprietario_nome: string
}

// Uma entrada do histórico simples de alterações de cadastro (Etapa 4) —
// sem motivo, IP, usuário ou sessão, propositalmente. Guardado direto no
// proprietário, sem tabela/módulo de auditoria separado.
export interface HistoricoAlteracao {
  data: string
  campo: string
  valor_anterior: string | null
  valor_novo: string | null
}

export interface Proprietario {
  id: string
  condominio_id: string
  nome: string
  email: string | null
  cpf: string | null
  telefone: string | null
  observacoes: string | null
  // Bloqueia voto (Código Civil, art. 1.335, §único / convenção
  // condominial) — ver validarVotoOuFalhar em services/assembleia-votos.ts.
  inadimplente: boolean
  historico_alteracoes: HistoricoAlteracao[]
  created_at: string
  // joined
  unidades?: Unidade[]
}

// ─── Assembleia ────────────────────────────────────────────────────────────

export type AssembleiaStatus = "rascunho" | "aberta" | "pausada" | "encerrada"
export type AssembleiaRespostaValor = "Sim" | "Não" | "Abstenção"
export type PautaTipo = "sim_nao" | "multipla_escolha"
// Ciclo de vida da pauta, independente do status da assembleia: "aberta" é o
// estado normal de uma pauta pronta para votar; passa para "em_votacao"
// sozinha assim que recebe o 1º voto (ver services/pautas.ts) e só vira
// "encerrada" quando a assembleia inteira é encerrada (nenhuma pauta fecha
// isoladamente). "rascunho" existe só por simetria/futuro — hoje toda pauta
// nasce direto em "aberta".
export type PautaStatus = "rascunho" | "aberta" | "em_votacao" | "encerrada"

export interface Assembleia {
  id: string
  condominio_id: string
  titulo: string
  descricao: string | null
  status: AssembleiaStatus
  data_abertura: string | null
  data_encerramento: string | null
  // Fração (0–1) do peso total do condomínio exigida pra assembleia ser
  // válida na 1ª convocação (ou na única convocação, se data_1a_convocacao
  // for null). Null = sem checagem de quórum mínimo. Ver lib/peso.ts.
  quorum_minimo: number | null
  // Data-limite da 1ª convocação — depois dela, quorum_minimo_2a passa a
  // valer no lugar de quorum_minimo. Null = sem 1ª/2ª convocação (só
  // quorum_minimo, comportamento único). Ver getQuorumEfetivo em lib/peso.ts.
  data_1a_convocacao: string | null
  quorum_minimo_2a: number | null
  created_at: string
  updated_at: string
  // joined
  pautas?: Pauta[]
}

export interface PautaOpcao {
  id: string
  pauta_id: string
  ordem: number
  label: string
  created_at: string
}

export interface Pauta {
  id: string
  assembleia_id: string
  ordem: number
  titulo: string
  descricao: string | null
  ativa: boolean
  tipo: PautaTipo
  permite_abstencao: boolean
  status: PautaStatus
  // Fração (0–1) de Sim sobre (Sim + Não) exigida pra pauta ser aprovada —
  // abstenções não entram no denominador. 0.5 = maioria simples (padrão),
  // 0.6667 ≈ 2/3, 1 = unanimidade.
  quorum_aprovacao: number
  // Auditoria de assembleias — Fase 5: pauta sigilosa (ex.: eleição de
  // síndico) — resultado agregado continua público; PDF/Excel omitem o
  // vínculo nome↔voto no detalhamento pra essa pauta.
  sigiloso: boolean
  created_at: string
  // joined — só populado para pautas do tipo "multipla_escolha"
  opcoes?: PautaOpcao[]
}

// Fotografia da situação cadastral do proprietário no instante em que ele
// registrou o voto (Etapa 3). Preenchida uma única vez, dentro de
// createAssembleiaRespostas — nunca reescrita depois. Fica `null` enquanto o
// proprietário não vota; depois disso, é definitiva e nunca mais muda,
// mesmo que o cadastro ou as unidades dele mudem em seguida.
export interface AssembleiaSendSnapshot {
  nome_snapshot: string | null
  cpf_snapshot: string | null
  email_snapshot: string | null
  telefone_snapshot: string | null
  quantidade_unidades_snapshot: number | null
  unidades_snapshot: { numero: string; bloco: string | null }[] | null
  peso_snapshot: number | null
  votado_em: string | null
  ip_snapshot: string | null
  user_agent_snapshot: string | null
}

export interface AssembleiaSend extends AssembleiaSendSnapshot {
  id: string
  assembleia_id: string
  proprietario_id: string
  token: string
  status: SendStatus
  sent_at: string | null
  created_at: string
  // joined
  assembleia?: Pick<
    Assembleia,
    | "id"
    | "condominio_id"
    | "titulo"
    | "descricao"
    | "status"
    | "data_abertura"
    | "data_encerramento"
    | "quorum_minimo"
    | "data_1a_convocacao"
    | "quorum_minimo_2a"
  > & {
    pautas?: Pauta[]
    condominio_nome?: string | null
  }
  proprietario?: Pick<Proprietario, "id" | "nome" | "email">
}

export interface AssembleiaResposta {
  id: string
  send_id: string
  pauta_id: string
  // Exatamente um dos dois é preenchido: `resposta` para pautas "sim_nao"
  // (ou abstenção em "multipla_escolha"), `opcao_id` para o voto em uma
  // opção de pauta "multipla_escolha".
  resposta: AssembleiaRespostaValor | null
  opcao_id: string | null
  // Congelado no momento do voto — nunca recalculado depois (ver lib/peso.ts
  // e services/assembleia-votos.ts). Transferências/edições de unidade após
  // o voto não alteram este valor.
  peso: number
  created_at: string
}

// ─── Procuração ────────────────────────────────────────────────────────────
// Auditoria de assembleias — Fase 8: outorgante (quem delega) precisa ser
// um proprietário já cadastrado no mesmo condomínio do outorgado (quem
// recebe/vota) — nunca uma pessoa externa. Escopo por assembleia (não é
// uma delegação permanente). O peso do outorgado, ao votar, passa a somar
// o peso das unidades do outorgante — ver createAssembleiaRespostas em
// services/assembleia-votos.ts.
export interface Procuracao {
  id: string
  assembleia_id: string
  outorgante_id: string
  outorgado_id: string
  created_at: string
}

export interface ProcuracaoComNomes extends Procuracao {
  outorgante_nome: string
  outorgado_nome: string
}

// ─── Apuração de Assembleia ────────────────────────────────────────────────

export interface OpcaoApuracao {
  opcao_id: string
  label: string
  participantes: number
  ponderado: number
}

export interface PautaApuracao {
  pauta: Pauta
  // Para pautas "sim_nao": preenchidos normalmente.
  // Para pautas "multipla_escolha": sim/nao ficam zerados — o resultado
  // fica em `opcoes_resultado`; abstencao continua representando quem se
  // absteve, se a pauta permitir.
  por_participantes: { sim: number; nao: number; abstencao: number }
  ponderado: { sim: number; nao: number; abstencao: number }
  total_apartamentos_representados: number
  // Sim / (Sim + Não), ponderado — abstenção não entra no denominador.
  // Comparado com pauta.quorum_aprovacao pra decidir `aprovada`. Null se
  // ninguém votou Sim nem Não ainda (denominador zero).
  percentual_aprovacao: number | null
  // Só calculado para pautas "sim_nao" — em "multipla_escolha" não existe
  // um único resultado passa/não passa (é a opção mais votada), então fica
  // null. Também null enquanto percentual_aprovacao for null.
  aprovada: boolean | null
  // joined — só populado para pautas do tipo "multipla_escolha"
  opcoes_resultado?: OpcaoApuracao[]
}

export interface AssembleiaApuracao {
  pautas: PautaApuracao[]
  total_enviados: number
  total_respondidos: number
  // Quórum da assembleia (ver assembleias.quorum_minimo/quorum_minimo_2a) —
  // peso de quem já votou sobre o peso total do condomínio inteiro (todas
  // as unidades, não só quem recebeu convite). quorum_atingido é null
  // quando a assembleia não tem nenhum quórum configurado (sem checagem).
  peso_total_condominio: number
  peso_representado: number
  percentual_quorum: number | null
  quorum_atingido: boolean | null
  // Auditoria de assembleias — Fase 2: qual convocação decidiu o
  // quorum_atingido acima — 1 ou 2, ou null se a assembleia não usa
  // 1ª/2ª convocação (só quorum_minimo único) ou não tem quórum nenhum
  // configurado. Ver getQuorumEfetivo em lib/peso.ts.
  convocacao_aplicada: 1 | 2 | null
  // Fração (0–1) do quórum EFETIVAMENTE exigido — quorum_minimo na 1ª
  // convocação, quorum_minimo_2a na 2ª. Não confundir com
  // assembleias.quorum_minimo (sempre o valor da 1ª, mesmo quando a 2ª já
  // está em vigor) — este campo é o que efetivamente vale agora/no
  // encerramento. Null junto com percentual_quorum/quorum_atingido.
  quorum_aplicavel: number | null
}

// ─── Importação de planilha ────────────────────────────────────────────────

export type CampoImportacao = "imovel" | "nome" | "whatsapp" | "email" | "ignorar"

export interface DeteccaoColuna {
  colIdx: number
  header: string
  campoDetetado: CampoImportacao | null
}

export interface LeituraArquivo {
  headers: string[]
  rows: string[][]
  totalLinhas: number
}

export interface ImportacaoLinha {
  imovel: string
  nome: string
  whatsapp: string | null
  email: string | null
  _linhaOriginal: number
}

export interface ImportacaoErro {
  linha: number
  campo: string
  mensagem: string
  dados?: string
}

export interface ProprietarioImport {
  nome: string
  email: string | null
  telefone: string | null
  unidades: string[]
  linhasOrigem: number[]
  // Preenchidos só quando a célula de e-mail/celular da planilha trazia mais
  // de um valor (ex.: "a@x.com; b@x.com") — `email`/`telefone` já vêm com o
  // primeiro candidato como padrão; a tela de revisão usa essas listas para
  // deixar o usuário escolher qual dos valores realmente importar.
  emailCandidatos?: string[]
  telefoneCandidatos?: string[]
}

export interface ImportacaoPreview {
  proprietarios: ProprietarioImport[]
  totalLinhas: number
  totalProprietarios: number
  totalUnidades: number
  duplicidades: number
  erros: ImportacaoErro[]
  linhasIgnoradas: number
}
