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
const { SceneManager } = await import('./js/sceneManager.js');
const { CombatEngine } = await import('./js/combatEngine.js');
const { GameState } = await import('./js/gameState.js');
const { BANCO_DE_CENAS } = await import('./js/data.js');

UIManager.cacheDom();
SceneManager.registrarCenas(BANCO_DE_CENAS);

let falhas = 0;
function checar(condicao, mensagem) {
    if (!condicao) { console.error('FALHOU:', mensagem); falhas++; }
    else console.log('ok  -', mensagem);
}

// Cena 1: diálogo inicial
await SceneManager.irPara(1);
await new Promise(r => setTimeout(r, 900));
checar(document.getElementById('dialog-container').style.display === 'block', 'cena 1 (diálogo) fica visível');
checar(document.getElementById('nome-personagem').innerText === 'Nubanko', 'nome do personagem do diálogo é aplicado');
checar(document.getElementById('opcoes').children.length === 1, 'opção "Iniciar Batalha" é renderizada');

// Clica na única opção -> deve ir para a cena 2 (combate 1v1)
document.querySelector('#opcoes button').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 900));
checar(CombatEngine.emAndamento === true, 'ao escolher "Iniciar Batalha", o combate da cena 2 é iniciado');
checar(CombatEngine.party.length === 1 && CombatEngine.party[0].id === 'nubanko', 'party da cena 2 resolvida corretamente a partir do GameState');
checar(CombatEngine.inimigos.length === 1 && CombatEngine.inimigos[0].id === 'executor_silicio', 'inimigo da cena 2 resolvido corretamente a partir de data.js');

// Simula dano no Nubanko persistente no GameState, depois força vitória e verifica a cena 4 (curarPartyAntes)
const nubankoVivo = GameState.obterParty(['nubanko'])[0];
nubankoVivo.hp = 55;
checar(nubankoVivo.hp === CombatEngine.party[0].hp, 'GameState e CombatEngine compartilham a MESMA referência (dano persiste)');

CombatEngine.inimigos[0].hp = 0;
CombatEngine._verificarFimDeBatalha();
await new Promise(r => setTimeout(r, 1200));
document.querySelector('#victory-options button')?.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 900));

checar(document.getElementById('texto-dialogo').innerText.includes('segundo alvo'), 'vitória na cena 2 leva à cena 3 (diálogo-ponte)');
// A caixa de diálogo usa efeito de "máquina de escrever"; um toque nela pula direto pro texto completo
document.getElementById('dialog-container').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 150));
checar(!!document.querySelector('#opcoes button'), 'pular a máquina de escrever revela o botão de opção imediatamente');
document.querySelector('#opcoes button').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 900));

checar(CombatEngine.emAndamento === true, 'opção da cena 3 avança para a cena 4 (combate com 2 inimigos)');
checar(CombatEngine.inimigos.length === 2, 'cena 4 realmente carrega 2 inimigos');
checar(CombatEngine.party[0].hp === CombatEngine.party[0].hpMax, 'curarPartyAntes:true na cena 4 restaura o HP total (estava em 55)');

console.log('\n' + (falhas === 0 ? 'TODOS OS TESTES DE SCENEMANAGER PASSARAM.' : `${falhas} VERIFICAÇÃO(ÕES) FALHARAM.`));
process.exit(falhas === 0 ? 0 : 1);
