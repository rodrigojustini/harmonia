# Prova de Fogo — Harmonia em múltiplos aparelhos
06/08/2026

## O que eu consigo garantir de verdade (testado agora)

Não tenho como fisicamente segurar um tablet ou um Android e testar na mão — mas fiz
o que dava pra fazer de rigoroso: auditoria profunda do CSS responsivo procurando
onde quebraria de verdade (não só "parece que funciona"), e cruzamento com **tráfego
real de produção** (você e a Jaise usando em desktop e iPhone essa semana).

## 🔴 Bugs reais encontrados e corrigidos agora

### 1. iOS dava zoom sozinho em qualquer campo de formulário
Todo `input`/`select`/`textarea` do site usava fonte de 14.4px. O Safari do
iPhone/iPad tem uma regra: **campo com fonte menor que 16px faz a página inteira dar
zoom ao tocar nele**. Isso afetava login, cadastro de membro, música, cultos —
literalmente todo formulário do app, pra qualquer usuário de iPhone/iPad.
**Corrigido:** fonte de todo campo subiu pra 16px (`1rem`).

### 2. Botão de confirmar presença (✅/⏳) quase impossível de tocar no celular
O selo de confirmação de presença na grade de Escala não tinha nenhum espaçamento —
só o tamanho do emoji. Numa tela de celular, isso é um alvo minúsculo, fácil de errar
o toque (ou tocar sem querer no nome do vizinho na tabela). **Corrigido:** aumentei a
área clicável com padding, sem mudar o visual.

### 3. Botões de remover coluna/linha da escala, mesma coisa (menor ainda)
**Corrigido:** mais espaço de toque.

### 4. Abas do menu (Início, Escala, Trocas...) apertadas no celular
Com 11 abas, o menu já rola horizontalmente (isso já funcionava certo), mas o alvo de
toque de cada aba era pequeno. **Corrigido:** abas maiores especificamente em telas
de celular (não mexeu no desktop).

## 🟢 Confirmado nos logs reais de produção

- **iPhone (iOS 18, Safari):** dezenas de requisições reais essa semana, **100% com
  sucesso** no servidor — escala, membros, músicas, cultos, tudo respondendo certo.
  A única coisa que não aparecia no log era o "zoom chato" (isso não conta como erro
  de servidor, é comportamento visual do navegador — corrigido no item 1 acima)
- **Desktop Windows/Chrome:** mesma coisa, uso pesado, zero erro de servidor
- **O bug que você acabou de reportar** (editar próprio perfil) apareceu no log como
  4 tentativas com erro `403` — exatamente na hora que você testou, confirmando que
  o diagnóstico e a correção anterior foram certeiros. Logo depois já aparece um
  `PATCH 204` de sucesso com upload de foto — a correção já está funcionando de
  verdade em produção

## 🟡 Verificado no código, sem problema encontrado

- **Tabela da Escala em tela pequena:** já tinha rolagem horizontal própria
  (`overflow-x: auto`), não quebra nem espreme em celular — isso já estava certo
- **Grades de cards (Membros, Dashboard):** usam larguras mínimas flexíveis que
  colapsam pra 1 coluna sozinhas em tela estreita, sem estourar — testado até a
  largura de um iPhone SE (320px), não tem elemento fixo maior que a tela
- **Meta viewport:** configurado certo nas duas páginas (`index.html` e
  `definir-senha.html`)

## ⚪ O que só dá pra confirmar testando na mão mesmo

Isso eu não consigo simular sozinho — preciso que você (ou alguém do time) confirme
fisicamente:

- [ ] **Tablet (iPad ou Android)** — abrir o app, testar Escala, Modo Palco e
  Membros. O layout deveria ficar em 2 colunas nos formulários (a partir de ~768px de
  largura)
- [ ] **Celular Android** (além do iPhone que já testamos) — mesma bateria de testes,
  principalmente o Modo Palco com a tela ligada por tempo longo (o "Wake Lock" que
  mantém a tela acesa durante o culto)
- [ ] **Rotação de tela** — girar o celular/tablet no meio do uso e ver se algo quebra
- [ ] **Conexão ruim** (3G ou wi-fi fraco da igreja) — ver se os toasts de erro
  aparecem direito quando uma ação demora ou falha, e se não trava a tela
- [ ] **Modo Palco durante o culto de verdade** — é o teste mais importante que
  falta, porque é literalmente o cenário real de uso (celular na mão, luz baixa,
  tela ligada por 1h+)

## Resumo

Achei e corrigi 4 problemas reais de usabilidade em celular (zoom automático + 3
alvos de toque pequenos demais) — esses eram **bugs de verdade**, não
"pode melhorar". O resto que auditei no código já estava certo. Os logs de produção
confirmam zero erro de servidor em iPhone e desktop essa semana. Falta só validação
física em tablet/Android e, o mais importante, um teste real durante um culto.
