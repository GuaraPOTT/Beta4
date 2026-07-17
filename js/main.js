// ==========================================================
// main.js — Ponto de entrada. Liga todos os módulos e inicia o jogo.
// ==========================================================
// Ordem de boot:
//   1. Cacheia o DOM (UIManager).
//   2. Inicializa o áudio e registra manifesto + hooks.
//   3. Pré-carrega todas as imagens e SFX (mostrando progresso).
//   4. Registra as cenas e inicia a Visual Novel a partir da cena 1.
//
// NOTA sobre viewport: até uma versão anterior, #game-container era travado
// via JS num box 16:9 com letterbox (barras pretas nas laterais em telas
// não-16:9). Isso foi removido a pedido: #game-container agora é 100%/100dvh
// puro em CSS, ocupando toda a largura/altura reais do navegador, sem cálculo
// em JS nenhum. Efeito colateral bom: unidades dvh usadas em elementos
// internos (sprites de inimigos, por ex.) agora batem com o tamanho real do
// container, porque ele deixou de ser menor que o viewport.
// ==========================================================

import { UIManager } from './uiManager.js';
import { AudioManager } from './audioManager.js';
import { SceneManager } from './sceneManager.js';
import { GameState } from './gameState.js';
import { precarregarImagens } from './utils.js';
import { AUDIO_MANIFEST, AUDIO_HOOKS, BANCO_DE_CENAS, coletarTodosOsCaminhosDeImagem } from './data.js';

async function iniciar() {
    UIManager.cacheDom();

    AudioManager.init();
    AudioManager.registrarManifest(AUDIO_MANIFEST);
    AudioManager.registrarHooks(AUDIO_HOOKS);

    const imagens = coletarTodosOsCaminhosDeImagem();
    const totalPasso1 = imagens.length;

    UIManager.atualizarProgressoCarregamento(0, 'Carregando imagens...');
    await precarregarImagens(imagens, (feitas) => {
        const pct = Math.round((feitas / Math.max(1, totalPasso1)) * 60); // 0-60% da barra
        UIManager.atualizarProgressoCarregamento(pct);
    });

    UIManager.atualizarProgressoCarregamento(60, 'Carregando áudio...');
    await AudioManager.precarregar((feitas, total) => {
        const pct = 60 + Math.round((feitas / Math.max(1, total)) * 40); // 60-100% da barra
        UIManager.atualizarProgressoCarregamento(pct);
    });

    UIManager.atualizarProgressoCarregamento(100, 'Pronto!');
    await UIManager.esconderTelaCarregamento();

    SceneManager.registrarCenas(BANCO_DE_CENAS);

    // Save/Load: se houver um save anterior, restaura HP/SP da party + inventário
    // antes de começar. Hoje isso NÃO retoma "de onde parou" na história (a cena
    // inicial continua sendo a 1) — só o status persiste. Para retomar o capítulo
    // exato também, bastaria salvar/ler o id da cena atual do mesmo jeito.
    if (GameState.possuiSave()) {
        const carregou = GameState.carregarJogo();
        console.log(carregou ? '[main] Save anterior carregado.' : '[main] Save encontrado mas inválido; iniciando novo.');
    }

    SceneManager.irPara(1);
}

iniciar();
