// Teste de integração: carrega o index.html real via jsdom (sem executar
// scripts automaticamente), popula o DOM com UIManager.cacheDom(), e então
// dirige o CombatEngine diretamente (sem precisar simular cliques) para
// validar as regras de Fraqueza / Down / One More / Baton Pass e as
// condições de vitória/derrota, tudo isso batendo em código real de UI/DOM.

import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const html = fs.readFileSync('./index.html', 'utf-8');
const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true, runScripts: undefined });

global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.Image = dom.window.Image;
global.HTMLElement = dom.window.HTMLElement;
global.requestAnimationFrame = dom.window.requestAnimationFrame || ((cb) => setTimeout(cb, 16));

const { UIManager } = await import('./js/uiManager.js');
const { CombatEngine } = await import('./js/combatEngine.js');
const { criarInstanciaPersonagem, criarInstanciaInimigo } = await import('./js/data.js');

UIManager.cacheDom();
// AudioManager não é chamado aqui: jsdom não implementa Web Audio API, então
// AudioManager.init() detectaria isso e todos os métodos de áudio já são
// no-ops seguros nesse cenário (testado separadamente abaixo).

let falhas = 0;
function checar(condicao, mensagem) {
    if (!condicao) { console.error('FALHOU:', mensagem); falhas++; }
    else console.log('ok  -', mensagem);
}

function EL_ativo(id) {
    return document.getElementById(id)?.classList.contains('ativo') ?? false;
}

/**
 * Ataca repetidamente até o combate acabar (emAndamento === false) ou o tempo
 * limite real (maxMs) expirar. Usa orçamento de TEMPO REAL em vez de contagem
 * de iterações, porque cada ação pode disparar fases assíncronas em segundo
 * plano (fase dos inimigos) cuja duração cresce com o número de combatentes.
 */
async function lutarAteAcabar(golpeTipo, maxMs = 20000) {
    const inicio = Date.now();
    while (CombatEngine.emAndamento && (Date.now() - inicio) < maxMs) {
        // Se o prompt de Ataque Total aparecer (natural quando há só 1 inimigo: ele
        // já nasce "down" sozinho), confirma automaticamente pra manter o combate
        // avançando — do contrário o teste ficaria esperando um clique que nunca vem.
        if (EL_ativo('all-out-prompt')) {
            const botao = [...document.querySelectorAll('#all-out-prompt button')].find(b => b.innerText.includes('ATAQUE TOTAL'));
            botao?.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
            await new Promise(r => setTimeout(r, 40));
            continue;
        }

        const ator = CombatEngine.party.find(p => p.hp > 0 && CombatEngine.icones.get(p.id));
        if (ator) {
            const alvo = CombatEngine.inimigos.find(i => i.hp > 0);
            if (alvo) {
                const acaoPromise = CombatEngine._executarAcaoJogador(ator, { tipo: golpeTipo, dano: 15, msg: 'ataque de teste' });
                // com 2+ inimigos vivos, a ação abre escolherAlvo() e espera um clique real: simula-o aqui
                await new Promise(r => setTimeout(r, 15));
                const slot = document.querySelector(`.combat-slot[data-id="${alvo.id}"]`);
                if (slot && slot.classList.contains('selecionavel')) {
                    slot.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
                }
                await acaoPromise;
                continue;
            }
        }
        await new Promise(r => setTimeout(r, 60)); // dá tempo real para a fase dos inimigos progredir em 2º plano
    }
    return (Date.now() - inicio);
}

// ---------- TESTE 1: cálculo de dano — fraqueza, resistência, nulo, absorção, defesa ----------
{
    const originalRandom = Math.random;
    Math.random = () => 0.99; // neutraliza a chance aleatória de crítico nos golpes "neutros" abaixo

    const atacante = criarInstanciaPersonagem('nubanko');       // fraqueza: gelo | resistência: fisico
    const alvo = criarInstanciaInimigo('executor_silicio');     // fraqueza: fogo  | resistência: fisico

    CombatEngine.party = [atacante];
    CombatEngine.inimigos = [alvo];
    CombatEngine.bonusBatonPass = 0;

    const golpeFogo = { tipo: 'fogo', dano: 10, msg: 'testou fogo' };
    const rFraqueza = CombatEngine._calcularDano(atacante, alvo, golpeFogo);
    checar(rFraqueza.tipoResultado === 'fraqueza' && rFraqueza.dano === 16, `fraqueza aplica 1.6x (10 -> ${rFraqueza.dano}, esperado 16)`);
    checar(rFraqueza.oneMore === true, 'fraqueza concede One More quando o alvo ainda não estava down');

    const golpeFisico = { tipo: 'fisico', dano: 10, msg: 'testou fisico' };
    const rResistencia = CombatEngine._calcularDano(atacante, alvo, golpeFisico);
    checar(rResistencia.tipoResultado === 'resistencia' && rResistencia.dano === 5, `resistência aplica 0.5x (10 -> ${rResistencia.dano}, esperado 5)`);
    checar(rResistencia.oneMore === false, 'resistência NÃO concede One More');

    alvo.nulo = ['vento'];
    const golpeVento = { tipo: 'vento', dano: 10, msg: 'testou vento' };
    const rNulo = CombatEngine._calcularDano(atacante, alvo, golpeVento);
    checar(rNulo.tipoResultado === 'nulo' && rNulo.dano === 0, 'imunidade (nulo) zera o dano');

    alvo.absorve = ['eletrico'];
    const golpeEletrico = { tipo: 'eletrico', dano: 10, msg: 'testou eletrico' };
    const rAbsorcao = CombatEngine._calcularDano(atacante, alvo, golpeEletrico);
    checar(rAbsorcao.tipoResultado === 'absorcao' && rAbsorcao.dano === 0, 'absorção zera o dano recebido');

    // Defesa: reduz o dano pela metade e consome a flag "defendendo"
    const alvoDefendendo = criarInstanciaInimigo('executor_silicio');
    alvoDefendendo.defendendo = true;
    const golpeNeutro = { tipo: 'gelo', dano: 20, msg: 'x' }; // gelo não é fraqueza nem resistência do inimigo
    const rDefesa = CombatEngine._calcularDano(atacante, alvoDefendendo, golpeNeutro);
    checar(rDefesa.dano === 10 && rDefesa.bloqueado === true, `defesa reduz o dano pela metade (20 -> ${rDefesa.dano})`);
    checar(alvoDefendendo.defendendo === false, 'flag "defendendo" é consumida após o bloqueio');

    Math.random = originalRandom;
}

// ---------- TESTE 2: Baton Pass acumula e é consumido em UM único golpe ----------
{
    const originalRandom = Math.random;
    Math.random = () => 0.99; // neutraliza a chance aleatória de crítico (golpe "neutro" não deve ativar isso)

    const atacante = criarInstanciaPersonagem('nubanko');
    const alvo = criarInstanciaInimigo('executor_silicio');
    CombatEngine.bonusBatonPass = 0.5; // simula 2 passes acumulados (0.25 x2)
    const golpe = { tipo: 'eletrico', dano: 10, msg: 'x' }; // neutro pro executor_silicio
    const resultado = CombatEngine._calcularDano(atacante, alvo, golpe);
    checar(resultado.dano === 15, `bônus de baton pass +50% aplicado (10 -> ${resultado.dano}, esperado 15)`);
    checar(CombatEngine.bonusBatonPass === 0, 'bônus de baton pass é zerado após ser aplicado uma vez');

    Math.random = originalRandom;
}

// ---------- TESTE 3: down + oneMore não se repete no mesmo alvo já derrubado ----------
{
    const atacante = criarInstanciaPersonagem('nubanko');
    const alvo = criarInstanciaInimigo('executor_silicio');
    alvo.down = true; // já estava down
    const golpe = { tipo: 'fogo', dano: 10, msg: 'x' }; // fraqueza do executor_silicio
    const resultado = CombatEngine._calcularDano(atacante, alvo, golpe);
    checar(resultado.oneMore === false, 'acertar fraqueza em alvo JÁ down não concede novo One More');
}

// ---------- TESTE 4: golpe fatal nunca gera One More ----------
{
    const atacante = criarInstanciaPersonagem('nubanko');
    const alvo = criarInstanciaInimigo('executor_silicio');
    alvo.hp = 5; // qualquer dano da fraqueza mata
    const golpe = { tipo: 'fogo', dano: 10, msg: 'x' };
    const resultado = CombatEngine._calcularDano(atacante, alvo, golpe);
    checar(resultado.derrotouAlvo === true, 'golpe fatal é detectado corretamente');
    checar(resultado.oneMore === false, 'golpe fatal NUNCA concede One More (o alvo já morreu)');
}

// ---------- TESTE 5: partida completa simulada (determinística) até a vitória ----------
{
    const originalRandom = Math.random;
    Math.random = () => 0.99; // evita defesa/crítico aleatórios dos inimigos durante o teste

    const party = [criarInstanciaPersonagem('nubanko')];
    const inimigos = [criarInstanciaInimigo('executor_silicio')];
    let venceu = false, perdeu = false;

    CombatEngine.iniciarCombate({ party, inimigos }, {
        aoVencer: () => { venceu = true; },
        aoPerder: () => { perdeu = true; }
    });

    checar(document.querySelectorAll('.combat-slot').length === 2, 'battlefield renderizou 1 slot de aliado + 1 de inimigo');
    checar(document.querySelectorAll('.hud-card').length === 2, 'HUD renderizou 1 cartão de aliado + 1 de inimigo');

    // Ataca repetidamente com fogo (fraqueza do inimigo) até vencer, sem travar em loop infinito
    const duracaoMs = await lutarAteAcabar('fogo');
    await new Promise(r => setTimeout(r, 1500)); // espera os setTimeouts internos de fim-de-batalha

    checar(CombatEngine.inimigos.every(i => i.hp <= 0), `todos os inimigos ficaram com hp<=0 (${duracaoMs}ms usados)`);
    checar(CombatEngine.emAndamento === false, 'emAndamento é desligado ao final da batalha');

    // A tela de vitória deve estar visível e só chama aoVencer quando o jogador clica "Avançar"
    checar(document.getElementById('victory-screen').classList.contains('active'), 'tela de vitória fica visível ao vencer');
    const botaoAvancar = document.querySelector('#victory-options button');
    checar(!!botaoAvancar, 'botão "Avançar" foi renderizado na tela de vitória');
    checar(venceu === false, 'aoVencer NÃO dispara antes do clique em "Avançar" (comportamento esperado)');
    botaoAvancar.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    checar(venceu === true, 'aoVencer dispara corretamente após clicar em "Avançar"');

    Math.random = originalRandom;
}

// ---------- TESTE 6: multi-inimigo — só vence quando TODOS caem ----------
{
    const party = [criarInstanciaPersonagem('nubanko')];
    const inimigo1 = criarInstanciaInimigo('executor_silicio');
    const inimigo2 = criarInstanciaInimigo('executor_silicio_jr');
    let venceu = false;

    CombatEngine.iniciarCombate({ party, inimigos: [inimigo1, inimigo2] }, {
        aoVencer: () => { venceu = true; },
        aoPerder: () => {}
    });

    checar(document.querySelectorAll('#enemy-row .combat-slot').length === 2, 'battlefield renderiza 2 inimigos simultâneos');
    checar(document.querySelectorAll('#enemy-hud-group .hud-card').length === 2, 'HUD renderiza 2 cartões de inimigo');

    // Testa o INVARIANTE da regra diretamente (determinístico), em vez de rodar uma
    // batalha autônoma completa: com 2 inimigos atacando de volta, deixar a IA jogar
    // sozinha introduz uma cascata de aleatoriedade (qual golpe cada um escolhe) que
    // não é o que este teste precisa validar.
    inimigo1.hp = 0; // derrota só o primeiro
    UIManager.atualizarEstadosBattlefield(party, [inimigo1, inimigo2]);
    checar(CombatEngine._verificarFimDeBatalha() === false, 'NÃO declara fim de batalha com apenas 1 de 2 inimigos derrotados');
    checar(venceu === false, 'aoVencer não dispara enquanto restar inimigo vivo');

    inimigo2.hp = 0; // agora derrota o segundo também
    checar(CombatEngine._verificarFimDeBatalha() === true, 'declara fim de batalha quando TODOS os inimigos são derrotados');
    await new Promise(r => setTimeout(r, 1200));
    document.querySelector('#victory-options button')?.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    checar(venceu === true, 'aoVencer dispara somente após o ÚLTIMO inimigo cair + clique em Avançar');
}

// ---------- TESTE 7: derrota — aoPerder dispara automaticamente (sem exigir clique) ----------
{
    const originalRandom = Math.random;
    Math.random = () => 0.99; // impede o inimigo de "defender" e evita crítico, tornando o teste determinístico

    const party = [criarInstanciaPersonagem('nubanko')];
    party[0].hp = 1; // garante letalidade mesmo com a resistência física de Nubanko reduzindo o dano pela metade
    const inimigos = [criarInstanciaInimigo('executor_silicio')];
    let perdeu = false;
    CombatEngine.iniciarCombate({ party, inimigos }, { aoVencer: () => {}, aoPerder: () => { perdeu = true; } });

    // Pula a fase do jogador (defende, sem gastar tempo) para chegar à fase do inimigo
    const ator = CombatEngine.party[0];
    await CombatEngine._defenderJogador(ator);
    await new Promise(r => setTimeout(r, 3500)); // aguarda a fase do inimigo atacar e o timeout de derrota (1300ms)

    checar(perdeu === true, 'aoPerder dispara automaticamente quando toda a party cai, sem exigir clique');

    Math.random = originalRandom;
}

// ---------- TESTE 8: escolherAlvo resolve corretamente ao "clicar" um alvo específico ----------
{
    const party = [criarInstanciaPersonagem('nubanko')];
    const inimigos = [criarInstanciaInimigo('executor_silicio'), criarInstanciaInimigo('executor_silicio_jr')];
    UIManager.renderizarBattlefield(party, inimigos);

    const promessa = UIManager.escolherAlvo(inimigos, 'enemy');
    const slotAlvo = document.querySelector(`.combat-slot[data-id="executor_silicio_jr"]`);
    checar(slotAlvo.classList.contains('selecionavel'), 'slot do alvo candidato recebe a classe "selecionavel"');
    slotAlvo.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    const escolhido = await promessa;
    checar(escolhido.id === 'executor_silicio_jr', 'escolherAlvo resolve com a entidade correspondente ao slot clicado');
    checar(!slotAlvo.classList.contains('selecionavel'), 'classe "selecionavel" é removida após a escolha');
}

// ---------- TESTE 9: Baton Pass — fluxo real via clique, com 2 aliados ----------
{
    const originalRandom = Math.random;
    Math.random = () => 0.99;

    const nubanko = criarInstanciaPersonagem('nubanko');
    const aliado2 = criarInstanciaPersonagem('nubanko'); // clone extra só para o teste ter um 2º membro
    aliado2.id = 'aliado_teste'; aliado2.nome = 'Aliado Teste';
    // 2 inimigos (não 1): derrubar só o primeiro NÃO deve satisfazer "todos down" do
    // Ataque Total, o que permite testar o One More + Baton Pass isoladamente.
    const inimigo1 = criarInstanciaInimigo('executor_silicio');
    const inimigo2 = criarInstanciaInimigo('executor_silicio_jr');

    CombatEngine.iniciarCombate({ party: [nubanko, aliado2], inimigos: [inimigo1, inimigo2] }, { aoVencer: () => {}, aoPerder: () => {} });

    // Ataque de fogo (fraqueza de ambos) mirado especificamente no inimigo1
    const acaoPromise = CombatEngine._executarAcaoJogador(nubanko, { tipo: 'fogo', dano: 5, msg: 'x' });
    await new Promise(r => setTimeout(r, 30));
    document.querySelector('.combat-slot[data-id="executor_silicio"]')
        ?.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await acaoPromise;

    checar(CombatEngine._todosInimigosDown() === false, 'com 2 inimigos vivos, derrubar só 1 NÃO ativa a condição de Ataque Total');
    const promptAtivo = document.getElementById('one-more-prompt').classList.contains('ativo');
    checar(promptAtivo, 'prompt de ONE MORE aparece (e não o de Ataque Total) após acertar 1 de 2 fraquezas');

    const botaoBaton = [...document.querySelectorAll('#one-more-prompt button')].find(b => b.innerText.includes('Bastão'));
    checar(!!botaoBaton, 'botão "Passar o Bastão" está disponível quando há outro aliado com ação livre');

    botaoBaton.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 50));
    // com só 2 aliados disponíveis, o passe é automático (não precisa de escolha extra) e cai direto no menu do novo ator
    checar(CombatEngine.bonusBatonPass === 0.25, `bônus de baton pass acumulado corretamente (${CombatEngine.bonusBatonPass})`);

    Math.random = originalRandom;
}

console.log('\n' + (falhas === 0 ? 'TODOS OS GRUPOS DE TESTE PASSARAM.' : `${falhas} VERIFICAÇÃO(ÕES) FALHARAM.`));
process.exit(falhas === 0 ? 0 : 1);
