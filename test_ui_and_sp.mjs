// Testes para a correção do bug de SP (combatEngine.js) e o novo menu
// colapsável (uiManager.js). Nota importante: jsdom NÃO renderiza layout real
// (getBoundingClientRect sempre volta zerado), então overlaps/posicionamento
// visual do battlefield/HUD não são verificáveis por aqui — só o que é
// estado/lógica/estrutura de DOM (classes, atributos, valores).

import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const html = fs.readFileSync('./index.html', 'utf-8');
const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.Image = dom.window.Image;
global.HTMLElement = dom.window.HTMLElement;
global.requestAnimationFrame = dom.window.requestAnimationFrame || ((cb) => setTimeout(cb, 16));

const { UIManager } = await import('./js/uiManager.js');
const { CombatEngine } = await import('./js/combatEngine.js');
const { criarInstanciaPersonagem, criarInstanciaInimigo, BIBLIOTECA_GOLPES } = await import('./js/data.js');

UIManager.cacheDom();

let falhas = 0;
function checar(condicao, mensagem) {
    if (!condicao) { console.error('FALHOU:', mensagem); falhas++; }
    else console.log('ok  -', mensagem);
}

// ==========================================================
// GRUPO 1 — CORREÇÃO DO BUG DE SP
// ==========================================================
{
    const originalRandom = Math.random;
    Math.random = () => 0.99;

    // --- SP é efetivamente subtraído ao usar um golpe com custo ---
    const nubanko = criarInstanciaPersonagem('nubanko');
    checar(nubanko.sp === nubanko.spMax, `Nubanko começa com SP cheio (${nubanko.sp}/${nubanko.spMax})`);
    const inimigo = criarInstanciaInimigo('executor_silicio');
    CombatEngine.iniciarCombate({ party: [nubanko], inimigos: [inimigo] }, { aoVencer: () => {}, aoPerder: () => {} });

    const golpe = BIBLIOTECA_GOLPES.soco_fogo; // custoSp: 8
    const spAntes = nubanko.sp;
    await CombatEngine._executarAcaoJogador(nubanko, golpe);
    checar(nubanko.sp === spAntes - golpe.custoSp, `usar "${golpe.nome}" (custo ${golpe.custoSp}) desconta o SP corretamente (${spAntes} -> ${nubanko.sp})`);

    // --- Golpe sem custo (estocada, custoSp:0) não mexe no SP ---
    const inimigo2 = criarInstanciaInimigo('executor_silicio');
    CombatEngine.iniciarCombate({ party: [nubanko], inimigos: [inimigo2] }, { aoVencer: () => {}, aoPerder: () => {} });
    const spAntesGratis = nubanko.sp;
    await CombatEngine._executarAcaoJogador(nubanko, BIBLIOTECA_GOLPES.estocada);
    checar(nubanko.sp === spAntesGratis, 'golpe com custoSp:0 (Estocada) não altera o SP');

    // --- SP insuficiente: o motor BLOQUEIA o uso (defesa mesmo se a UI falhar) ---
    const nubankoSemSp = criarInstanciaPersonagem('nubanko');
    nubankoSemSp.sp = 3; // menos que o custo de qualquer golpe pago
    const inimigo3 = criarInstanciaInimigo('executor_silicio');
    CombatEngine.iniciarCombate({ party: [nubankoSemSp], inimigos: [inimigo3] }, { aoVencer: () => {}, aoPerder: () => {} });
    const hpInimigoAntes = inimigo3.hp;
    const iconeAntes = CombatEngine.icones.get(nubankoSemSp.id);
    await CombatEngine._executarAcaoJogador(nubankoSemSp, BIBLIOTECA_GOLPES.soco_fogo); // custa 8, só tem 3
    checar(inimigo3.hp === hpInimigoAntes, 'com SP insuficiente, o ataque NÃO é executado (inimigo não recebeu dano)');
    checar(nubankoSemSp.sp === 3, 'com SP insuficiente, o SP do personagem não é descontado');
    checar(CombatEngine.icones.get(nubankoSemSp.id) === iconeAntes, 'tentar usar um golpe caro demais NÃO consome o turno/ícone do personagem');

    Math.random = originalRandom;
}

// ==========================================================
// GRUPO 2 — UI: MENU DESABILITA GOLPES SEM SP + HUD MOSTRA SP
// ==========================================================
{
    const nubankoPobre = criarInstanciaPersonagem('nubanko');
    nubankoPobre.sp = 5; // dá pra Estocada (0) mas não pra Soco de Fogo (8) nem Cristal de Gelo/Raio (7/8)

    UIManager.renderizarMenuGolpes({
        ator: nubankoPobre,
        golpes: [BIBLIOTECA_GOLPES.soco_fogo, BIBLIOTECA_GOLPES.estocada],
        onEscolher: () => {},
        onVoltar: () => {}
    });

    const botoes = [...document.querySelectorAll('#battle-menu button')];
    const botaoSocoFogo = botoes.find(b => b.innerText.includes('Soco de Fogo'));
    const botaoEstocada = botoes.find(b => b.innerText.includes('Estocada'));

    checar(botaoSocoFogo.disabled === true, 'botão de golpe caro demais (Soco de Fogo, 8 SP) fica desabilitado');
    checar(botaoSocoFogo.classList.contains('indisponivel'), 'botão indisponível recebe a classe visual "indisponivel"');
    checar(botaoSocoFogo.innerText.includes('8 SP'), 'o custo em SP aparece no rótulo do botão');
    checar(botaoEstocada.disabled === false, 'botão de golpe sem custo (Estocada) continua clicável');

    // --- HUD: SP aparece para a party, mas não para inimigos (que não têm spMax) ---
    const inimigo = criarInstanciaInimigo('executor_silicio');
    UIManager.renderizarHUD([nubankoPobre], [inimigo]);
    const cardNubanko = document.querySelector(`.hud-card[data-id="${nubankoPobre.id}"]`);
    const cardInimigo = document.querySelector(`.hud-card[data-id="${inimigo.id}"]`);

    checar(cardNubanko.querySelector('.hud-sp-bar') !== null, 'card do Nubanko (tem spMax) exibe a barra de SP');
    checar(cardNubanko.querySelector('.hud-sp-bar .hud-bar-texto').textContent === '5/30', 'card do Nubanko mostra o valor correto de SP dentro da barra (5/30, sem prefixo)');
    checar(cardInimigo.querySelector('.hud-sp-bar') === null, 'card de inimigo (sem spMax) NÃO exibe barra de SP');
}

// ==========================================================
// GRUPO 3 — MENU SANDUÍCHE (COLAPSÁVEL)
// ==========================================================
{
    const container = document.getElementById('battle-menu-container');
    const toggle = document.getElementById('battle-menu-toggle');

    // Estado inicial: nada de conteúdo -> toggle escondido, container recolhido
    UIManager.limparBattleMenu();
    checar(toggle.classList.contains('visivel') === false, 'sem conteúdo no menu, o botão-gatilho fica escondido');
    checar(container.classList.contains('expandido') === false, 'sem conteúdo, o container não fica expandido');

    // Renderizar um menu com conteúdo -> toggle aparece, mas AINDA recolhido (exige toque)
    const ator = criarInstanciaPersonagem('nubanko');
    UIManager.renderizarMenuPrincipal({ ator, onAtacar: () => {}, onDefender: () => {}, onItens: () => {}, onVoltarSelecao: null });
    checar(toggle.classList.contains('visivel') === true, 'com conteúdo no menu, o botão-gatilho fica visível');
    checar(container.classList.contains('expandido') === false, 'o menu SEMPRE começa recolhido, mesmo com conteúdo pronto (exige toque)');

    // Toque no gatilho -> expande
    toggle.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    checar(container.classList.contains('expandido') === true, 'tocar o gatilho expande o menu');
    checar(toggle.getAttribute('aria-expanded') === 'true', 'aria-expanded reflete o estado expandido (acessibilidade)');

    // Navegar para um SUBMENU (golpes) preserva o estado expandido (não deveria fechar sozinho no meio da decisão)
    UIManager.renderizarMenuGolpes({ ator, golpes: [BIBLIOTECA_GOLPES.estocada], onEscolher: () => {}, onVoltar: () => {} });
    checar(container.classList.contains('expandido') === true, 'trocar para o submenu de golpes NÃO recolhe o menu (mesma decisão em andamento)');

    // limparBattleMenu (chamado quando uma ação É de fato disparada) recolhe automaticamente
    UIManager.limparBattleMenu();
    checar(container.classList.contains('expandido') === false, 'ao disparar a ação (limparBattleMenu), o menu recolhe automaticamente');
    checar(toggle.classList.contains('visivel') === false, 'sem conteúdo após limparBattleMenu, o gatilho volta a ficar escondido');
}

// ==========================================================
// GRUPO 4 — PARTY EM STACK SOBREPOSTO (active/inactive) + DOWN em linha própria
// ==========================================================
{
    const nubanko = criarInstanciaPersonagem('nubanko');
    const aliado2 = criarInstanciaPersonagem('nubanko');
    aliado2.id = 'aliado_stack'; aliado2.nome = 'Aliado Stack';
    const inimigo = criarInstanciaInimigo('executor_silicio');

    CombatEngine.iniciarCombate({ party: [nubanko, aliado2], inimigos: [inimigo] }, { aoVencer: () => {}, aoPerder: () => {} });
    // com 2 aliados disponíveis, a fase do jogador abre o seletor "quem vai agir"
    // (não chama _renderizarMenuPrincipal ainda) — chamamos definirAtorAtivo direto
    // pra isolar o teste desse método específico.
    UIManager.definirAtorAtivo(nubanko.id);

    const slotNubanko = document.querySelector(`.combat-slot[data-id="${nubanko.id}"]`);
    const slotAliado2 = document.querySelector(`.combat-slot[data-id="${aliado2.id}"]`);

    checar(slotNubanko.classList.contains('active') === true, 'ator ativo recebe a classe .active');
    checar(slotNubanko.classList.contains('inactive') === false, 'ator ativo NÃO recebe .inactive');
    checar(slotAliado2.classList.contains('inactive') === true, 'os demais aliados recebem .inactive');
    checar(slotAliado2.classList.contains('active') === false, 'os demais aliados NÃO recebem .active');

    // Trocar de ator ativo (ex.: baton pass) deve inverter as classes corretamente
    UIManager.definirAtorAtivo(aliado2.id);
    checar(slotAliado2.classList.contains('active') === true, 'trocar o ator ativo atualiza quem recebe .active');
    checar(slotNubanko.classList.contains('inactive') === true, 'o antigo ativo passa a .inactive corretamente');

    // _renderizarMenuPrincipal (chamado ao entrar no menu de um personagem) já
    // aplica isso sozinho, sem precisar chamar definirAtorAtivo manualmente
    CombatEngine._renderizarMenuPrincipal(nubanko);
    checar(slotNubanko.classList.contains('active') === true, '_renderizarMenuPrincipal já chama definirAtorAtivo automaticamente');

    // --- DOWN em linha própria, não inline com o nome ---
    UIManager.renderizarHUD([nubanko], [inimigo]);
    const cardAntes = document.querySelector(`.hud-card[data-id="${nubanko.id}"]`);
    checar(cardAntes.querySelector('.hud-down-linha') === null, 'sem estar down, a linha de DOWN não é renderizada');
    checar(cardAntes.querySelector('.hud-name').textContent.trim() === 'Nubanko', 'nome do card fica limpo (sem DOWN inline) quando não está down');

    nubanko.down = true;
    UIManager.renderizarHUD([nubanko], [inimigo]);
    const cardDepois = document.querySelector(`.hud-card[data-id="${nubanko.id}"]`);
    checar(cardDepois.querySelector('.hud-down-linha')?.textContent === 'DOWN', 'estando down, "DOWN" aparece na sua própria linha (.hud-down-linha)');
    checar(cardDepois.querySelector('.hud-name').textContent.trim() === 'Nubanko', 'o nome continua limpo — DOWN não fica mais colado nele');
    checar(!cardDepois.querySelector('.hud-name').innerHTML.includes('DOWN'), '.hud-name não contém mais "DOWN" inline (mudou de lugar de fato, não só visualmente)');
}

// ==========================================================
// GRUPO 5 — ícone de fraqueza REMOVIDO de vez (mesmo com fraquezasReveladas populado)
// ==========================================================
{
    const inimigo = criarInstanciaInimigo('executor_silicio');
    inimigo.fraquezasReveladas = ['fogo']; // simula uma fraqueza já descoberta
    inimigo.down = true;

    UIManager.renderizarHUD([], [inimigo]);
    const card = document.querySelector(`.hud-card[data-id="${inimigo.id}"]`);

    checar(card.querySelector('.hud-weak-icons') === null, 'nenhum elemento .hud-weak-icons é criado, mesmo com fraquezasReveladas populado');
    checar(!card.innerHTML.includes('🔥'), 'nenhum ícone de elemento (🔥) aparece na HUD do inimigo');
    checar(card.querySelector('.hud-down-linha')?.textContent === 'DOWN', '"DOWN" continua aparecendo normalmente (só a fraqueza que sumiu)');
    // 3 filhos diretos esperados quando down+sp ausente: nome, barra de HP, linha de DOWN — nada a mais
    checar(card.children.length === 3, `card do inimigo tem só os elementos esperados (nome+HP+DOWN = 3, tem ${card.children.length})`);
}

console.log('\n' + (falhas === 0 ? 'TODOS OS TESTES DE UI/SP PASSARAM.' : `${falhas} VERIFICAÇÃO(ÕES) FALHARAM.`));
process.exit(falhas === 0 ? 0 : 1);
