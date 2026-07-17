// ==========================================================
// sceneManager.js — Orquestra a progressão da Visual Novel.
// ==========================================================
// É o único módulo que conhece tanto o UIManager quanto o CombatEngine,
// então é aqui (e só aqui) que ligamos "fim de combate" -> "próxima cena",
// evitando qualquer dependência circular entre os outros módulos.
// ==========================================================

import { UIManager } from './uiManager.js';
import { AudioManager } from './audioManager.js';
import { CombatEngine } from './combatEngine.js';
import { GameState } from './gameState.js';
import { criarInstanciaInimigo } from './data.js';

class SceneManagerClass {
    constructor() {
        this.cenas = new Map();
        this.cenaAtual = null;
        this.historico = [];
    }

    registrarCenas(lista) {
        lista.forEach(cena => this.cenas.set(cena.id, cena));
    }

    async irPara(id) {
        const cena = this.cenas.get(id);
        if (!cena) { console.error(`[SceneManager] Cena ${id} não encontrada.`); return; }

        const tipoTransicao = cena.transicao || 'fade';
        await UIManager.transicionar(tipoTransicao, () => this._aplicarCena(cena));

        this.cenaAtual = cena;
        this.historico.push(id);
    }

    _aplicarCena(cena) {
        if (cena.bgm) AudioManager.playBGM(cena.bgm);
        else if (cena.bgm === null) AudioManager.stopBGM();

        if (cena.imagemFundo) UIManager.definirFundo(cena.imagemFundo);
        if (cena.sfxEntrada) AudioManager.playSFX(cena.sfxEntrada);
        if (cena.curarPartyAntes) GameState.curarPartyCompleta();

        switch (cena.tipo) {
            case 'dialogo':
                UIManager.mostrarDialogo(cena, (proximoId) => this.irPara(proximoId));
                break;

            case 'combate': {
                const party = GameState.obterParty(cena.party);
                const inimigos = cena.inimigos.map(criarInstanciaInimigo).filter(Boolean);
                UIManager.prepararTelaCombate();
                CombatEngine.iniciarCombate({ party, inimigos }, {
                    aoVencer: () => this.irPara(cena.proximoId),
                    aoPerder: () => this.irPara(0)
                });
                break;
            }

            case 'derrota':
                UIManager.mostrarDerrota(cena, () => this.reiniciar(1));
                break;

            default:
                console.warn(`[SceneManager] Tipo de cena desconhecido: "${cena.tipo}"`);
        }
    }

    /** Cura a party e volta para a cena inicial informada (padrão: cena 1). */
    reiniciar(idInicial = 1) {
        GameState.curarPartyCompleta();
        this.historico = [];
        this.irPara(idInicial);
    }
}

export const SceneManager = new SceneManagerClass();
