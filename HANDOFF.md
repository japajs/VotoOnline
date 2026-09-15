# Entrega do sistema — guia de handoff

Este documento é pra quando o VotoOnline for entregue por completo — código, dados e
responsabilidade operacional — pra outro programador ou comprador.

Cenário: você entrega um **pacote fechado** (código + dados + documentação) e o que
acontece depois — banco de dados, hospedagem, domínio — é decisão e execução dele,
na infraestrutura que ele escolher. Você não precisa coordenar uma migração ao vivo
com ele nem saber de antemão o que ele vai usar. Sua responsabilidade se resume a
três coisas: (1) entregar um pacote completo e correto, (2) não desligar a sua
própria operação atual enquanto ela ainda tiver assembleia real em andamento, e
(3) revogar suas próprias chaves quando achar que já terminou sua parte.

Não é documentação de arquitetura (isso está no `README.md`) — é o checklist de
"o que preciso fazer pra entregar isso direito e sair limpo".

---

## 1. O pacote que você entrega

| Item | Como entregar |
|---|---|
| Código-fonte | Transferir a titularidade do repositório GitHub (Settings → Transfer ownership), ou dar acesso de colaborador pra ele fazer um fork |
| Dados reais | Um dump/export do banco atual (ver seção 2) — sem isso, ele recebe um sistema vazio |
| Documentação | `README.md` (arquitetura, variáveis de ambiente, regras de negócio) já cobre o que ele precisa pra rodar e entender o sistema em qualquer infraestrutura que escolher |

A partir do momento que ele tem esses três itens, ele tem tudo que precisa pra
decidir sozinho onde hospedar, que banco usar e que domínio registrar — nenhuma
dessas decisões depende de nada seu.

---

## 2. Gerar o export dos dados

O banco de hoje tem dados reais de pessoas físicas (nome, CPF, e-mail, telefone) de
várias centenas de proprietários em vários condomínios, além do **histórico de voto
já registrado** — isso tem valor probatório/legal (uma ata de assembleia precisa
continuar íntegra). O seu trabalho aqui é só gerar um export limpo e completo — o
que ele faz com esse export (importar em outro Supabase, em Postgres puro, converter
pra outra tecnologia) é decisão e trabalho dele, não seu.

**Dump completo (recomendado — o formato mais fácil de qualquer programador reaproveitar,
mesmo que decida sair do Postgres depois):**

No projeto Supabase atual, em **Settings → Database → Connection string**, pegue a
string de conexão direta e rode:

```bash
pg_dump "postgresql://...string-de-conexao-atual..." \
  --no-owner --no-privileges -f backup-completo.sql
```

Isso gera um único arquivo `.sql` com schema + todos os dados — entregue esse
arquivo junto com o código. Se ele decidir continuar em Postgres (outro projeto
Supabase, Neon, Railway, etc.), ele só precisa rodar `psql ... -f backup-completo.sql`
no banco novo dele e a aplicação funciona sem nenhuma mudança de código. Se decidir
mudar de tecnologia de banco, o `.sql` ainda serve de referência completa do
schema e conteúdo pra ele reconstruir na tecnologia que escolher — mas nesse caso
avise que a camada `services/` do código (a única parte que fala com o banco) foi
escrita especificamente contra `@supabase/supabase-js` e usa recursos do Postgres
(coluna gerada, RLS, `jsonb`, extensão `uuid-ossp`), então trocar de tecnologia
exige reescrever essa camada, não só importar o dado.

Antes de entregar, confira que o arquivo gerado realmente tem conteúdo (não é raro
um `pg_dump` falhar silenciosamente por permissão) — abra e confirme que as tabelas
`proprietarios`, `assembleias` e `assembleia_respostas` aparecem com `INSERT`s de
verdade, não só a criação das tabelas vazias.

---

## 3. Sua operação atual continua rodando até você decidir parar

Trocar de dono do código não desliga automaticamente nada da sua conta pessoal —
Supabase, Resend, domínio e hospedagem atuais continuam ativos até você mesmo
encerrá-los. Isso é bom: dá folga pra não precisar sincronizar nada com o ritmo
do novo programador.

O único cuidado: **não encerre sua própria infraestrutura enquanto ainda tiver
assembleia real rodando nela** — o condomínio Águas da Serra, por exemplo, está
configurado pra aceitar voto até dezembro de 2026. Quem já recebeu o link de voto
por e-mail só consegue usá-lo enquanto a infraestrutura atual (domínio + hospedagem
+ banco de hoje) continuar no ar. Antes de desligar qualquer coisa, confirme que
não existe mais nenhuma assembleia com status `aberta` ou `pausada` no banco.

---

## 4. Quando encerrar sua parte

Depois que o novo programador confirmar (pra você, por fora — não é algo que o
sistema avisa sozinho) que já está rodando na infraestrutura própria dele, e depois
que suas próprias assembleias em andamento tiverem encerrado:

- **Revogue/regenere a `SUPABASE_SERVICE_ROLE_KEY`** do seu projeto (ou encerre o
  projeto) — essa chave dá acesso total ao banco, ignorando toda regra de segurança.
- **Revogue a `RESEND_API_KEY`** da sua conta.
- Se o domínio não tiver mais uso, decida junto com seu registrador se cancela ou
  deixa expirar.
- Apague qualquer cópia de `.env.local` com essas chaves que não seja mais
  necessária.

---

## 5. Nota legal (recomendado revisar com advogado, não é orientação jurídica)

O sistema processa dados pessoais (CPF, nome, contato) de centenas de pessoas
físicas em nome de vários condomínios — isso é dado pessoal sob a LGPD. Se a
entrega for uma **venda** (não só passar o código pra outro dev de um cliente que
já era seu), vale formalizar num contrato:

- Quem passa a ser o **controlador dos dados** perante a LGPD a partir da entrega.
- Se os condomínios/síndicos (que confiaram os dados dos moradores ao sistema)
  precisam ser comunicados da mudança de responsável.
- Período de garantia/suporte seu após a entrega, se houver.
- Isenção de responsabilidade sua por uso/dado gerado depois da data de corte.

---

## 6. Checklist resumido (só suas ações)

- [ ] Repositório GitHub transferido ou fork liberado
- [ ] `pg_dump` completo gerado, conferido (tem `INSERT`s de verdade) e entregue
- [ ] `README.md` está atualizado (já está, na entrega atual) — confirme antes de mandar
- [ ] Nenhuma assembleia `aberta`/`pausada` sua ficou órfã antes de desligar sua infra
- [ ] Confirmação do novo dono de que já está rodando na infraestrutura própria dele
- [ ] `SUPABASE_SERVICE_ROLE_KEY` e `RESEND_API_KEY` antigas revogadas
- [ ] Contrato de entrega/venda revisado (se aplicável) — controlador de dados,
      comunicação aos síndicos, garantia, isenção de responsabilidade
