// ==========================================================
// gameState.js — Estado persistente da PARTY ao longo da sessão.
// ==========================================================
// Diferente dos inimigos (sempre instanciados "frescos" a cada combate),
// os aliados vivem aqui como objetos ÚNICOS por toda a sessão de jogo:
// dano e SP gastos em uma batalha continuam presentes na próxima,
// a menos que algo explicitamente cure a party (ex.: "curarPartyAntes"
// numa cena, ou reiniciar o jogo).
// ==========================================================

import { criarInstanciaPersonagem, INVENTARIO_INICIAL } from './data.js';

const CHAVE_SAVE = 'nubanko_chronicles_save';
const VERSAO_SAVE = 1;

class GameStateClass {
    constructor() {
        /** @type {Map<string, object>} id -> objeto vivo do personagem */
        this.rosterAtivo = new Map();
        /** @type {Map<string, number>} id do item -> quantidade que a party possui */
        this.inventario = new Map(Object.entries(INVENTARIO_INICIAL));
    }

    /** Garante que o personagem exista no roster ativo (criando-o na 1ª vez) e o devolve. */
    garantirNoRoster(id) {
        if (!this.rosterAtivo.has(id)) {
            const instancia = criarInstanciaPersonagem(id);
            if (instancia) this.rosterAtivo.set(id, instancia);
        }
        return this.rosterAtivo.get(id) || null;
    }

    /** Devolve os objetos VIVOS (por referência) dos ids pedidos, criando-os se necessário. */
    obterParty(ids) {
        return ids.map(id => this.garantirNoRoster(id)).filter(Boolean);
    }

    /** Cura HP/SP de toda a party já conhecida e remove estado de "down". */
    curarPartyCompleta() {
        this.rosterAtivo.forEach(p => {
            p.hp = p.hpMax;
            if (p.spMax !== undefined) p.sp = p.spMax;
            p.down = false;
            p.defendendo = false;
        });
    }

    /** Reseta completamente o progresso da party (usado ao reiniciar o jogo do zero). */
    reiniciar() {
        this.rosterAtivo.clear();
        this.inventario = new Map(Object.entries(INVENTARIO_INICIAL));
    }

    // ---------------- INVENTÁRIO ----------------

    /** Adiciona (ou remove, com valor negativo) uma quantidade de um item. Nunca deixa negativo. */
    adicionarItem(id, quantidade = 1) {
        const atual = this.inventario.get(id) || 0;
        this.inventario.set(id, Math.max(0, atual + quantidade));
    }

    /** Consome 1 unidade de um item. Devolve false (sem efeito colateral) se não houver estoque. */
    consumirItem(id) {
        const atual = this.inventario.get(id) || 0;
        if (atual <= 0) return false;
        this.inventario.set(id, atual - 1);
        return true;
    }

    obterQuantidade(id) {
        return this.inventario.get(id) || 0;
    }

    /** Lista apenas os itens com quantidade > 0, no formato que a UI consome: [{id, quantidade}]. */
    obterInventario() {
        return [...this.inventario.entries()]
            .filter(([, quantidade]) => quantidade > 0)
            .map(([id, quantidade]) => ({ id, quantidade }));
    }

    // ---------------- SAVE / LOAD ----------------

    /**
     * Serializa HP/SP atuais da party + inventário para o localStorage.
     * Devolve true/false conforme o sucesso (nunca lança exceção).
     */
    salvarJogo() {
        try {
            const dados = {
                versao: VERSAO_SAVE,
                party: [...this.rosterAtivo.entries()].map(([id, p]) => ({ id, hp: p.hp, sp: p.sp })),
                inventario: [...this.inventario.entries()]
            };
            localStorage.setItem(CHAVE_SAVE, JSON.stringify(dados));
            return true;
        } catch (erro) {
            console.warn('[GameState] Falha ao salvar o jogo:', erro.message);
            return false;
        }
    }

    /**
     * Lê o save do localStorage e reconstrói o roster/inventário.
     * Devolve true se um save válido foi aplicado; false caso contrário
     * (sem save, dado corrompido, ou versão incompatível) — sem lançar exceção.
     */
    carregarJogo() {
        try {
            const bruto = localStorage.getItem(CHAVE_SAVE);
            if (!bruto) return false;

            const dados = JSON.parse(bruto);
            if (!dados || typeof dados !== 'object' || !Array.isArray(dados.party)) return false;

            dados.party.forEach(({ id, hp, sp }) => {
                const personagem = this.garantirNoRoster(id);
                if (!personagem) return;
                if (typeof hp === 'number') personagem.hp = Math.max(0, Math.min(hp, personagem.hpMax));
                if (typeof sp === 'number' && personagem.spMax !== undefined) {
                    personagem.sp = Math.max(0, Math.min(sp, personagem.spMax));
                }
            });

            this.inventario = new Map(Array.isArray(dados.inventario) ? dados.inventario : []);
            return true;
        } catch (erro) {
            console.warn('[GameState] Falha ao carregar o jogo (save corrompido?):', erro.message);
            return false;
        }
    }

    /** Checa rapidamente se existe um save, sem precisar aplicá-lo (útil no boot). */
    possuiSave() {
        try {
            return localStorage.getItem(CHAVE_SAVE) !== null;
        } catch {
            return false;
        }
    }

    /** Remove o save salvo (ex.: botão "apagar progresso"). */
    apagarSave() {
        try {
            localStorage.removeItem(CHAVE_SAVE);
        } catch { /* ambiente sem localStorage: ignora silenciosamente */ }
    }
}

export const GameState = new GameStateClass();
