# Harmonia — Documentação da sessão (03-04/08/2026)

Resumo completo de tudo que foi feito hoje: migração pra Supabase, funcionalidades novas,
problemas que apareceram e como foram resolvidos. Guarda esse arquivo — é o ponto de partida
pra qualquer sessão futura.

---

## 1. Infraestrutura (acessos e IDs)

| O quê | Valor |
|---|---|
| Repositório GitHub | `github.com/rodrigojustini/harmonia` (branch `main`) |
| Pasta local (Windows) | `C:\Users\supor\Downloads\harmonia` |
| Site no ar | `harmonia-louvor.netlify.app` |
| Deploy | Automático — Netlify ligado direto no GitHub. Todo `git push` na `main` publica sozinho (Base directory: `frontend`) |
| Projeto Supabase | nome `harmonia`, região `sa-east-1`, ref `uinalmjnsdnjqzhraxtt` |
| URL Supabase | `https://uinalmjnsdnjqzhraxtt.supabase.co` |
| Anon key (pública, já está no código) | fica em `frontend/js/supabase-config.js` |
| Domínio verificado no Resend (envio de e-mail) | `agenciajustinis.com.br` |
| Remetente dos e-mails | `harmonia@agenciajustinis.com.br` |
| Provedor de e-mail (SMTP) | Resend, plano grátis (3.000 e-mails/mês) |

**Importante:** o Supabase do Harmonia é um projeto **separado** do LocarBem — bancos, chaves e
domínios diferentes, sem nenhum compartilhamento.

---

## 2. O que existia antes de hoje

O Harmonia era um app de escalas pra ministério de louvor com backend próprio em
Node/Express + Prisma + SQLite (pasta `backend/`), rodando num servidor Hetzner. O repositório
no GitHub tinha um problema sério: o arquivo `backend/.env` (com o `JWT_SECRET`) e o banco
`backend/prisma/dev.db` estavam commitados publicamente.

## 3. Migração pra Supabase (base de tudo)

Trocamos o backend Express inteiro pelo Supabase (Postgres + Auth + Row Level Security),
seguindo o mesmo padrão de isolamento multi-tenant que já é usado no LocarBem.

- **11 tabelas** no schema `public`, todas com `igreja_id` e RLS ativado (isolamento total
  entre igrejas — uma igreja nunca vê dado de outra)
- Duas funções auxiliares (`get_my_igreja_id()`, `get_my_role()`) evitam recursão de RLS
- O frontend (`frontend/js/app.js`) fala direto com o Supabase via `supabase-js`, sem servidor
  próprio no meio — só chama `supabase.from(...)` e `supabase.auth...`
- A pasta `backend/` (Express) foi **removida do rastreamento do Git** (não é mais usada nem
  precisa ser corrigida — o `.env` velho não afeta mais nada em produção)

### Tabelas atuais

- `igrejas` — cada igreja/ministério cadastrado (nome, slug, código de convite)
- `perfis` — contas de login (1:1 com `auth.users` do Supabase), com `role` (`admin`/`member`)
- `musicas` — repertório (título, tom original, link, cifra, observações)
- `membros` — equipe/elenco (nome, voz, função, aniversário, e opcionalmente `perfil_id`
  linkando a uma conta de login)
- `cultos` / `culto_musicas` — mapas de culto com músicas em ordem
- `escalas` — uma "escala mensal" (mês/ano/igreja)
- `escala_colunas` — colunas da planilha da escala (função/instrumento), editáveis por escala
- `escala_linhas` — linhas da planilha (par de dias, ex: "domingo/terça" → "2 e 4")
- `escala_celulas` — quem está escalado em cada célula (linha × coluna)
- `trocas_escala` — pedidos de troca (vinculados a uma célula, com `solicitante_id`/`receptor_id`)
- `historico` — log de ações (existe no schema, não tem UI própria ainda)
- `escala_membros` / `escala_musicas` — tabelas legadas do modelo antigo de calendário,
  não são mais usadas pela UI atual (deixadas por segurança, sem problema em ignorar)

### Edge Functions (rodam no servidor Supabase, nunca no navegador)

- **`convidar-membro`** — só o líder pode chamar. Valida quem está pedindo, manda convite por
  e-mail (`inviteUserByEmail`) e já cria o perfil vinculado à igreja certa.
- **`verificar-igreja`** — pública (sem login). Usada no cadastro pra avisar se já existe uma
  igreja com nome parecido, evitando duplicatas.

---

## 4. Funcionalidades adicionadas hoje

1. **Cadastro multi-tenant** — ao criar conta, a pessoa escolhe "sou a primeira da minha
   igreja" (vira admin, cria a igreja) ou "minha igreja já usa" (entra com código de convite,
   acessível na aba Config pro líder)
2. **Convite por e-mail** — líder convida alguém direto pela aba Config; a pessoa recebe
   e-mail com link pra criar a própria senha (`definir-senha.html`)
3. **Escala em formato de planilha** — substituiu o calendário antigo. Colunas
   (função/instrumento) e linhas (par de dias) totalmente editáveis pelo líder, célula por
   célula, clicando pra escolher quem vai
4. **Baixar PDF** e **Copiar pro WhatsApp** — botões na aba Escala, formatam a planilha pronta
   pra compartilhar
5. **Troca de escala vinculada à célula** — membro comum clica numa célula preenchida e pede
   pra assumir aquela vaga; só funciona se a pessoa escalada tiver conta vinculada
   (`membros.perfil_id`)
6. **Transposição de cifra** — a aba Músicas já tinha esse motor pronto no código (só não
   salvava no banco); agora a cifra é salva de verdade e os botões `-`/`+` no "Mapa" da música
   transpõem tudo automaticamente
7. **Identidade visual própria** — trocado o preto+verde neon (padrão genérico de IA) por
   paleta dourado/âmbar + grafite quente + tipografia serifada (Fraunces), inspirada em luz de
   palco/hinário
8. **Correção de igreja duplicada** — um teste (usuário "Julio") criou sem querer uma segunda
   igreja com o mesmo nome da primeira. Foi corrigido manualmente no banco, e agora o cadastro
   avisa automaticamente quando isso for acontecer de novo

---

## 5. Pendências conhecidas (pra próxima sessão)

- **Aprovação de troca não move a célula sozinha** — quando o líder aprova um pedido de troca,
  só fica registrado como aprovado; ele ainda precisa ir na planilha e atualizar a célula
  manualmente
- **Link público de culto** (compartilhável sem login) não foi implementado — precisa de uma
  Edge Function própria pra não vazar dados de outras igrejas
- **"Confirm email" está desligado** no Supabase Auth (pra facilitar testes) — contas são
  criadas sem confirmação por e-mail. Vale reativar quando o app for pra produção "de verdade"
  com usuários reais
- **Histórico** (tabela `historico`) existe no banco mas não tem tela própria ainda
- **Histórico do Git** ainda tem o `.env` antigo exposto nos commits de dezembro/2025 (o
  arquivo já não existe mais no código atual, só ficou no histórico) — se quiser blindar 100%,
  dá pra reescrever o histórico do repositório (operação mais delicada, exige force-push)

---

## 6. Problema recorrente de deploy — e como evitar

**O que aconteceu várias vezes hoje:** eu gerava um zip novo com as mudanças, mas o Chrome
reconhecia o nome do arquivo (`harmonia-frontend-supabase.zip`) como "já baixado antes" e não
baixava a versão nova — só reaproveitava a antiga do cache. Isso causou pushes que pareciam ter
dado certo mas na verdade reenviavam código velho (incluindo uma vez que **desfez** duas
funcionalidades inteiras sem ninguém perceber na hora).

**Solução adotada:** a partir de agora, cada zip entregue tem um **nome numerado e único**
(ex: `harmonia-v8.zip`, `harmonia-v9.zip`...). Nunca mais reusar o mesmo nome de arquivo.

**Checklist de segurança antes de qualquer commit** (vale a pena manter esse hábito):

```powershell
# depois de extrair o zip novo e copiar pra dentro de .\frontend, confere que
# uma linha ou trecho ÚNICO da mudança de hoje realmente está no arquivo:
Select-String -Path ".\frontend\js\app.js" -Pattern "ALGO_QUE_SÓ_EXISTE_NA_VERSÃO_NOVA"

# só roda o commit se aparecer resultado:
git add .
git commit -m "mensagem"
git push origin main
```

Depois do push, também dá pra conferir direto no GitHub (`github.com/rodrigojustini/harmonia`,
arquivo `frontend/js/app.js`) se a mudança realmente está lá, antes de testar no site.

---

## 8. Sessão 04/08/2026 (tarde) — Fase 1 do PRO spec: papéis + perfil de membro

**Banco (já aplicado direto em produção via Supabase MCP — `sql/009` e `sql/010`):**
- Papel `lider` criado. Agora `perfis.role` aceita `admin` / `lider` / `member`
- `membros` ganhou: `foto_url`, `whatsapp`, `email`, `bio`, `data_entrada`, `disponibilidade`,
  `ativo`, `instrumentos[]`
- RPCs `promover_lider()`, `remover_lideranca()`, `excluir_membro()` — fazem toda a checagem de
  regra de negócio (líder só remove a própria liderança; admin nunca é afetado por outro papel)
- **Correção de segurança:** antes, a policy de `membros`, `escalas`, `escala_colunas`,
  `escala_linhas` e `escala_celulas` era `isolamento igreja` sem checar papel — ou seja,
  **qualquer membro logado podia editar/excluir escala e membros de outras pessoas**. Agora só
  líder/admin escrevem; membro comum só lê e edita o próprio cadastro em `membros`
  (via `perfil_id = auth.uid()`)
- Bucket `avatars` criado no Storage (público pra leitura, upload restrito por igreja, caminho
  `{igreja_id}/{membro_id}.ext`)

**Frontend:**
- Logo nova (H dourado) aplicada no header, tela de login e favicon
- Aba Membros reescrita: formulário completo (foto, whatsapp, email, bio, instrumentos,
  disponibilidade, status) + grid de cards estilo rede social com badges de Ativo/Inativo/Líder/Admin
- Botões Editar / Excluir (com confirmação) / Tornar líder / Remover liderança nos cards,
  visíveis só pra quem é líder/admin (e "Remover liderança" também aparece pro próprio líder)
- Rodapé com crédito discreto "Desenvolvido por Agência Justini'S"
- `app.js?v=9`

**Pendente pra próxima sessão (ainda dentro do escopo do PRO spec):**
- Item 5 do plano original: papel de líder já feito nesta sessão — falta revisar se
  "Trocas de Escala" também precisa de gate por papel (hoje continua liberado pra todo membro,
  que é o comportamento correto ali)
- Fase 2: Biblioteca particular do vocalista (Meu Repertório) + Mapa musical individual por
  instrumento
- Fase 3: Dashboard novo (estilo Notion/Spotify), tema claro/escuro, Modo Palco
- Limpeza automática de escalas antigas no início do mês
- Estrutura preparatória pra IA (sem integrar ainda)

---

## 10. Sessão 04/08/2026 (tarde) — Fase 2: repertório pessoal + mapa individual

**Banco (já aplicado em produção via Supabase MCP — `sql/011`):**
- Mesma correção de RLS da Fase 1, agora em `musicas`, `cultos` e `culto_musicas`: escrita só
  líder/admin, leitura aberta pra igreja (antes qualquer membro editava o repertório oficial)
- Tabela nova `repertorio_pessoal` — biblioteca particular, uma linha por música, vinculada a
  `perfil_id`. RLS: só o dono vê e edita a própria (nem líder nem admin têm acesso)
- Tabela nova `mapas_individuais` — anotações pessoais por culto (`culto_id` + `perfil_id`
  únicos). RLS: só o dono. Nunca escreve em `culto_musicas` (mapa oficial)

**Frontend:**
- Aba nova "🎼 Meu Repertório": CRUD completo (criar/editar/excluir/pesquisar), reaproveita o
  motor de transposição de cifra já existente
- Dentro de Cultos → ao abrir um culto, aparece o card "Meu Mapa (pessoal)": campo de
  instrumento + anotações livres, salva com upsert por `(culto_id, perfil_id)`
- **Bug corrigido de brinde:** a lista/contagem de músicas do mapa oficial nunca aparecia
  (o código lia `culto.musicas`, mas o shim da API sempre devolvia `culto.musicaIds`) — corrigido
  em `renderCultos` e `mostrarDetalhesCulto`
- Formulários de "Nova música" (repertório oficial) e "Novo culto" agora somem da tela pra quem
  não é líder/admin, coerente com a RLS
- `app.js?v=10`

**Pendente pra próxima sessão:**
- Fase 3: Dashboard novo (estilo Notion/Spotify), tema claro/escuro, Modo Palco
- Limpeza automática de escalas antigas no início do mês
- Estrutura preparatória pra IA (sem integrar ainda)
- Mapa individual hoje é texto livre por culto inteiro; se quiser granularidade por música
  dentro do culto (um mapa por instrumento por música), dá pra evoluir depois

---

## 11. Sessão 04/08/2026 (tarde) — Fase 3: dashboard, tema claro/escuro, Modo Palco

**Banco (já aplicado em produção via Supabase MCP — `sql/012`):**
- `escala_celulas.status_confirmacao` (`pendente` / `confirmado` / `recusado`)
- `musicas.bpm` (opcional, alimenta o Modo Palco)
- RPC `confirmar_presenca(p_celula_id, p_status)` — o próprio músico confirma/desmarca a
  própria célula da escala; líder/admin também podem. Ninguém mais consegue mexer na
  confirmação de outra pessoa

**Frontend:**
- **Tema claro/escuro** — variáveis CSS reorganizadas em `:root`/`[data-theme="light"]`, seletor
  em Config (Escuro/Claro/Sistema), aplica antes do primeiro paint (script inline no `<head>`)
  pra não piscar, salva em `localStorage("harmonia_tema")`. Blocos de código/cifra continuam
  escuros nos dois temas (igual editor de código) — decisão deliberada, não bug
- **Dashboard ("🏠 Início")** virou a aba padrão (Escala passou pra segunda). Cards com dado
  real, sem número inventado: Próximo culto, Último culto, Escala do mês (aprovada/pendente),
  Confirmados, Pendentes, Vagas em aberto, atalho "Abrir Modo Palco"
- **Confirmação de presença** — badge ✅/⏳ clicável na própria célula da grade de Escala
  (só aparece na célula que é sua). É o que alimenta os contadores do dashboard
- **Modo Palco ("🎤")** — tela cheia sem menu, dropdown pra escolher o culto, navega música por
  música do mapa oficial (Anterior/Próxima), mostra tom + BPM + observações da música,
  cronômetro simples (clique inicia/pausa, duplo-clique zera)
- `app.js?v=11`

**Pendências reais que ficaram de fora (documentando pra não esquecer):**
- Limpeza automática de escalas antigas no início do mês — não entrou nesta fase
- Estrutura preparatória pra IA (sugestão de música/escala) — não entrou
- Loading elegante / skeletons / animações de transição entre abas — o app ainda usa
  `alert()`/notificação simples em alguns fluxos antigos (trocas, algumas ações de escala);
  o padrão novo (`showNotification`) já está em uso nas telas mais recentes, mas não foi
  retroaplicado em tudo
- "Instrumentos faltando" no dashboard hoje é genérico ("vagas em aberto" = células sem
  ninguém atribuído); não cruza com o cadastro de instrumentos de cada membro ainda

---

## 12. Sessão 04/08/2026 (tarde) — Correção real do tema claro + repaginada visual

O tema claro "não fazia nada" porque **duas coisas** estavam erradas ao mesmo tempo:

1. `style.css` nunca tinha `?v=` de cache-busting (diferente do `app.js`, que sempre teve).
   O navegador ficava servindo uma cópia velha do CSS pra sempre — corrigido na sessão anterior
   (`?v=2`), mas sozinho não resolveu tudo.
2. **O bug de verdade:** dezenas de regras no CSS (e vários trechos de HTML gerado no `app.js`)
   tinham cor fixa (`#bbb`, `#1a1418`, `rgba(10,10,10,0.9)` etc.) em vez de usar as variáveis de
   tema. No claro, o fundo virava creme mas o texto/cartão continuava escondido atrás de fundo
   escuro fixo — por isso "o nome quase some" e os cards pareciam não mudar.

**O que foi corrigido (auditoria completa, não só os pontos reportados):**
- `.card`, `.membro-card`, `.dash-card`, `.list-item`, inputs/`select`/textarea, modal, badges de
  histórico/troca — tudo migrado pra variáveis de tema (`--texto-secundario`,
  `--texto-terciario`, `--input-bg`, `--superficie-sutil`, etc.)
- Cabeçalho, rodapé e tela de login continuam **propositalmente escuros nos dois temas** —
  é a identidade de marca (dourado sobre grafite, como a logo), não muda com o tema. Corrigi o
  texto deles pra cor fixa clara (antes usava a variável que trocava e sumia)
- Blocos de cifra/código e a caixinha de link de compartilhamento também ficam escuros sempre
  (como um editor de código) — só que agora o texto deles tem cor fixa clara garantida (antes
  também sumia no tema claro por herdar a variável errada)
- `color-scheme: dark` / `light` no `:root` pra selects, scrollbars e outros controles nativos
  do navegador acompanharem o tema

**Repaginada visual ("cards flutuantes", pedido explícito):**
- `.card`, `.dash-card`, `.membro-card` e `.modal-content` ganharam sombra em duas camadas
  (`--sombra-card` / `--sombra-card-hover`) e leve elevação (`translateY`) no hover — efeito de
  flutuação real, não só borda
- Bordas mais sutis e coerentes (`--cor-borda-sutil`) em vez de branco fixo em opacidade baixa

**CSS morto identificado (não usado em lugar nenhum, não mexi):** `.calendario-grid`,
`.calendario-dia`, `.musica-tom`, `.dia-membros`, `.membro-item` — sobras de uma versão anterior
da grade de escala (antes da migração pra formato planilha). Pode ser removido num cleanup futuro.

`style.css?v=3`, `app.js?v=12`.

---

## 13. Sessão 04/08/2026 (tarde) — Cabeçalho: usuário virou mini-card, abas ganharam espaço

Achado real (não só estético): o JS forçava `header.style.display = 'flex'`, o que colocava
logo, abas e informação do usuário **todos numa única linha horizontal**, disputando espaço —
por isso o nome/igreja/papel ficava espremido colado nas abas em telas menores.

**Correção:**
- Header voltou a ser um bloco empilhado: linha 1 = logo + nome do app + mini-card do usuário
  (alinhado à direita), linha 2 = abas (com todo o espaço horizontal só pra elas)
- Informação do usuário virou um chip/mini-card flutuante de verdade (fundo sutil, borda,
  cantos arredondados) com o papel (Admin/Líder/Membro) em um selo dourado separado, em vez de
  texto corrido com parênteses
- Em telas estreitas (≤640px) o mini-card quebra pra largura total, embaixo do logo, em vez de
  espremer

`style.css?v=4`, `app.js?v=13`.

---

## 9. Workflow padrão (repetindo o que já vale)

1. Você pede a próxima fase
2. Eu edito o código, aplico migrations direto no Supabase (quando aplicável) e gero um zip com
   nome novo (`harmonia-vN.zip`)
3. Você roda o bloco PowerShell (extrai, copia, confere, commita)
4. Netlify publica sozinho
5. Você testa e me avisa
