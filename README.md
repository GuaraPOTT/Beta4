# Nubanko Chronicles — Engine

Visual Novel + RPG de combate por turnos estilo Persona 5. Vanilla HTML/CSS/JS,
sem build step (ES Modules nativos do navegador).

## Como rodar

Módulos ES exigem HTTP (não abrem via duplo-clique/`file://`). Qualquer servidor estático resolve:

```bash
python3 -m http.server 8000
# ou: npx serve .
```

Depois acesse `http://localhost:8000`.

## Estrutura

```
index.html
css/style.css
js/
  data.js           dados: elementos, golpes, itens, personagens, inimigos, cenas, áudio
  utils.js          helpers puros (aguardar, clamp, escolherAleatorio, precarregarImagens)
  gameState.js      party PERSISTENTE + inventário + save/load (localStorage)
  audioManager.js   BGM (cross-fade) + SFX (buffers) + mixagem por canal + hooks
  uiManager.js      todo o DOM: HUD, battlefield, menus, transições, popups, Ataque Total
  combatEngine.js   regras de combate: fraqueza/down/one-more/baton pass/ataque total/itens
  sceneManager.js   orquestra VN + combate, é o único módulo que liga os dois
  main.js           boot: preload, save/load, inicia a cena 1 (sem cálculo de viewport — ver 4ª rodada)
img/, audio/         assets (você precisa fornecer os arquivos — veja abaixo)
test_*.mjs            testes de integração (opcionais, veja "Testes")
```

Dependências entre módulos (sem ciclos):
`data.js` ← `gameState.js`, `combatEngine.js`, `sceneManager.js`
`utils.js` ← `uiManager.js`, `combatEngine.js`, `main.js`
`audioManager.js` ← `uiManager.js`, `combatEngine.js`, `sceneManager.js`, `main.js`
`uiManager.js` ← `combatEngine.js`, `sceneManager.js`, `main.js`
`combatEngine.js` ← `sceneManager.js`
`sceneManager.js` ← `main.js`

`combatEngine.js` **nunca** importa `sceneManager.js` — ele avisa vitória/derrota via
callbacks (`aoVencer`/`aoPerder`) injetados por quem chama `iniciarCombate()`. Isso evita
dependência circular e mantém o motor de combate reutilizável fora do contexto de VN.

## Assets que faltam

O código referencia esses caminhos (definidos em `data.js`); troque pelos seus arquivos reais:

- `img/`: `fundo.jpg`, `nubanko.png` (+ `_ataque`/`_defesa`/`_dano`), `nubanko_dialogo.png`,
  `nubanko_dialogo_assustado.png`, `inimigo.png` (+ variantes), `invocacao.gif`
- `audio/`: 4 BGMs (`bgm_dialogo/combate/derrota/vitoria.mp3`) + ~15 SFX (veja `AUDIO_MANIFEST`
  em `data.js`)

Se um arquivo estiver ausente, o jogo **não trava** — `AudioManager` e `precarregarImagens`
registram um aviso no console e seguem em frente.

## Como estender

**Novo aliado:** adicione uma entrada em `PERSONAGENS` (`data.js`, há um exemplo comentado)
e inclua o `id` no array `party` de uma cena de combate.

**Novo inimigo:** mesma ideia em `INIMIGOS`, incluído no array `inimigos` da cena.

**Nova cena:** adicione um objeto em `BANCO_DE_CENAS`. Campos disponíveis:
`tipo` (`'dialogo'`|`'combate'`|`'derrota'`), `bgm`, `imagemFundo`, `sfxEntrada` (som único ao
carregar), `transicao` (`'fade'`|`'crossfade'`|`'manga'`), `curarPartyAntes` (cura a party
antes desta cena).

**Novo elemento:** adicione em `ELEMENTOS` (`data.js`) e use o mesmo texto como `tipo` nos
golpes e nos arrays `fraquezas`/`resistencias`/`nulo`/`absorve` dos personagens/inimigos.

**Novo golpe:** adicione em `BIBLIOTECA_GOLPES` (party) ou `BIBLIOTECA_GOLPES_INIMIGOS`
(inimigos), e referencie o `id` no array `golpes` do personagem/inimigo.

**Ajustar balanceamento:** constantes no topo de `combatEngine.js`
(`MULTIPLICADOR_FRAQUEZA`, `INCREMENTO_BATON_PASS`, `CHANCE_CRITICO`, etc).

## Decisões de design (para você saber o que esperar)

- **HP/SP da party persiste entre batalhas** (`gameState.js`). Isso é intencional — dá peso
  a enfrentar 2 combates seguidos (a 2ª luta da demo usa `curarPartyAntes: true` para
  ilustrar o outro caso). Inimigos são sempre instâncias novas a cada combate.
- **"Down" dura exatamente 1 fase perdida**, tanto para party quanto para inimigos: quem
  leva um golpe na fraqueza fica "down", perde a próxima ação, e volta ao normal na ação
  seguinte.
- **A regra de Fraqueza → Down → ação extra vale para os dois lados.** Se um inimigo acertar
  a fraqueza de um aliado, ele também ganha uma ação de bônus (limitada a 2 encadeamentos,
  pra não travar o jogo).
- **Baton Pass** só aparece como opção dentro do prompt de "ONE MORE!" (não fica solto no
  menu principal). Cada passagem soma +25% de dano, aplicado (e zerado) no próximo golpe.
- **Ataque Total (All-Out Attack)**: a checagem (`_todosInimigosDown()`) roda logo depois de
  qualquer golpe que derrube um inimigo — golpe normal OU item ofensivo, já que os dois
  passam pelo mesmo `_resolverAtaqueContraInimigo()`. Com **1 único inimigo em cena**, ele
  ficar down já satisfaz "todos down", então o Ataque Total pode aparecer na primeira
  fraqueza explorada — isso é literal ao critério pedido (`every(i => i.down || i.hp<=0)`),
  não é bug. Cancelar preserva o One More normal (com Baton Pass, se houver outro aliado
  disponível); confirmar aplica dano "neutro" (~35 ± 15%, sem checar fraqueza/resistência)
  a todos os inimigos vivos e limpa o "down" de quem sobreviver.
- **Itens** consomem o turno do personagem como um ataque normal. Itens ofensivos (ex.:
  Bomba de Fogo) passam pelo **mesmo** cálculo de dano dos golpes — "dano fixo" no pedido
  original foi interpretado como "valor-base fixo" (não escala com atributos), não como
  "ignora fraqueza/resistência"; então um item elemental também pode gerar Down / One More
  / Ataque Total, igual a uma habilidade normal.
- **Save/Load** guarda HP/SP atuais + inventário no `localStorage` (chave
  `nubanko_chronicles_save`). Propositalmente **não** guarda em qual cena o jogador estava —
  ao carregar, a história recomeça da cena 1, só com status/itens preservados (ver
  comentário em `main.js` sobre como estender isso pra retomar o capítulo exato).
- **Seleção de alvo é dupla**: toque no sprite no campo de batalha OU toque num botão de
  texto com o nome/HP do alvo — o que resolver primeiro vale. Isso evita depender só de
  acertar um sprite pequeno no celular.
- **Memória/performance**: os "poses" de sprite (`animarPose`) só voltam ao idle se o
  elemento ainda estiver no DOM e a entidade ainda viva (`img.isConnected`), então trocar de
  cena no meio de uma animação não deixa timers zumbis mexendo em nós removidos.

## Refatoração de UI de combate e correção de SP (2ª rodada)

- **Battlefield**: `#party-row` agora ancora à esquerda e `#enemy-row` à direita
  (espelhados, cada um crescendo em direção ao centro), ambos com `max-width` +
  `flex-wrap: wrap-reverse` — se não couberem numa linha, quebram, e a linha
  extra empilha **para cima** (o "chão" da 1ª linha nunca se move). Cobre de 1
  a 6 combatentes por lado via `.combat-row[data-count="N"]`.
- **HUD**: z-index subiu para 1000 (bem acima de tudo no battlefield) e agora
  mostra também a barra de SP (além da de HP) — só para entidades com
  `spMax` definido (inimigos não têm, então não aparece pra eles).
- **Menu de combate**: virou um "menu sanduíche" — `#battle-menu-container`
  guarda um botão-gatilho (`#battle-menu-toggle`, sempre em posição fixa) e o
  painel de opções (`#battle-menu`) expande **para cima** dele sob toque.
  Ele começa sempre recolhido a cada nova decisão e recolhe de novo sozinho
  assim que uma ação é de fato disparada (mesmo ponto de código que já existia
  para `limparBattleMenu()` — não precisei caçar cada chamada de render).
  Navegar entre submenus (Atacar → golpes → alvo) NÃO fecha o menu no meio do
  caminho — só a ação final dispara o recolhimento.
- **Viewport mobile**: a medida que define o tamanho de `#game-container` agora
  vem de `#viewport-lock.getBoundingClientRect()` (que já resolve `100dvh` via
  CSS) em vez de `window.innerWidth/innerHeight`. Também adicionei um
  `ResizeObserver` no próprio `#viewport-lock`, além dos listeners tradicionais
  de `resize`/`orientationchange` — assim a barra de endereço aparecendo/
  sumindo no Chrome/Safari mobile é capturada de forma mais confiável.
- **Bug de SP corrigido**: `_executarAcaoJogador` nunca lia `golpe.custoSp` nem
  descontava de `ator.sp` — por isso o SP "nunca acabava". Agora: (1) o motor
  bloqueia a ação se `custoSp > ator.sp` (defesa mesmo que a UI falhe), (2) o
  SP é subtraído de fato ao usar o golpe, (3) `renderizarMenuGolpes` desabilita
  visualmente (`disabled` + classe `.indisponivel`) qualquer golpe que o
  personagem não possa pagar, mostrando o custo no rótulo do botão.

**Limite importante da minha suíte de testes**: os testes usam `jsdom`, que
**não faz layout/renderização visual de verdade** — `getBoundingClientRect()`
sempre volta zerado ali. Isso significa que eu consigo verificar com certeza
que o SP desconta certo, que o menu expande/recolhe na hora certa, que a
contagem de sprites/HUD está correta etc. — mas **não consigo verificar
automaticamente se os sprites realmente não se sobrepõem na tela, ou se a
proporção ficou boa visualmente**. Essa parte pede um teste visual seu, num
navegador de verdade (idealmente no celular alvo). Ajustei os números
(`max-width`, `%` de altura, `vh` de HUD) com a matemática do CSS box model em
mente, mas recomendo abrir e olhar antes de considerar fechado.

**Novo item:** adicione uma entrada em `BIBLIOTECA_ITENS` (`data.js`) com `tipo`
(`'cura_hp'` | `'cura_sp'` | `'ataque'`), `alvo` (`'aliado'` | `'inimigo'`), `valor`, e
`elemento` se for ofensivo. Dê estoque inicial em `INVENTARIO_INICIAL` se quiser que a
party já comece com ele.

**Ajustar o Ataque Total:** `DANO_ATAQUE_TOTAL_BASE` e `VARIANCA_ATAQUE_TOTAL`, no topo de
`combatEngine.js`.

**Autosave:** hoje `salvarJogo()` só é chamado se você chamar (não há autosave automático
ainda). Um bom gatilho natural seria dentro de `SceneManager._aplicarCena()`, no fim de cada
transição de cena — mas isso foi deixado de fora de propósito, já que o pedido original era
só a infraestrutura de save/load em si.

## Reformulação de layout baseada em mockup (3ª rodada)

- **Barras HP/SP compactas**: o valor ("100/100") agora fica num `<span class="hud-bar-texto">` absoluto, centralizado sobre o preenchimento da própria barra — sem mais linha de texto separada (`.hud-status`/`.hud-status-sp` foram removidas). Sem prefixo "HP"/"SP": a cor (verde/azul) e a posição (SP sempre logo abaixo de HP) já comunicam isso.
- **DOWN em linha própria**: saiu de dentro de `.hud-name` (onde expandia a caixa horizontalmente) e virou um bloco (`.hud-down-linha`) logo abaixo da barra de HP — nunca alarga o card.
- **Log de batalha centralizado**: `#nav-comentario` deixou de ficar ancorado à direita e agora fica centralizado no topo absoluto da tela (`left:50%; transform:translateX(-50%)`), como no mockup.
- **Party em stack sobreposto**: `#party-row` virou um `display:grid` onde todo mundo ocupa `grid-area:1/1` (mesma célula, sobrepostos). `UIManager.definirAtorAtivo(id)` alterna quem recebe `.active` (colorido, 105%, z-index alto) e `.inactive` (recuo, 80%, `filter: brightness(.3) sepia(1) hue-rotate(190deg)`). `CombatEngine._renderizarMenuPrincipal()` já chama isso sozinho sempre que um personagem entra em ação — não precisei espalhar a chamada por vários pontos.
- **Inimigos centro-direita**: `#enemy-row` agora ancora em `left:58%` (centralizado, mas deslocado à direita), com `max-height` em **dvh** por contagem (de 64dvh com 1 inimigo até 28dvh com 5+, exatamente a marca que você pediu), `flex-wrap:wrap-reverse` (quebra sem vazar, linha extra empilha pra cima) e um leve escalonamento vertical alternado (`nth-child(even)`) simulando a formação de esquadrão do mockup.
- **Menu horizontal**: `#battle-menu` trocou a transição de `max-height` (crescia pra cima) por `max-width` (cresce ao lado do botão `☰ AGIR`), com `flex-direction:row` + `flex-wrap:wrap` nos botões. A lógica de expandir/recolher em JS **não mudou nada** — só a direção no CSS, então nenhum teste de comportamento do menu precisou ser tocado.
- **Item 5 (SP) já estava implementado** desde a rodada anterior — reconfirmei com os testes que segue funcionando após toda essa reestruturação (ver grupo 1 de `test_ui_and_sp.mjs`).

**Interpretações que precisei assumir** (o mockup não define isso em pixels, então usei julgamento de engenharia):
- "Centralizado tendendo à direita" virou `left:58%` — um deslocamento modesto à direita do centro puro. Se quiser mais deslocado, é só esse número.
- O leve "zigue-zague" da formação inimiga no mockup virei um `margin-bottom` alternado simples — não uma réplica pixel-a-pixel do ângulo exato do desenho.
- Os retratos da party (bust art, não sprite de corpo inteiro) são um recurso de ARTE que você fornece — o código não exige um tipo específico de imagem, só posiciona/estiliza o que houver em `spriteCombate`.

Reforçando o mesmo ponto de honestidade de antes: nada disso foi verificado visualmente por mim (jsdom não renderiza layout real). O que testei automaticamente foi o que é *lógica/estado*: `definirAtorAtivo` aplica as classes certas, o SP desconta e trava certo, o "DOWN" saiu de dentro do nome. A aparência final — se a formação ficou parecida com o mockup, se nada se sobrepõe do jeito errado — pede sua conferência visual num navegador real.

## Correções de layout (4ª rodada) — leia o ponto 2 com atenção

- **(1) Ícone de fraqueza removido de vez** — não estava no seu pedido original, eu que adicionei
  por conta própria lá na primeira entrega, e ele fazia a caixinha do inimigo crescer
  verticalmente ao ser revelado. Removido de `_criarHudCard` (`uiManager.js`). O card do
  inimigo agora tem `max-height` fixo (108px desktop / 88px mobile) como trava física.
- **(2) Fim do letterbox 16:9 — TENSÃO COM UM PEDIDO ANTERIOR, sinalizando por transparência**:
  a barra preta lateral não era um bug — era o resultado direto e correto do pedido original
  ("trava a proporção... para evitar distorções", 1ª rodada). Removi esse travamento: `#game-container`
  agora é `100%/100dvh` puro, sem cálculo de JS nenhum (`ajustarViewport()` foi removido do
  `main.js`). Isso significa que a proporção da cena vai variar conforme a janela do navegador —
  não há mais garantia de "sempre 16:9". O risco de distorção citado originalmente continua
  mitigado porque todo sprite usa `object-fit:contain` (a imagem em si nunca estica/distorce,
  só a composição da cena ao redor dela varia). Se depois de ver isso rodando você preferir
  um meio-termo (ex.: só limitar proporções muito extremas), me avisa que ajusto.
- **(4) Causa técnica real do "empilhado verticalmente"**: `vh`/`dvh` são sempre relativos ao
  **viewport inteiro**, nunca ao elemento pai. Como `#game-container` antes era menor que o
  viewport (por causa do letterbox do item 2), os `dvh` que eu tinha colocado nos inimigos
  ficavam maiores que o próprio container e estouravam o `overflow:hidden`, cortando/
  empurrando sprites. Resolvendo o item 2, essa causa raiz some. Além disso, troquei
  `#enemy-row` para usar exatamente os valores que você especificou (`flex-direction:row`,
  `justify-content:center`, `align-items:flex-end`, `gap:15px`, `width:55%`, sprite
  `height:35vh; width:auto`) — mantive meus seletores (`#enemy-row`, `.combat-slot`) em vez de
  criar `.enemy-cluster`/`.enemy-slot` novos, pra não precisar tocar no `uiManager.js` à toa,
  mas o CSS efetivo é o que você pediu. Só adicionei uma rede de segurança extra pra 4+
  inimigos (reduz `height` e soma um `max-width`), já que seu snippet não tinha essa variação.
- **(3) HUD dos inimigos em coluna vertical de verdade**: `#enemy-hud-group` (e também
  `#party-hud-group`, pra ficar consistente com o seu mockup original) agora são
  `flex-direction: column` de fato — antes eram `flex-wrap:wrap` (o que podia parecer linha
  horizontal dependendo da largura disponível). `align-items: flex-end` na direita,
  `flex-start` na esquerda, exatamente como pedido.
- **(5) Party subiu, menu desceu, z-index resolve a sobreposição**: `#party-row` foi de
  `bottom: 2%`-ish para `bottom: 10%`. `#battle-menu-container` foi de `bottom:30px` pra
  `bottom:2%` e de `left:30px` pra `left:15px`. E o z-index do menu caiu de 400 pra **15** —
  de propósito, menor que o `.active` da party (`z-index:20`): se as áreas ainda assim se
  tocarem, quem aparece na frente é sempre o personagem, nunca o menu por cima do rosto dele.
- **(6) Log de batalha isolado**: `#nav-comentario` foi de `top:20px` pra `top:5%`, ganhou
  `width:fit-content` (só ocupa o espaço que o texto precisa) com um `max-width:70vw` de
  segurança pra mensagens longas não baterem nas bordas.

Reforçando outra vez, porque essa rodada tocou bastante em posicionamento: continuo sem
conseguir renderizar/ver isso de verdade (jsdom não faz layout visual). O que testei e
confirmei automaticamente foi o que é lógica/estrutura — o ícone de fraqueza realmente não
é mais criado (nem o elemento existe no DOM), o card tem só os 3 elementos esperados, o menu
some/aparece corretamente. A composição visual final — se ficou de fato parecida com o
mockup depois de tudo isso — só a sua tela confirma.

## O que NÃO foi implementado (próximos passos sugeridos)

- **Salvar/restaurar a cena atual** (retomar "de onde parou" na história, não só o status).
- **UI de save/load** (hoje é só a infraestrutura em `GameState`; não há botão "Salvar" nem
  tela de "Continuar" — só o hook de boot em `main.js`).
- Save/load usa `localStorage`, que é por origem (domínio+porta); se você trocar a porta do
  servidor local entre sessões, o save "some" (na verdade só está sob outra origem).
- **Inventário fora de combate** (comprar/usar itens fora de batalha).

## Testes (opcionais)

Quatro arquivos sobem um DOM real via `jsdom` e exercitam o jogo de ponta a ponta —
não são necessários para rodar o jogo, servem para validar mudanças futuras:

- `test_combat_integration.mjs` — fraqueza/down/one more/baton pass, multi-inimigo, vitória/derrota.
- `test_scene_manager.mjs` — transições de cena, wiring de combate, persistência via GameState.
- `test_new_mechanics.mjs` — Ataque Total, Itens/Inventário, Save/Load.
- `test_ui_and_sp.mjs` — correção do bug de SP, menu colapsável, stack ativo/inativo da party, DOWN em linha própria.

```bash
npm test
```
