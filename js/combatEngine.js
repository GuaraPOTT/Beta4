// ==========================================================
// combatEngine.js — Motor de combate por turnos estilo Persona 5.
// ==========================================================
// Regras implementadas:
//  - Party (até 4) vs. inimigos (até 4), como arrays de objetos.
//  - Cada personagem/inimigo tem 1 "ícone de ação" por rodada do jogador.
//  - Acertar a FRAQUEZA de um alvo o deixa "Down" (perde a ação seguinte) e
//    devolve o ícone de quem atacou -> ONE MORE (turno extra).
//  - Em um One More, o jogador pode continuar com o mesmo personagem ou
//    fazer BATON PASS para outro aliado disponível, que ganha um bônus de
//    dano cumulativo (+25% por passagem) no seu próximo golpe.
//  - A mesma regra de Fraqueza -> Down -> "turno extra" vale para os
//    inimigos: se um inimigo acerta a fraqueza de um aliado, ele também
//    ganha uma ação de bônus (limitada, para não travar o jogo).
//  - ATAQUE TOTAL: se a ação que acabou de derrubar um inimigo faz com que
//    TODOS os inimigos vivos fiquem "Down" simultaneamente, o fluxo normal
//    de One More é substituído por um prompt exclusivo (confirmar/cancelar).
//    Cancelar volta ao One More normal (com Baton Pass, se aplicável).
//  - ITENS: usar um item consome o turno do personagem como um ataque normal;
//    itens ofensivos passam pelo MESMO cálculo de dano dos golpes (logo,
//    também podem gerar Down / One More / Ataque Total).
//  - CombatEngine nunca importa SceneManager: ele avisa o resultado da
//    batalha via callbacks (aoVencer / aoPerder) injetados por quem o chamou.
//    (Ele importa GameState só para ler/consumir o inventário — GameState
//    não importa CombatEngine de volta, então não há ciclo.)
// ==========================================================

import { UIManager } from './uiManager.js';
import { AudioManager } from './audioManager.js';
import { BIBLIOTECA_GOLPES_INIMIGOS, BIBLIOTECA_GOLPES, BIBLIOTECA_ITENS } from './data.js';
import { GameState } from './gameState.js';
import { aguardar, escolherAleatorio } from './utils.js';

const MULTIPLICADOR_FRAQUEZA = 1.6;
const MULTIPLICADOR_RESISTENCIA = 0.5;
const MULTIPLICADOR_CRITICO = 1.8;
const CHANCE_CRITICO = 0.08;
const MULTIPLICADOR_DEFESA = 0.5;
const INCREMENTO_BATON_PASS = 0.25;
const CHANCE_INIMIGO_DEFENDER = 0.2;
const MAX_ACOES_EXTRA_INIMIGO = 2;
const DANO_ATAQUE_TOTAL_BASE = 35;    // dano-base "neutro" do Ataque Total (não passa pelo sistema de afinidades)
const VARIANCA_ATAQUE_TOTAL = 0.15;   // ±15% de variação por inimigo atingido, só por sabor

class CombatEngineClass {
    constructor() {
        this.party = [];
        this.inimigos = [];
        this.callbacks = {};
        this.icones = new Map();
        this.bonusBatonPass = 0;
        this.rodada = 1;
        this.emAndamento = false;
    }

    /**
     * Inicia um combate.
     * @param {{party: object[], inimigos: object[], proximoId?: number}} config - party já deve vir
     *   resolvida como objetos vivos (ver GameState.obterParty); inimigos como instâncias frescas.
     * @param {{aoVencer?: Function, aoPerder?: Function}} callbacks
     */
    iniciarCombate({ party, inimigos }, callbacks = {}) {
        this.party = party;
        this.inimigos = inimigos;
        this.callbacks = callbacks;
        this.rodada = 1;
        this.bonusBatonPass = 0;
        this.emAndamento = true;

        this.party.forEach(p => { p.down = false; p.defendendo = false; p.fraquezasReveladas = p.fraquezasReveladas || []; });
        this.inimigos.forEach(i => { i.down = false; i.defendendo = false; i.fraquezasReveladas = i.fraquezasReveladas || []; });

        UIManager.renderizarBattlefield(this.party, this.inimigos);
        UIManager.renderizarHUD(this.party, this.inimigos);
        UIManager.limparBattleMenu();
        const nomesInimigos = this.inimigos.map(i => i.nome).join(' e ');
        UIManager.setNav(this.inimigos.length > 1 ? `${nomesInimigos} apareceram!` : `${nomesInimigos} apareceu!`);

        this._iniciarFaseJogador();
    }

    // ---------------- FASE DO JOGADOR ----------------

    _iniciarFaseJogador() {
        this.icones = new Map();
        this.party.forEach(p => {
            if (p.hp <= 0) return;
            if (!p.down) this.icones.set(p.id, true);
            p.down = false; // se estava down, recupera-se agora (perdeu exatamente 1 fase de ação)
        });
        UIManager.atualizarEstadosBattlefield(this.party, this.inimigos);
        this._renderizarSelecaoAtor();
    }

    _atoresDisponiveis() {
        return this.party.filter(p => p.hp > 0 && this.icones.get(p.id));
    }

    _renderizarSelecaoAtor() {
        const disponiveis = this._atoresDisponiveis();
        if (disponiveis.length === 0) { this._iniciarFaseInimigo(); return; }
        if (disponiveis.length === 1) { this._renderizarMenuPrincipal(disponiveis[0]); return; }
        UIManager.renderizarMenuAcaoParty({
            atores: disponiveis,
            onEscolher: (ator) => this._renderizarMenuPrincipal(ator)
        });
    }

    _renderizarMenuPrincipal(ator) {
        UIManager.definirAtorAtivo(ator.id); // realça este personagem no stack sobreposto da party
        const temOutrosParaVoltar = this._atoresDisponiveis().length > 1;
        UIManager.renderizarMenuPrincipal({
            ator,
            onAtacar: () => UIManager.renderizarMenuGolpes({
                ator,
                golpes: ator.golpes.map(id => this._buscarGolpeParty(id)).filter(Boolean),
                onEscolher: (golpe) => this._executarAcaoJogador(ator, golpe),
                onVoltar: () => this._renderizarMenuPrincipal(ator)
            }),
            onDefender: () => this._defenderJogador(ator),
            onItens: () => this._renderizarMenuItens(ator),
            onVoltarSelecao: temOutrosParaVoltar ? () => this._renderizarSelecaoAtor() : null
        });
    }

    _renderizarMenuItens(ator) {
        const itensDisponiveis = GameState.obterInventario()
            .map(({ id, quantidade }) => {
                const definicao = BIBLIOTECA_ITENS[id];
                return definicao ? { ...definicao, quantidade } : null;
            })
            .filter(Boolean);

        UIManager.renderizarMenuItens({
            itens: itensDisponiveis,
            onEscolher: (item) => this._usarItem(ator, item),
            onVoltar: () => this._renderizarMenuPrincipal(ator)
        });
    }

    _buscarGolpeParty(id) {
        return BIBLIOTECA_GOLPES[id];
    }

    async _executarAcaoJogador(ator, golpe) {
        const custoSp = golpe.custoSp || 0;
        // Checagem defensiva no motor (além do menu já desabilitar golpes caros
        // demais): nunca confie só na UI para impor uma regra de jogo.
        if (custoSp > (ator.sp ?? 0)) {
            UIManager.setNav(`${ator.nome} não tem SP suficiente para usar ${golpe.nome}!`);
            this._renderizarMenuPrincipal(ator);
            return;
        }

        const alvosValidos = this.inimigos.filter(i => i.hp > 0);
        if (alvosValidos.length === 0) return;

        let alvo = alvosValidos[0];
        if (alvosValidos.length > 1) {
            UIManager.setNav('Escolha o alvo!');
            alvo = await UIManager.escolherAlvo(alvosValidos, 'enemy');
        }

        this._consumirIcone(ator.id);
        if (custoSp > 0) {
            ator.sp = Math.max(0, (ator.sp ?? 0) - custoSp);
        }
        UIManager.limparBattleMenu();
        AudioManager.disparar('ataque_' + golpe.tipo);
        UIManager.mostrarInvocacao();
        UIManager.atualizarHUD(this.party, this.inimigos); // reflete o SP gasto imediatamente, sem esperar o dano

        const finalizadoPorPrompt = await this._resolverAtaqueContraInimigo(ator, alvo, golpe);
        if (finalizadoPorPrompt) return;

        await aguardar(500);
        this._continuarFaseJogador();
    }

    /**
     * Núcleo compartilhado de "atacar 1 inimigo": anima, calcula dano, aplica o
     * resultado e decide o que vem a seguir. Usado tanto por golpes normais
     * quanto por itens ofensivos (_usarItem), pra não duplicar a lógica de
     * Ataque Total / One More / fim-de-batalha em dois lugares.
     * @returns {Promise<boolean>} true se o próximo passo já foi disparado por um
     *   prompt (fim de batalha, Ataque Total ou One More) — o chamador não deve
     *   chamar _continuarFaseJogador() nesse caso.
     */
    async _resolverAtaqueContraInimigo(ator, alvo, especificacaoGolpe) {
        UIManager.animarPose(ator, 'ataque', 900);
        await aguardar(450);
        UIManager.animarPose(alvo, 'dano', 500);
        await aguardar(200);

        const resultado = this._calcularDano(ator, alvo, especificacaoGolpe);
        UIManager.setNav(this._mensagemResultado(ator, alvo, especificacaoGolpe, resultado));
        this._aplicarResultado(alvo, resultado);

        if (this._verificarFimDeBatalha()) return true;

        if (resultado.oneMore && this._todosInimigosDown()) {
            AudioManager.disparar('one_more');
            await aguardar(400);
            this._oferecerAtaqueTotal(ator);
            return true;
        }

        if (resultado.oneMore) {
            AudioManager.disparar('one_more');
            this.icones.set(ator.id, true);
            const outros = this._atoresDisponiveis().filter(a => a.id !== ator.id);
            await aguardar(400);
            UIManager.mostrarPromptOneMore({
                podeBatonPass: outros.length > 0,
                onContinuar: () => this._renderizarMenuPrincipal(ator),
                onBatonPass: () => this._passarBastao(ator)
            });
            return true;
        }

        return false;
    }

    async _passarBastao(atorAtual) {
        const outros = this._atoresDisponiveis().filter(a => a.id !== atorAtual.id);
        if (outros.length === 0) { this._renderizarMenuPrincipal(atorAtual); return; }

        let novoAtor = outros[0];
        if (outros.length > 1) {
            UIManager.setNav('Passar o bastão para quem?');
            novoAtor = await UIManager.escolherAlvo(outros, 'party');
        }

        this.bonusBatonPass += INCREMENTO_BATON_PASS;
        UIManager.setNav(`Bastão passado para ${novoAtor.nome}! Próximo golpe com +${Math.round(this.bonusBatonPass * 100)}% de dano.`);
        await aguardar(700);
        this._renderizarMenuPrincipal(novoAtor);
    }

    // ---------------- ITENS ----------------

    /** Usa um item de combate. Cura vai direto pro alvo; ataque reaproveita _resolverAtaqueContraInimigo. */
    async _usarItem(ator, item) {
        if (GameState.obterQuantidade(item.id) <= 0) {
            UIManager.setNav(`Você não tem mais ${item.nome}!`);
            this._renderizarMenuItens(ator);
            return;
        }

        if (item.tipo === 'cura_hp' || item.tipo === 'cura_sp') {
            const candidatos = this.party.filter(p => p.hp > 0);
            if (candidatos.length === 0) return;
            let alvo = candidatos[0];
            if (candidatos.length > 1) {
                UIManager.setNav(`Usar ${item.nome} em quem?`);
                alvo = await UIManager.escolherAlvo(candidatos, 'party');
            }

            GameState.consumirItem(item.id);
            this._consumirIcone(ator.id);
            UIManager.limparBattleMenu();
            AudioManager.disparar('item_usado');
            UIManager.animarPose(ator, 'ataque', 700);
            await aguardar(400);

            if (item.tipo === 'cura_hp') {
                const antes = alvo.hp;
                alvo.hp = Math.min(alvo.hpMax, alvo.hp + item.valor);
                UIManager.mostrarPopup(`+${alvo.hp - antes}`, 'heal', alvo.id, 30);
            } else {
                const maximoSp = alvo.spMax ?? 0;
                const antes = alvo.sp ?? 0;
                alvo.sp = Math.min(maximoSp, antes + item.valor);
                UIManager.mostrarPopup(`+${alvo.sp - antes} SP`, 'heal', alvo.id, 30);
            }
            UIManager.setNav(`${ator.nome} usou ${item.nome} em ${alvo.nome}!`);
            UIManager.atualizarHUD(this.party, this.inimigos);

            await aguardar(700);
            this._continuarFaseJogador();
            return;
        }

        if (item.tipo === 'ataque') {
            const alvosValidos = this.inimigos.filter(i => i.hp > 0);
            if (alvosValidos.length === 0) return;
            let alvo = alvosValidos[0];
            if (alvosValidos.length > 1) {
                UIManager.setNav('Escolha o alvo!');
                alvo = await UIManager.escolherAlvo(alvosValidos, 'enemy');
            }

            GameState.consumirItem(item.id);
            this._consumirIcone(ator.id);
            UIManager.limparBattleMenu();
            AudioManager.disparar('item_usado');

            const golpeDoItem = { tipo: item.elemento, dano: item.valor, msg: `usou ${item.nome}!` };
            const finalizadoPorPrompt = await this._resolverAtaqueContraInimigo(ator, alvo, golpeDoItem);
            if (finalizadoPorPrompt) return;

            await aguardar(500);
            this._continuarFaseJogador();
        }
    }

    async _defenderJogador(ator) {
        this._consumirIcone(ator.id);
        ator.defendendo = true;
        UIManager.limparBattleMenu();
        UIManager.setNav(`${ator.nome} entrou em posição de defesa!`);
        UIManager.animarPose(ator, 'defesa', 1400);
        await aguardar(900);
        this._continuarFaseJogador();
    }

    _consumirIcone(id) {
        this.icones.set(id, false);
    }

    _continuarFaseJogador() {
        if (this._verificarFimDeBatalha()) return;
        this._renderizarSelecaoAtor();
    }

    // ---------------- ATAQUE TOTAL (ALL-OUT ATTACK) ----------------

    /** Verdadeiro quando NENHUM inimigo vivo está de pé (todos down ou mortos). */
    _todosInimigosDown() {
        const vivos = this.inimigos.filter(i => i.hp > 0);
        return vivos.length > 0 && vivos.every(i => i.down);
    }

    /** Mostra o prompt de Ataque Total. Cancelar preserva o One More normal do `ator`. */
    _oferecerAtaqueTotal(ator) {
        UIManager.mostrarPromptAtaqueTotal({
            onConfirmar: () => this._executarAtaqueTotal(ator),
            onCancelar: () => {
                this.icones.set(ator.id, true); // recusar o Ataque Total não gasta o One More conquistado
                const outros = this._atoresDisponiveis().filter(a => a.id !== ator.id);
                UIManager.mostrarPromptOneMore({
                    podeBatonPass: outros.length > 0,
                    onContinuar: () => this._renderizarMenuPrincipal(ator),
                    onBatonPass: () => this._passarBastao(ator)
                });
            }
        });
    }

    _calcularDanoAtaqueTotal() {
        const variancia = 1 + (Math.random() * 2 - 1) * VARIANCA_ATAQUE_TOTAL; // ex.: 0.85–1.15
        return Math.round(DANO_ATAQUE_TOTAL_BASE * variancia);
    }

    /** Aplica dano "neutro" (ignora fraqueza/resistência/nulo/absorção) a todos os inimigos vivos. */
    async _executarAtaqueTotal(ator) {
        UIManager.limparBattleMenu();
        AudioManager.disparar('ataque_total');
        await UIManager.animarAtaqueTotal();

        const vivos = this.inimigos.filter(i => i.hp > 0);
        vivos.forEach(inimigo => {
            const dano = this._calcularDanoAtaqueTotal();
            inimigo.hp = Math.max(0, inimigo.hp - dano);
            inimigo.down = false; // limpa o estado "down" de quem sobreviver
            UIManager.mostrarPopup(String(dano), 'critical', inimigo.id, 30);
            UIManager.aplicarShake(inimigo.id, 'heavy');
        });

        UIManager.setNav('ATAQUE TOTAL desferido em todos os inimigos!');
        UIManager.atualizarHUD(this.party, this.inimigos);
        UIManager.atualizarEstadosBattlefield(this.party, this.inimigos);

        if (this._verificarFimDeBatalha()) return;

        await aguardar(900);
        this._continuarFaseJogador();
    }

    // ---------------- FASE DOS INIMIGOS ----------------

    async _iniciarFaseInimigo() {
        UIManager.limparBattleMenu();
        const inimigosNestaFase = this.inimigos.filter(i => i.hp > 0);

        for (const inimigo of inimigosNestaFase) {
            if (this._verificarFimDeBatalha()) return;

            if (inimigo.down) {
                inimigo.down = false; // recupera-se, mas perde a ação desta rodada
                UIManager.atualizarEstadosBattlefield(this.party, this.inimigos);
                continue;
            }
            await this._executarTurnoInimigo(inimigo);
        }

        if (this._verificarFimDeBatalha()) return;
        this.rodada++;
        this._iniciarFaseJogador();
    }

    async _executarTurnoInimigo(inimigo, acoesExtrasRestantes = MAX_ACOES_EXTRA_INIMIGO) {
        if (inimigo.hp <= 0) return;

        if (Math.random() < CHANCE_INIMIGO_DEFENDER) {
            inimigo.defendendo = true;
            UIManager.animarPose(inimigo, 'defesa', 1400);
            UIManager.setNav(`${inimigo.nome} entrou em guarda!`);
            await aguardar(900);
            return;
        }
        inimigo.defendendo = false;

        const alvosVivos = this.party.filter(p => p.hp > 0);
        if (alvosVivos.length === 0) return;
        const alvo = escolherAleatorio(alvosVivos);
        const golpe = BIBLIOTECA_GOLPES_INIMIGOS[escolherAleatorio(inimigo.golpes)];
        if (!golpe) return;

        UIManager.animarPose(inimigo, 'ataque', 900);
        await aguardar(450);
        UIManager.animarPose(alvo, 'dano', 500);
        AudioManager.disparar('dano_recebido');
        await aguardar(200);

        const resultado = this._calcularDano(inimigo, alvo, golpe);
        UIManager.setNav(`${inimigo.nome} ${golpe.msg}`);
        this._aplicarResultado(alvo, resultado);

        if (this._verificarFimDeBatalha()) return;

        if (resultado.oneMore && acoesExtrasRestantes > 0) {
            AudioManager.disparar('one_more');
            UIManager.setNav(`${inimigo.nome} encontrou uma brecha e ataca novamente!`);
            await aguardar(700);
            await this._executarTurnoInimigo(inimigo, acoesExtrasRestantes - 1);
        } else {
            await aguardar(600);
        }
    }

    // ---------------- CÁLCULO DE DANO / REGRAS DE FRAQUEZA ----------------

    _calcularDano(atacante, alvo, golpe) {
        let dano = golpe.dano;
        let tipoResultado = 'normal';
        let oneMore = false;

        const nulo = alvo.nulo || [];
        const absorve = alvo.absorve || [];
        const fraquezas = alvo.fraquezas || [];
        const resistencias = alvo.resistencias || [];

        if (nulo.includes(golpe.tipo)) {
            dano = 0; tipoResultado = 'nulo';
        } else if (absorve.includes(golpe.tipo)) {
            dano = 0; tipoResultado = 'absorcao';
        } else if (fraquezas.includes(golpe.tipo)) {
            dano = Math.round(dano * MULTIPLICADOR_FRAQUEZA);
            tipoResultado = 'fraqueza';
            oneMore = !alvo.down;
        } else if (resistencias.includes(golpe.tipo)) {
            dano = Math.floor(dano * MULTIPLICADOR_RESISTENCIA);
            tipoResultado = 'resistencia';
        } else if (Math.random() < CHANCE_CRITICO) {
            dano = Math.round(dano * MULTIPLICADOR_CRITICO);
            tipoResultado = 'critico';
        }

        if (this.bonusBatonPass > 0 && dano > 0) {
            dano = Math.round(dano * (1 + this.bonusBatonPass));
            this.bonusBatonPass = 0;
        }

        let bloqueado = false;
        if (alvo.defendendo) {
            dano = Math.floor(dano * MULTIPLICADOR_DEFESA);
            alvo.defendendo = false;
            bloqueado = true;
        }

        dano = Math.max(0, dano);
        const derrotouAlvo = (alvo.hp - dano) <= 0;
        if (derrotouAlvo) oneMore = false;

        return { dano, tipoResultado, tipoElemento: golpe.tipo, oneMore, derrotouAlvo, bloqueado };
    }

    _mensagemResultado(atacante, alvo, golpe, resultado) {
        switch (resultado.tipoResultado) {
            case 'fraqueza':    return `Fraqueza explorada em ${alvo.nome}!`;
            case 'resistencia': return `${alvo.nome} resistiu ao golpe!`;
            case 'nulo':        return `${alvo.nome} é imune a isso!`;
            case 'absorcao':    return `${alvo.nome} absorveu o ataque!`;
            case 'critico':     return 'Golpe Crítico!';
            default:            return `${atacante.nome} ${golpe.msg}`;
        }
    }

    _aplicarResultado(alvo, resultado) {
        alvo.hp = Math.max(0, alvo.hp - resultado.dano);

        if (resultado.tipoResultado === 'fraqueza' && !resultado.derrotouAlvo) {
            alvo.down = true;
            if (!alvo.fraquezasReveladas.includes(resultado.tipoElemento)) {
                alvo.fraquezasReveladas.push(resultado.tipoElemento);
            }
            AudioManager.disparar('entidade_down');
            AudioManager.disparar('fraqueza_explorada');
        } else if (resultado.tipoResultado === 'resistencia') {
            AudioManager.disparar('resistencia_ativada');
        }

        let textoPopup = null;
        let estiloPopup = 'damage';
        if (resultado.tipoResultado === 'nulo')        { textoPopup = 'NULO';      estiloPopup = 'resist'; }
        else if (resultado.tipoResultado === 'absorcao')  { textoPopup = 'ABSORVIDO'; estiloPopup = 'heal'; }
        else if (resultado.tipoResultado === 'critico')   { textoPopup = 'CRÍTICO!';  estiloPopup = 'critical'; }
        else if (resultado.tipoResultado === 'fraqueza')  { textoPopup = 'FRAQUEZA!'; estiloPopup = 'weak'; }
        else if (resultado.tipoResultado === 'resistencia') { textoPopup = 'RESISTIU'; estiloPopup = 'resist'; }
        if (resultado.bloqueado && !textoPopup) { textoPopup = 'BLOQUEIO'; estiloPopup = 'miss'; }

        if (textoPopup) UIManager.mostrarPopup(textoPopup, estiloPopup, alvo.id, -40);
        if (resultado.tipoResultado !== 'absorcao') {
            UIManager.mostrarPopup(String(resultado.dano), 'damage', alvo.id, 30);
        }
        if (resultado.dano > 0) {
            const intensidade = (resultado.tipoResultado === 'fraqueza' || resultado.tipoResultado === 'critico') ? 'heavy' : 'light';
            UIManager.aplicarShake(alvo.id, intensidade);
        }

        UIManager.atualizarHUD(this.party, this.inimigos);
        UIManager.atualizarEstadosBattlefield(this.party, this.inimigos);
    }

    // ---------------- FIM DE BATALHA ----------------

    _verificarFimDeBatalha() {
        const inimigosVivos = this.inimigos.some(i => i.hp > 0);
        const partyViva = this.party.some(p => p.hp > 0);

        if (!inimigosVivos) {
            this.emAndamento = false;
            UIManager.setNav('Todos os inimigos foram derrotados!');
            UIManager.limparBattleMenu();
            AudioManager.disparar('combate_vencido');
            setTimeout(() => {
                UIManager.mostrarTelaVitoria(() => {
                    if (this.callbacks.aoVencer) this.callbacks.aoVencer();
                });
            }, 1000);
            return true;
        }

        if (!partyViva) {
            this.emAndamento = false;
            UIManager.limparBattleMenu();
            setTimeout(() => {
                if (this.callbacks.aoPerder) this.callbacks.aoPerder();
            }, 1300);
            return true;
        }

        return false;
    }
}

export const CombatEngine = new CombatEngineClass();
