// Testes de integração para as 3 mecânicas novas: Ataque Total, Itens e Save/Load.
// Mesma abordagem das suítes anteriores: DOM real via jsdom, CombatEngine dirigido
// diretamente (sem simular toda a IA), com cliques reais simulados nos prompts.

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
global.localStorage = dom.window.localStorage;

const { UIManager } = await import('./js/uiManager.js');
const { CombatEngine } = await import('./js/combatEngine.js');
const { GameState } = await import('./js/gameState.js');
const { criarInstanciaPersonagem, criarInstanciaInimigo, BIBLIOTECA_ITENS, INVENTARIO_INICIAL } = await import('./js/data.js');

UIManager.cacheDom();

let falhas = 0;
function checar(condicao, mensagem) {
    if (!condicao) { console.error('FALHOU:', mensagem); falhas++; }
    else console.log('ok  -', mensagem);
}
function EL_ativo(id) {
    return document.getElementById(id)?.classList.contains('ativo') ?? false;
}

// ==========================================================
// GRUPO 1 — ATAQUE TOTAL
// ==========================================================
{
    const originalRandom = Math.random;
    Math.random = () => 0.5; // mantém a variância do dano previsível dentro da faixa esperada

    // --- 1 inimigo: down sozinho já satisfaz "todos down" ---
    {
        const party = [criarInstanciaPersonagem('nubanko')];
        const inimigo = criarInstanciaInimigo('executor_silicio'); // fraqueza: fogo
        let venceu = false;
        CombatEngine.iniciarCombate({ party, inimigos: [inimigo] }, { aoVencer: () => { venceu = true; }, aoPerder: () => {} });

        checar(CombatEngine._todosInimigosDown() === false, 'antes de qualquer golpe, _todosInimigosDown() é falso (inimigo de pé)');

        await CombatEngine._executarAcaoJogador(party[0], { tipo: 'fogo', dano: 5, msg: 'x' });
        checar(inimigo.down === true, 'o golpe de fraqueza derruba o único inimigo');
        checar(EL_ativo('all-out-prompt') === true, 'com 1 único inimigo, down já dispara o prompt de Ataque Total');
        checar(EL_ativo('one-more-prompt') === false, 'o prompt normal de One More NÃO aparece quando o Ataque Total é oferecido');

        const hpAntes = inimigo.hp;
        const botaoCancelar = [...document.querySelectorAll('#all-out-prompt button')].find(b => b.innerText.includes('CANCELAR'));
        botaoCancelar.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
        await new Promise(r => setTimeout(r, 30));

        checar(inimigo.hp === hpAntes, 'CANCELAR não aplica nenhum dano extra');
        checar(EL_ativo('one-more-prompt') === true, 'CANCELAR cai no prompt normal de One More');
        const temBatonPass = !![...document.querySelectorAll('#one-more-prompt button')].find(b => b.innerText.includes('Bastão'));
        checar(temBatonPass === false, 'com só 1 personagem na party, Baton Pass não é oferecido (não há para quem passar)');
        checar(CombatEngine.icones.get(party[0].id) === true, 'cancelar o Ataque Total preserva o ícone do One More (o ator pode agir de novo)');
    }

    // --- 2 inimigos: derrubar só 1 NÃO dispara; derrubar os 2 dispara; confirmar aplica dano a todos ---
    {
        const party = [criarInstanciaPersonagem('nubanko')];
        const inimigo1 = criarInstanciaInimigo('executor_silicio');
        const inimigo2 = criarInstanciaInimigo('executor_silicio_jr');
        CombatEngine.iniciarCombate({ party, inimigos: [inimigo1, inimigo2] }, { aoVencer: () => {}, aoPerder: () => {} });

        // Derruba só o inimigo1
        const acao1 = CombatEngine._executarAcaoJogador(party[0], { tipo: 'fogo', dano: 5, msg: 'x' });
        await new Promise(r => setTimeout(r, 30));
        document.querySelector('.combat-slot[data-id="executor_silicio"]')?.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
        await acao1;
        checar(EL_ativo('all-out-prompt') === false, 'derrubar 1 de 2 inimigos NÃO dispara o Ataque Total');
        checar(EL_ativo('one-more-prompt') === true, 'derrubar 1 de 2 concede o One More normal');

        // Continua com o mesmo personagem (via "Continuar Ataque") e derruba o 2º também
        const continuarBtn = [...document.querySelectorAll('#one-more-prompt button')].find(b => b.innerText.includes('Continuar'));
        continuarBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
        await new Promise(r => setTimeout(r, 30));

        const acao2 = CombatEngine._executarAcaoJogador(party[0], { tipo: 'fogo', dano: 5, msg: 'x' });
        await new Promise(r => setTimeout(r, 30));
        document.querySelector('.combat-slot[data-id="executor_silicio_jr"]')?.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
        await acao2;

        checar(inimigo1.down === true && inimigo2.down === true, 'agora os DOIS inimigos estão down');
        checar(EL_ativo('all-out-prompt') === true, 'com todos os inimigos down, o Ataque Total é oferecido');

        const hp1Antes = inimigo1.hp, hp2Antes = inimigo2.hp;
        const botaoConfirmar = [...document.querySelectorAll('#all-out-prompt button')].find(b => b.innerText.includes('ATAQUE TOTAL'));
        botaoConfirmar.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
        await new Promise(r => setTimeout(r, 700));

        checar(inimigo1.hp < hp1Antes && inimigo2.hp < hp2Antes, 'confirmar o Ataque Total causa dano a TODOS os inimigos vivos');
        checar(inimigo1.down === false && inimigo2.down === false, 'sobreviventes do Ataque Total têm o estado "down" limpo');
        checar(EL_ativo('all-out-prompt') === false, 'o prompt de Ataque Total fecha depois de resolvido');
    }

    Math.random = originalRandom;
}

// ==========================================================
// GRUPO 2 — ITENS
// ==========================================================
{
    // --- Estrutura de dados ---
    checar(BIBLIOTECA_ITENS.pocao_hp?.tipo === 'cura_hp' && BIBLIOTECA_ITENS.pocao_hp.valor === 50, 'Poção de HP: +50 HP');
    checar(BIBLIOTECA_ITENS.eter_sp?.tipo === 'cura_sp' && BIBLIOTECA_ITENS.eter_sp.valor === 15, 'Éter de SP: +15 SP');
    checar(BIBLIOTECA_ITENS.bomba_fogo?.tipo === 'ataque' && BIBLIOTECA_ITENS.bomba_fogo.elemento === 'fogo' && BIBLIOTECA_ITENS.bomba_fogo.valor === 15, 'Bomba de Fogo: 15 de dano de fogo');

    // --- GameState: métodos de inventário ---
    GameState.reiniciar();
    checar(GameState.obterQuantidade('pocao_hp') === INVENTARIO_INICIAL.pocao_hp, 'inventário inicial vem populado (Poção de HP)');
    GameState.adicionarItem('pocao_hp', 2);
    checar(GameState.obterQuantidade('pocao_hp') === INVENTARIO_INICIAL.pocao_hp + 2, 'adicionarItem soma corretamente');
    const consumiu = GameState.consumirItem('pocao_hp');
    checar(consumiu === true && GameState.obterQuantidade('pocao_hp') === INVENTARIO_INICIAL.pocao_hp + 1, 'consumirItem decrementa e devolve true quando há estoque');
    GameState.inventario.set('bomba_fogo', 0);
    checar(GameState.consumirItem('bomba_fogo') === false, 'consumirItem devolve false sem alterar nada quando o estoque é 0');
    checar(GameState.obterInventario().every(i => i.quantidade > 0), 'obterInventario() nunca lista itens com quantidade 0');

    // --- Fluxo de cura em combate ---
    GameState.reiniciar();
    const nubanko = criarInstanciaPersonagem('nubanko');
    nubanko.hp = 40;
    const inimigo = criarInstanciaInimigo('executor_silicio');
    CombatEngine.iniciarCombate({ party: [nubanko], inimigos: [inimigo] }, { aoVencer: () => {}, aoPerder: () => {} });

    const qtdAntes = GameState.obterQuantidade('pocao_hp');
    await CombatEngine._usarItem(nubanko, { ...BIBLIOTECA_ITENS.pocao_hp, quantidade: qtdAntes });
    checar(nubanko.hp === 90, `Poção de HP cura exatamente 50 (40 -> ${nubanko.hp}, esperado 90)`);
    checar(GameState.obterQuantidade('pocao_hp') === qtdAntes - 1, 'usar o item consome 1 unidade do inventário');
    checar(CombatEngine.icones.get(nubanko.id) === false, 'usar um item de cura consome o ícone/turno do personagem');

    // --- Cura não ultrapassa o HP máximo (batalha isolada, pra não sofrer interferência
    // da fase dos inimigos que o _usarItem anterior já disparou em 2º plano) ---
    GameState.reiniciar();
    const nubankoCap = criarInstanciaPersonagem('nubanko');
    nubankoCap.hp = nubankoCap.hpMax - 10;
    CombatEngine.iniciarCombate({ party: [nubankoCap], inimigos: [criarInstanciaInimigo('executor_silicio')] }, { aoVencer: () => {}, aoPerder: () => {} });
    await CombatEngine._usarItem(nubankoCap, { ...BIBLIOTECA_ITENS.pocao_hp, quantidade: GameState.obterQuantidade('pocao_hp') });
    checar(nubankoCap.hp === nubankoCap.hpMax, 'cura nunca ultrapassa hpMax mesmo se o valor do item exceder o que falta');

    // --- Item ofensivo passa pelo sistema de afinidades (fraqueza do inimigo é fogo) ---
    GameState.reiniciar();
    const nubanko2 = criarInstanciaPersonagem('nubanko');
    const inimigo2 = criarInstanciaInimigo('executor_silicio');
    CombatEngine.iniciarCombate({ party: [nubanko2], inimigos: [inimigo2] }, { aoVencer: () => {}, aoPerder: () => {} });
    const hpAntesItem = inimigo2.hp;
    await CombatEngine._usarItem(nubanko2, { ...BIBLIOTECA_ITENS.bomba_fogo, quantidade: 1 });
    const danoCausado = hpAntesItem - inimigo2.hp;
    checar(danoCausado === Math.round(15 * 1.6), `Bomba de Fogo interage com a fraqueza do alvo (dano ${danoCausado}, esperado ${Math.round(15*1.6)})`);
    checar(inimigo2.down === true, 'Bomba de Fogo pode acertar a fraqueza e aplicar Down, igual a um golpe normal');
}

// ==========================================================
// GRUPO 3 — SAVE / LOAD
// ==========================================================
{
    global.localStorage.clear();
    GameState.reiniciar();

    checar(GameState.possuiSave() === false, 'possuiSave() é falso quando não há nada salvo');
    checar(GameState.carregarJogo() === false, 'carregarJogo() devolve false quando não há save (sem lançar exceção)');

    const nubanko = GameState.garantirNoRoster('nubanko');
    nubanko.hp = 37; nubanko.sp = 12;
    GameState.adicionarItem('pocao_hp', 9); // reiniciar() já deixa 3 de pocao_hp; +9 = 12
    const quantidadeEsperada = GameState.obterQuantidade('pocao_hp'); // 12

    const salvou = GameState.salvarJogo();
    checar(salvou === true, 'salvarJogo() devolve true em condições normais');
    checar(GameState.possuiSave() === true, 'possuiSave() vira true depois de salvar');

    // Simula reabrir o jogo do zero: novo estado, roster/inventário vazios
    GameState.rosterAtivo.clear();
    GameState.inventario.clear();
    checar(GameState.obterQuantidade('pocao_hp') === 0, 'estado foi zerado manualmente antes de testar o load');

    const carregou = GameState.carregarJogo();
    checar(carregou === true, 'carregarJogo() devolve true quando encontra um save válido');
    const nubankoRestaurado = GameState.garantirNoRoster('nubanko');
    checar(nubankoRestaurado.hp === 37 && nubankoRestaurado.sp === 12, `HP/SP restaurados corretamente (hp=${nubankoRestaurado.hp}, sp=${nubankoRestaurado.sp})`);
    checar(GameState.obterQuantidade('pocao_hp') === quantidadeEsperada, `inventário restaurado corretamente (esperado ${quantidadeEsperada})`);

    // Dado corrompido não deve derrubar o jogo
    global.localStorage.setItem('nubanko_chronicles_save', '{ isso não é json válido');
    checar(GameState.carregarJogo() === false, 'JSON corrompido: carregarJogo() devolve false sem lançar exceção');

    global.localStorage.setItem('nubanko_chronicles_save', JSON.stringify({ versao: 1 })); // sem "party"
    checar(GameState.carregarJogo() === false, 'save sem o campo "party": carregarJogo() devolve false (formato inválido)');

    GameState.apagarSave();
    checar(GameState.possuiSave() === false, 'apagarSave() remove o save corretamente');

    global.localStorage.clear();
    GameState.reiniciar();
}

console.log('\n' + (falhas === 0 ? 'TODOS OS TESTES DAS NOVAS MECÂNICAS PASSARAM.' : `${falhas} VERIFICAÇÃO(ÕES) FALHARAM.`));
process.exit(falhas === 0 ? 0 : 1);
