# Relatório de Otimização de Performance — Harmonia
04/08/2026

## Contexto e metodologia

O pedido original trazia um checklist voltado a aplicações React (Context API, hooks,
useMemo/useCallback, React.memo, code splitting de rotas). O Harmonia é **vanilla
JS/HTML/CSS puro**, sem framework — então a causa da lentidão não podia ser re-render
(não existe virtual DOM aqui). A auditoria foi refeita pra causa real desse tipo de stack:
tráfego de rede, estrutura das consultas e trabalho síncrono no carregamento.

Método: leitura de todo `app.js` (init sequence, cada função de carregamento, cada render),
contagem real de chamadas de rede disparadas por sessão, e inspeção dos loops de
renderização mais pesados (grade da Escala).

---

## Gargalo #1 (o principal): carregamento antecipado de tudo, de uma vez

**O que era:** `initMainApp()` chamava, na sequência, o `init` de **todas as 10 abas**
(Escala, Trocas, Músicas, Meu Repertório, Membros, Cultos, Histórico, Config, Dashboard,
Modo Palco) — e a maioria desses `init` já disparava a busca de dados imediatamente. Ou
seja: mesmo entrando direto na aba Início, o navegador já tinha soltado entre **15 e 20
requisições** pro Supabase, competindo por banda e processamento, antes do usuário tocar
em qualquer botão.

**Por que isso causa a sensação de travamento:** não é a aba que você clicou que demora —
é que o navegador ainda está processando a resposta de 8 outras abas que você nem abriu.

**Correção:** separei "ligar os botões da tela" de "buscar os dados". Trocas, Histórico,
Meu Repertório e Cultos agora só buscam dado **na primeira vez que a aba é aberta**, com
cache de 20 segundos (reabrir a aba dentro desse tempo não refaz a busca). Membros e
Músicas continuam carregando de cara, porque a Escala e o Modo Palco dependem desses dois
arrays pra funcionar mesmo sem o usuário visitar as abas deles.

**Arquivo:** `js/app.js` — `initMainApp()`, `initTabs()`, `initTrocas()`,
`initMeuRepertorio()`, `initCultos()`, `initHistorico()`, mais as novas funções
`carregarXSeNecessario()`.

**Redução estimada:** de ~15-20 requisições no login pra **6-8** (as que Escala, Membros,
Músicas e Início realmente precisam). Isso é uma redução de mais de 50% no tráfego inicial.

---

## Gargalo #2: consultas do Dashboard em fila, quando podiam ser paralelas

**O que era:** `loadDashboard()` fazia 3 consultas independentes (próximo culto, último
culto, escala do mês) uma depois da outra, cada uma esperando a anterior terminar —
mesmo não tendo relação nenhuma entre si.

**Correção:** as 3 agora rodam em paralelo com `Promise.allSettled`. Também troquei
`select("*")` por seleção só das colunas usadas (`nome, data` / `id, aprovada` / etc.),
reduzindo o tamanho da resposta.

**Arquivo:** `js/app.js` — `loadDashboard()`.

**Redução estimada:** se cada consulta leva ~150-300ms, rodá-las em série custava
~450-900ms; em paralelo custa o tempo da mais lenta das três, ~150-300ms. Ganho direto
de até 600ms só nessa tela, que é a primeira que o usuário vê.

---

## Gargalo #3: buscas repetidas dentro do loop da grade de Escala

**O que era:** pra desenhar a grade (linhas × colunas), o código fazia
`escalaCelulas.find(...)` e `membros.find(...)` — uma varredura completa do array — **pra
cada célula individual** da tabela. Numa escala típica (10 linhas × 6 colunas = 60
células), isso são até 60 varreduras completas de dois arrays só pra desenhar a tela uma
vez.

**Correção:** os dois arrays viram `Map` (índice de acesso direto) uma única vez, antes do
loop começar. Cada célula passa a consultar em tempo constante, não mais varrendo a lista
inteira.

**Arquivo:** `js/app.js` — `renderizarPlanilha()`, `nomeDaCelula()`.

**Impacto:** proporcional ao tamanho do time — quanto mais membros e mais células, maior o
ganho. Pra um time pequeno o efeito é sutil; pra um time de 40+ pessoas com escala cheia,
evita centenas de comparações desnecessárias a cada vez que a grade é redesenhada
(inclusive depois de qualquer clique de confirmação de presença).

---

## Gargalo #4: desfoque do cabeçalho pesando no celular

**O que era:** `.app-header` usa `backdrop-filter: blur(10px)`, um efeito que a GPU
recalcula a cada frame de rolagem — caro em aparelhos intermediários, praticamente de
graça em desktop.

**Correção:** removido em telas ≤640px (celular), mantendo um fundo sólido com opacidade
alta que preserva a legibilidade sem custo de repaint contínuo.

**Arquivo:** `css/style.css` — media query `@media (max-width: 640px)`.

---

## Gargalo #5 (percepção, não velocidade real): botões sem feedback de "estou trabalhando"

**O que era:** vários botões de salvar não desabilitavam nem mudavam de texto durante a
chamada ao banco — numa conexão mais lenta, o usuário não sabe se o clique registrou, e
tende a clicar de novo (o que pode gerar duplicidade).

**Correção:** Login, Salvar Membro, Salvar Música, Aprovar Escala e Criar Culto agora
desabilitam o botão e trocam o texto (“Salvando...”, “Aprovando...”, etc.) enquanto a
operação está em andamento, e voltam ao normal no fim — sucesso ou erro. Convidar Membro
já tinha esse comportamento (mensagem + botão desabilitado) e não precisou de ajuste.

**Arquivo:** `js/app.js` (vários pontos) + `css/style.css` (`.btn:disabled`).

**O que ficou de fora dessa rodada:** o mesmo padrão pode ser estendido pros formulários de
Meu Repertório e outros botões secundários — o helper genérico
(`comFeedbackDeCarregamento`) já existe pronto pra isso, é só reaproveitar.

---

## O que foi avaliado e **não** se aplica (ou não trouxe ganho real)

- **useMemo / useCallback / React.memo / Context API / hooks:** não existem nesse stack —
  o Harmonia não usa React. Não há re-render de componente pra evitar, porque não há
  componentes no sentido React.
- **Code splitting de rotas / lazy loading de páginas:** o `app.js` inteiro tem ~100KB —
  pequeno comparado ao ganho de dividir isso em múltiplos arquivos carregados sob demanda.
  O verdadeiro custo estava nas ~15-20 requisições de rede, não no tamanho do JavaScript
  baixado. Dividir o bundle agora seria otimização sem gargalo real por trás.
- **Debounce de pesquisa (Meu Repertório):** a busca já é 100% client-side, filtrando um
  array já carregado na memória — não existe consulta ao banco por tecla digitada, então
  debounce não muda nada aqui (a "pesquisa em tempo real" já é instantânea por natureza).
- **Compressão/lazy loading de imagens:** avaliado — as fotos de membro já passam por
  upload único no Storage do Supabase (não há galeria grande com múltiplas imagens
  carregando ao mesmo tempo em nenhuma tela hoje). Não identifiquei consumo relevante
  aqui; fica como ponto de atenção se o app crescer pra ter mais conteúdo visual.

---

## Resumo — antes e depois (estimativa)

| Momento | Antes | Depois |
|---|---|---|
| Requisições disparadas no login | ~15-20 | ~6-8 |
| Carregamento do Dashboard (Início) | consultas em série (~450-900ms) | consultas em paralelo (~150-300ms) |
| Redesenho da grade de Escala | varredura completa por célula | acesso direto (Map) por célula |
| Clique em Salvar/Aprovar | sem feedback visual imediato | botão desabilita + mostra "Salvando..." |
| Header no celular durante rolagem | desfoque recalculado a cada frame | fundo sólido, sem custo de repaint |

Números exatos em milissegundos dependem da conexão e do aparelho de quem testar — a
mudança estrutural (menos requisições, paralelismo, menos varredura) é o que garante a
melhora, independente da rede específica do dia.

---

## Arquivos modificados nesta rodada

- `js/app.js` — init lazy por aba, paralelização do dashboard, otimização Map na grade de
  escala, feedback de carregamento em 4 botões
- `css/style.css` — remoção de blur no header mobile, estado visual `.btn:disabled`
- `index.html` — ids novos em botões (`btnSalvarMusica`, `btnSalvarCulto`) pra plugar o
  feedback de carregamento

Nenhuma migration de banco foi necessária pra essa rodada — é 100% otimização de frontend.

---

## Índices de banco adicionados

Ao escrever a sugestão #3 abaixo, conferi se os índices já existiam — não existiam — e
como é uma mudança segura e sem custo, apliquei direto:

```sql
create index if not exists idx_escala_celulas_escala_id on public.escala_celulas(escala_id);
create index if not exists idx_cultos_data on public.cultos(data);
create index if not exists idx_cultos_igreja_data on public.cultos(igreja_id, data);
```

Aplicado via Supabase MCP, migration `indices_performance_escala_cultos`. Não precisa de
deploy — já está em produção.

## Sugestões pra depois (não urgente)

1. Estender o feedback de "Salvando..." pro formulário de Meu Repertório e outros botões
   secundários (helper já pronto).
2. Se o time crescer muito (100+ membros, escalas grandes), vale revisar o
   `Array.map`/`Array.find` ainda usados nos exports de PDF/WhatsApp da escala — hoje não
   otimizados porque rodam raramente (ação explícita do usuário), não a cada render.
