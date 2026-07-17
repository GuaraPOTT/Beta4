// ==========================================================
// uiManager.js — Toda a manipulação de DOM do jogo vive aqui.
// ==========================================================
// SceneManager e CombatEngine nunca tocam no DOM diretamente: eles chamam
// métodos do UIManager e passam callbacks para o que deve acontecer quando
// o jogador interage (clica um botão, escolhe um alvo, etc). Isso mantém a
// lógica de jogo desacoplada da apresentação.
// ==========================================================

import { AudioManager } from './audioManager.js';
import { aguardar } from './utils.js';

const EL = {};
let menuExpandido = false;

class UIManagerClass {

    // ---------------- SETUP ----------------

    cacheDom() {
        EL.viewportLock       = document.getElementById('viewport-lock');
        EL.gameContainer      = document.getElementById('game-container');
        EL.bgLayerA           = document.getElementById('bg-layer-a');
        EL.bgLayerB           = document.getElementById('bg-layer-b');
        EL.bgAtiva            = 'a';
        EL.transitionOverlay  = document.getElementById('transition-overlay');

        EL.hudPartyGroup      = document.getElementById('party-hud-group');
        EL.hudEnemyGroup      = document.getElementById('enemy-hud-group');

        EL.partyRow           = document.getElementById('party-row');
        EL.enemyRow           = document.getElementById('enemy-row');
        EL.gifInvocacao       = document.getElementById('gif-invocacao');

        EL.nav                = document.getElementById('nav-comentario');

        EL.dialogContainer    = document.getElementById('dialog-container');
        EL.spriteDialogo      = document.getElementById('sprite-dialogo');
        EL.nomePersonagem     = document.getElementById('nome-personagem');
        EL.textoDialogo       = document.getElementById('texto-dialogo');
        EL.opcoes             = document.getElementById('opcoes');

        EL.battleMenuContainer = document.getElementById('battle-menu-container');
        EL.battleMenuToggle   = document.getElementById('battle-menu-toggle');
        EL.battleMenu         = document.getElementById('battle-menu');
        EL.oneMorePrompt       = document.getElementById('one-more-prompt');
        EL.allOutPrompt       = document.getElementById('all-out-prompt');
        EL.flashOverlay       = document.getElementById('flash-overlay');

        EL.victoryScreen      = document.getElementById('victory-screen');
        EL.victoryOptions     = document.getElementById('victory-options');

        EL.loadingScreen      = document.getElementById('loading-screen');
        EL.loadingBarFill     = document.getElementById('loading-bar-fill');
        EL.loadingTexto       = document.getElementById('loading-texto');

        // Gatilho do menu sanduíche: alterna expandir/recolher. Conectado uma
        // única vez aqui (não é recriado a cada render de menu).
        EL.battleMenuToggle.onclick = () => {
            menuExpandido = !menuExpandido;
            AudioManager.disparar(menuExpandido ? 'ui_confirmar' : 'ui_cancelar');
            this._atualizarEstadoMenuColapsavel();
        };
    }

    /** Mostra/esconde o botão-gatilho conforme há ou não opções pra decidir, e aplica a classe de expandido/recolhido. */
    _atualizarEstadoMenuColapsavel() {
        const temConteudo = EL.battleMenu.children.length > 0;
        EL.battleMenuToggle.classList.toggle('visivel', temConteudo);
        EL.battleMenuToggle.setAttribute('aria-expanded', String(menuExpandido));
        EL.battleMenuContainer.classList.toggle('expandido', menuExpandido && temConteudo);
        if (!temConteudo) menuExpandido = false;
    }

    /** Força o menu a recolher (chamado quando uma ação é de fato disparada — ver limparBattleMenu). */
    colapsarMenuAcao() {
        menuExpandido = false;
        this._atualizarEstadoMenuColapsavel();
    }

    // ---------------- TELA DE CARREGAMENTO ----------------

    atualizarProgressoCarregamento(pct, texto) {
        if (EL.loadingBarFill) EL.loadingBarFill.style.width = `${pct}%`;
        if (texto && EL.loadingTexto) EL.loadingTexto.innerText = texto;
    }

    async esconderTelaCarregamento() {
        if (!EL.loadingScreen) return;
        EL.loadingScreen.classList.add('carregado');
        await aguardar(500);
        EL.loadingScreen.style.display = 'none';
    }

    // ---------------- FUNDO E TRANSIÇÕES ----------------

    definirFundo(url, instantaneo = false) {
        if (!url) return;
        const ativa = EL.bgAtiva === 'a' ? EL.bgLayerA : EL.bgLayerB;
        const inativa = EL.bgAtiva === 'a' ? EL.bgLayerB : EL.bgLayerA;

        inativa.style.backgroundImage = `url('${url}')`;
        if (instantaneo) {
            inativa.style.transition = 'none';
            ativa.style.opacity = '0';
            inativa.style.opacity = '1';
            requestAnimationFrame(() => { inativa.style.transition = ''; });
        } else {
            inativa.style.opacity = '1';
            ativa.style.opacity = '0';
        }
        EL.bgAtiva = EL.bgAtiva === 'a' ? 'b' : 'a';
    }

    /**
     * Executa uma transição de cena. `aplicarNovaCena` é chamado no momento em
     * que a tela está totalmente coberta (para trocar fundo/HUD/conteúdo sem o
     * jogador ver o "corte").
     */
    async transicionar(tipo, aplicarNovaCena) {
        switch (tipo) {
            case 'crossfade':
                aplicarNovaCena();
                await aguardar(650); // dá tempo pro crossfade de background (CSS transition) concluir
                return;
            case 'manga':
                return this._transicaoManga(aplicarNovaCena);
            case 'fade':
            default:
                return this._transicaoFade(aplicarNovaCena);
        }
    }

    async _transicaoFade(aplicarNovaCena) {
        EL.transitionOverlay.classList.add('fade-cover');
        await aguardar(320);
        aplicarNovaCena();
        await aguardar(60);
        EL.transitionOverlay.classList.remove('fade-cover');
        await aguardar(320);
    }

    async _transicaoManga(aplicarNovaCena) {
        EL.transitionOverlay.classList.add('manga-cobrindo');
        await aguardar(460);
        aplicarNovaCena();
        await aguardar(80);
        EL.transitionOverlay.classList.remove('manga-cobrindo');
        EL.transitionOverlay.classList.add('manga-revelando');
        await aguardar(460);
        EL.transitionOverlay.classList.remove('manga-revelando');
    }

    // ---------------- DIÁLOGO (VISUAL NOVEL) ----------------

    /**
     * Mostra uma cena de diálogo com efeito de "máquina de escrever" (pode ser
     * pulado com um toque na caixa). `aoEscolherOpcao(proximoId)` é chamado
     * quando o jogador clica em uma das opções.
     */
    async mostrarDialogo(cena, aoEscolherOpcao) {
        this.esconderHUD();
        this.limparBattleMenu();
        EL.enemyRow.innerHTML = '';
        EL.partyRow.innerHTML = '';

        EL.spriteDialogo.src = cena.spriteDialogo || '';
        EL.spriteDialogo.style.display = cena.spriteDialogo ? 'block' : 'none';
        EL.dialogContainer.style.display = 'block';

        EL.nomePersonagem.innerText = cena.personagem || '';
        EL.opcoes.innerHTML = '';

        await this._escreverTexto(cena.texto || '');

        (cena.opcoes || []).forEach(opcao => {
            const btn = document.createElement('button');
            btn.innerText = opcao.texto;
            btn.onclick = () => {
                AudioManager.disparar('ui_confirmar');
                aoEscolherOpcao(opcao.proximoId);
            };
            EL.opcoes.appendChild(btn);
        });
    }

    _escreverTexto(texto) {
        return new Promise(resolve => {
            EL.textoDialogo.innerText = '';
            let indice = 0;
            let pulado = false;
            const velocidadeMs = 20;

            const pular = () => {
                pulado = true;
                AudioManager.disparar('ui_confirmar');
            };
            EL.dialogContainer.addEventListener('click', pular);

            const tick = () => {
                if (pulado) {
                    EL.textoDialogo.innerText = texto;
                    EL.dialogContainer.removeEventListener('click', pular);
                    resolve();
                    return;
                }
                indice++;
                EL.textoDialogo.innerText = texto.slice(0, indice);
                if (indice % 2 === 0) AudioManager.disparar('vn_texto_avanca');
                if (indice < texto.length) {
                    setTimeout(tick, velocidadeMs);
                } else {
                    EL.dialogContainer.removeEventListener('click', pular);
                    resolve();
                }
            };
            tick();
        });
    }

    mostrarDerrota(cena, aoReiniciar) {
        this.esconderHUD();
        this.limparBattleMenu();
        EL.enemyRow.innerHTML = '';
        EL.partyRow.innerHTML = '';
        EL.spriteDialogo.style.display = 'none';
        EL.dialogContainer.style.display = 'block';

        EL.nomePersonagem.innerText = cena.personagem || 'GAME OVER';
        EL.textoDialogo.innerText = cena.texto;
        EL.opcoes.innerHTML = '';
        const btn = document.createElement('button');
        btn.innerText = 'Tentar Novamente';
        btn.onclick = () => { AudioManager.disparar('ui_confirmar'); aoReiniciar(); };
        EL.opcoes.appendChild(btn);
    }

    esconderDialogo() {
        EL.dialogContainer.style.display = 'none';
        EL.spriteDialogo.style.display = 'none';
    }

    // ---------------- COMBATE: PREPARAÇÃO DE TELA ----------------

    prepararTelaCombate() {
        this.esconderDialogo();
        document.getElementById('hud').style.display = 'flex';
        EL.nav.style.display = 'block';
    }

    esconderHUD() {
        document.getElementById('hud').style.display = 'none';
        EL.nav.style.display = 'none';
    }

    setNav(texto) {
        EL.nav.innerText = texto;
    }

    // ---------------- HUD (cartões de HP) ----------------

    renderizarHUD(party, inimigos) {
        EL.hudPartyGroup.innerHTML = '';
        party.forEach(p => EL.hudPartyGroup.appendChild(this._criarHudCard(p)));

        EL.hudEnemyGroup.innerHTML = '';
        inimigos.forEach(e => EL.hudEnemyGroup.appendChild(this._criarHudCard(e)));
    }

    atualizarHUD(party, inimigos) {
        this.renderizarHUD(party, inimigos);
    }

    _criarHudCard(entidade) {
        const card = document.createElement('div');
        card.className = 'hud-card';
        card.dataset.id = entidade.id;

        const pctHp = Math.max(0, Math.round((entidade.hp / entidade.hpMax) * 100));
        const corBarra = pctHp > 50 ? 'ok' : pctHp > 20 ? 'atencao' : 'critico';

        const temSp = entidade.spMax !== undefined && entidade.spMax !== null;
        const pctSp = temSp ? Math.max(0, Math.round(((entidade.sp ?? 0) / entidade.spMax) * 100)) : 0;

        // Texto de valor ("100/100") fica DENTRO da barra (span absoluto centralizado),
        // sem linha de status separada. "DOWN" ganha linha própria, sem alargar o card.
        // Sem ícones de fraqueza aqui de propósito: eles faziam o card crescer
        // verticalmente e nunca foram pedidos — a caixinha tem altura máxima fixa (CSS).
        card.innerHTML = `
            <div class="hud-name">${entidade.nome}</div>
            <div class="hud-bar hud-hp-bar">
                <div class="hud-bar-fill hud-hp-fill ${corBarra}" style="width:${pctHp}%"></div>
                <span class="hud-bar-texto">${Math.max(0, entidade.hp)}/${entidade.hpMax}</span>
            </div>
            ${entidade.down ? '<div class="hud-down-linha">DOWN</div>' : ''}
            ${temSp ? `
            <div class="hud-bar hud-sp-bar">
                <div class="hud-bar-fill hud-sp-fill" style="width:${pctSp}%"></div>
                <span class="hud-bar-texto">${Math.max(0, entidade.sp ?? 0)}/${entidade.spMax}</span>
            </div>
            ` : ''}
        `;
        if (entidade.hp <= 0) card.classList.add('hud-ko');
        return card;
    }

    // ---------------- BATTLEFIELD (sprites em cena) ----------------

    renderizarBattlefield(party, inimigos) {
        EL.partyRow.innerHTML = '';
        EL.partyRow.dataset.count = String(party.length);
        party.forEach(p => EL.partyRow.appendChild(this._criarSlotCombate(p, 'party')));

        EL.enemyRow.innerHTML = '';
        EL.enemyRow.dataset.count = String(inimigos.length);
        inimigos.forEach(e => EL.enemyRow.appendChild(this._criarSlotCombate(e, 'enemy')));
    }

    _criarSlotCombate(entidade, lado) {
        const slot = document.createElement('div');
        slot.className = `combat-slot combat-slot-${lado}`;
        slot.dataset.id = entidade.id;
        slot.tabIndex = 0;
        slot.setAttribute('role', 'img');
        slot.setAttribute('aria-label', entidade.nome);
        if (entidade.down) slot.classList.add('is-down');
        if (entidade.hp <= 0) slot.classList.add('is-ko');

        const img = document.createElement('img');
        img.className = 'combat-sprite';
        img.alt = entidade.nome;
        img.src = entidade.spriteCombate.idle;
        slot.appendChild(img);

        return slot;
    }

    /** Atualiza apenas as classes visuais (down/ko) sem recriar os elementos de sprite (evita cortar animações em andamento). */
    atualizarEstadosBattlefield(party, inimigos) {
        [...party, ...inimigos].forEach(entidade => {
            const slot = document.querySelector(`.combat-slot[data-id="${entidade.id}"]`);
            if (!slot) return;
            slot.classList.toggle('is-down', !!entidade.down);
            slot.classList.toggle('is-ko', entidade.hp <= 0);
        });
    }

    /**
     * Marca qual aliado é o "ator ativo" na pilha sobreposta de #party-row:
     * ele ganha .active (colorido, 105%, na frente) e todos os outros
     * ganham .inactive (recuam, encolhem, silhueta azulada). Só afeta a
     * party — os inimigos continuam cada um no seu próprio espaço.
     */
    definirAtorAtivo(atorId) {
        EL.partyRow.querySelectorAll('.combat-slot').forEach(slot => {
            const ehAtivo = slot.dataset.id === atorId;
            slot.classList.toggle('active', ehAtivo);
            slot.classList.toggle('inactive', !ehAtivo);
        });
    }

    _spriteEl(entidadeId) {
        return document.querySelector(`.combat-slot[data-id="${entidadeId}"] .combat-sprite`);
    }

    /** Troca a pose do sprite (ex.: 'ataque', 'dano', 'defesa') e volta a 'idle' após `duracaoMs` (se >0). */
    animarPose(entidade, pose, duracaoMs = 800) {
        const img = this._spriteEl(entidade.id);
        if (!img || !entidade.spriteCombate[pose]) return;
        img.src = entidade.spriteCombate[pose];
        if (duracaoMs > 0) {
            setTimeout(() => {
                // guarda contra cenas trocadas: só volta ao idle se o elemento ainda existir e a entidade seguir viva
                if (img.isConnected && entidade.hp > 0) img.src = entidade.spriteCombate.idle;
            }, duracaoMs);
        }
    }

    aplicarShake(entidadeId, intensidade = 'light') {
        const img = this._spriteEl(entidadeId);
        if (!img) return;
        const classe = intensidade === 'heavy' ? 'shake-heavy' : 'shake-light';
        img.classList.add(classe);
        setTimeout(() => img.classList.remove(classe), 420);
    }

    mostrarInvocacao() {
        EL.gifInvocacao.src = 'img/invocacao.gif?t=' + Date.now();
        EL.gifInvocacao.style.display = 'block';
        setTimeout(() => { EL.gifInvocacao.style.display = 'none'; }, 1100);
    }

    // ---------------- POPUPS DE DANO ----------------

    mostrarPopup(texto, tipo, entidadeId, offsetY = 0) {
        const slot = document.querySelector(`.combat-slot[data-id="${entidadeId}"]`);
        if (!slot || !EL.gameContainer) return;

        const rect = slot.getBoundingClientRect();
        const containerRect = EL.gameContainer.getBoundingClientRect();
        const popup = document.createElement('div');
        popup.className = 'battle-popup ' + tipo;
        popup.innerText = texto;
        popup.style.left = (rect.left - containerRect.left + rect.width / 2) + 'px';
        popup.style.top = (rect.top - containerRect.top + 40 + offsetY) + 'px';
        EL.gameContainer.appendChild(popup);
        setTimeout(() => popup.remove(), 900);
    }

    // ---------------- MENUS DE COMBATE ----------------

    limparBattleMenu() {
        EL.battleMenu.innerHTML = '';
        EL.oneMorePrompt.classList.remove('ativo');
        EL.oneMorePrompt.innerHTML = '';
        EL.allOutPrompt.classList.remove('ativo');
        EL.allOutPrompt.innerHTML = '';
        this.colapsarMenuAcao();
    }

    /** Tela de seleção de "quem age" quando há mais de 1 personagem disponível. */
    renderizarMenuAcaoParty({ atores, onEscolher }) {
        EL.battleMenu.innerHTML = '';
        const titulo = document.createElement('div');
        titulo.className = 'menu-titulo';
        titulo.innerText = 'Quem vai agir?';
        EL.battleMenu.appendChild(titulo);

        atores.forEach(ator => {
            const btn = document.createElement('button');
            btn.innerText = `${ator.nome} (${ator.hp}/${ator.hpMax})`;
            btn.onclick = () => { AudioManager.disparar('ui_navegar'); onEscolher(ator); };
            EL.battleMenu.appendChild(btn);
        });
        this._atualizarEstadoMenuColapsavel();
    }

    renderizarMenuPrincipal({ ator, onAtacar, onDefender, onItens, onVoltarSelecao }) {
        EL.battleMenu.innerHTML = '';

        const label = document.createElement('div');
        label.className = 'menu-titulo';
        label.innerText = `${ator.nome}, o que fazemos?`;
        EL.battleMenu.appendChild(label);

        const atacar = document.createElement('button');
        atacar.innerText = 'ATACAR';
        atacar.onclick = () => { AudioManager.disparar('ui_confirmar'); onAtacar(); };
        EL.battleMenu.appendChild(atacar);

        const defender = document.createElement('button');
        defender.innerText = 'DEFENDER';
        defender.onclick = () => { AudioManager.disparar('ui_confirmar'); onDefender(); };
        EL.battleMenu.appendChild(defender);

        const itens = document.createElement('button');
        itens.innerText = 'ITENS';
        itens.onclick = () => { AudioManager.disparar('ui_confirmar'); onItens(); };
        EL.battleMenu.appendChild(itens);

        if (onVoltarSelecao) {
            const voltar = document.createElement('button');
            voltar.innerText = '← Trocar personagem';
            voltar.className = 'btn-secundario';
            voltar.onclick = () => { AudioManager.disparar('ui_cancelar'); onVoltarSelecao(); };
            EL.battleMenu.appendChild(voltar);
        }
        this._atualizarEstadoMenuColapsavel();
    }

    /** Sublista de itens usáveis, com quantidade. Escolher chama onEscolher(item); item.tipo decide a seleção de alvo no CombatEngine. */
    renderizarMenuItens({ itens, onEscolher, onVoltar }) {
        EL.battleMenu.innerHTML = '';

        const titulo = document.createElement('div');
        titulo.className = 'menu-titulo';
        titulo.innerText = 'Itens';
        EL.battleMenu.appendChild(titulo);

        if (itens.length === 0) {
            const aviso = document.createElement('div');
            aviso.className = 'menu-titulo';
            aviso.innerText = 'Nenhum item disponível.';
            EL.battleMenu.appendChild(aviso);
        }

        itens.forEach(item => {
            const btn = document.createElement('button');
            const icone = item.tipo === 'ataque' ? (ICONES_ELEMENTO[item.elemento] || '💥')
                : item.tipo === 'cura_sp' ? '🔷' : '💊';
            btn.innerText = `${icone} ${item.nome} (x${item.quantidade})`;
            btn.onclick = () => { AudioManager.disparar('ui_confirmar'); onEscolher(item); };
            EL.battleMenu.appendChild(btn);
        });

        const voltar = document.createElement('button');
        voltar.innerText = '← Voltar';
        voltar.className = 'btn-secundario';
        voltar.onclick = () => { AudioManager.disparar('ui_cancelar'); onVoltar(); };
        EL.battleMenu.appendChild(voltar);
        this._atualizarEstadoMenuColapsavel();
    }

    renderizarMenuGolpes({ ator, golpes, onEscolher, onVoltar }) {
        EL.battleMenu.innerHTML = '';
        golpes.forEach(golpe => {
            const custoSp = golpe.custoSp || 0;
            const podeUsar = custoSp <= (ator.sp ?? 0);
            const btn = document.createElement('button');
            const icone = ICONES_ELEMENTO[golpe.tipo] || '';
            const sufixoSp = custoSp > 0 ? ` (${custoSp} SP)` : '';
            btn.innerText = `${icone} ${golpe.nome}${sufixoSp}`;
            if (!podeUsar) {
                btn.disabled = true;
                btn.classList.add('indisponivel');
                btn.title = 'SP insuficiente';
            } else {
                btn.onclick = () => { AudioManager.disparar('ui_confirmar'); onEscolher(golpe); };
            }
            EL.battleMenu.appendChild(btn);
        });
        const voltar = document.createElement('button');
        voltar.innerText = '← Voltar';
        voltar.className = 'btn-secundario';
        voltar.onclick = () => { AudioManager.disparar('ui_cancelar'); onVoltar(); };
        EL.battleMenu.appendChild(voltar);
        this._atualizarEstadoMenuColapsavel();
    }

    /**
     * Pede para o jogador escolher um alvo dentre `candidatos`. Oferece DUAS formas
     * de seleção simultâneas (o que resolver primeiro vence): tocar o sprite no
     * campo de batalha, ou tocar um botão de texto — importante para hitboxes
     * confortáveis em telas pequenas.
     */
    escolherAlvo(candidatos, lado) {
        return new Promise(resolve => {
            const container = lado === 'enemy' ? EL.enemyRow : EL.partyRow;
            const idsValidos = new Set(candidatos.map(c => c.id));
            const slots = [...container.querySelectorAll('.combat-slot')].filter(s => idsValidos.has(s.dataset.id));

            let resolvido = false;
            const escolher = (entidade) => {
                if (resolvido) return;
                resolvido = true;
                limpar();
                resolve(entidade);
            };
            const onSlotClick = (ev) => {
                const entidade = candidatos.find(c => c.id === ev.currentTarget.dataset.id);
                if (entidade) escolher(entidade);
            };
            const onSlotKey = (ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') onSlotClick(ev);
            };
            function limpar() {
                slots.forEach(s => {
                    s.classList.remove('selecionavel');
                    s.removeEventListener('click', onSlotClick);
                    s.removeEventListener('keydown', onSlotKey);
                });
            }

            slots.forEach(s => {
                s.classList.add('selecionavel');
                s.addEventListener('click', onSlotClick);
                s.addEventListener('keydown', onSlotKey);
            });

            EL.battleMenu.innerHTML = '';
            const titulo = document.createElement('div');
            titulo.className = 'menu-titulo';
            titulo.innerText = 'Escolha o alvo:';
            EL.battleMenu.appendChild(titulo);
            candidatos.forEach(c => {
                const btn = document.createElement('button');
                btn.innerText = `${c.nome} (${Math.max(0, c.hp)}/${c.hpMax})`;
                btn.onclick = () => escolher(c);
                EL.battleMenu.appendChild(btn);
            });
            this._atualizarEstadoMenuColapsavel();
        });
    }

    /** Banner de "ONE MORE!" com opção de continuar com o mesmo personagem ou passar o bastão. */
    mostrarPromptOneMore({ podeBatonPass, onContinuar, onBatonPass }) {
        EL.battleMenu.innerHTML = '';
        EL.oneMorePrompt.innerHTML = `<div class="one-more-titulo">ONE MORE!</div>`;
        EL.oneMorePrompt.classList.add('ativo');

        const acoes = document.createElement('div');
        acoes.className = 'one-more-acoes';

        const continuarBtn = document.createElement('button');
        continuarBtn.innerText = 'Continuar Ataque';
        continuarBtn.onclick = () => {
            AudioManager.disparar('ui_confirmar');
            EL.oneMorePrompt.classList.remove('ativo');
            onContinuar();
        };
        acoes.appendChild(continuarBtn);

        if (podeBatonPass) {
            const batonBtn = document.createElement('button');
            batonBtn.innerText = 'Passar o Bastão';
            batonBtn.onclick = () => {
                AudioManager.disparar('baton_pass');
                EL.oneMorePrompt.classList.remove('ativo');
                onBatonPass();
            };
            acoes.appendChild(batonBtn);
        }

        EL.oneMorePrompt.appendChild(acoes);
    }

    /** Cut-in dramático de "todos os inimigos estão Down" com [ATAQUE TOTAL] / [CANCELAR]. */
    mostrarPromptAtaqueTotal({ onConfirmar, onCancelar }) {
        EL.battleMenu.innerHTML = '';
        EL.allOutPrompt.innerHTML = `
            <div class="all-out-cutin">
                <div class="all-out-titulo">TODOS OS INIMIGOS ESTÃO ABATIDOS!</div>
                <div class="all-out-subtitulo">ATAQUE TOTAL?</div>
            </div>
        `;
        EL.allOutPrompt.classList.add('ativo');

        const acoes = document.createElement('div');
        acoes.className = 'all-out-acoes';

        const confirmarBtn = document.createElement('button');
        confirmarBtn.innerText = 'ATAQUE TOTAL';
        confirmarBtn.className = 'btn-ataque-total';
        confirmarBtn.onclick = () => {
            EL.allOutPrompt.classList.remove('ativo');
            onConfirmar();
        };
        acoes.appendChild(confirmarBtn);

        const cancelarBtn = document.createElement('button');
        cancelarBtn.innerText = 'CANCELAR';
        cancelarBtn.className = 'btn-secundario';
        cancelarBtn.onclick = () => {
            AudioManager.disparar('ui_cancelar');
            EL.allOutPrompt.classList.remove('ativo');
            onCancelar();
        };
        acoes.appendChild(cancelarBtn);

        EL.allOutPrompt.appendChild(acoes);
    }

    /** Flash duplo em tela cheia pro golpe final do Ataque Total. */
    async animarAtaqueTotal() {
        for (let i = 0; i < 2; i++) {
            EL.flashOverlay.classList.remove('flash-ativo');
            void EL.flashOverlay.offsetWidth; // força reflow para reiniciar a animação CSS
            EL.flashOverlay.classList.add('flash-ativo');
            await aguardar(180);
        }
    }

    // ---------------- VITÓRIA ----------------

    mostrarTelaVitoria(aoAvancar) {
        EL.victoryOptions.innerHTML = '';
        const btn = document.createElement('button');
        btn.innerText = 'Avançar';
        btn.onclick = () => {
            AudioManager.disparar('ui_confirmar');
            EL.victoryScreen.classList.remove('active');
            aoAvancar();
        };
        EL.victoryOptions.appendChild(btn);
        EL.victoryScreen.classList.add('active');
    }

    esconderTelaVitoria() {
        EL.victoryScreen.classList.remove('active');
    }
}

const ICONES_ELEMENTO = {
    fisico: '👊', fogo: '🔥', gelo: '❄️', eletrico: '⚡', vento: '🌪️'
};

export const UIManager = new UIManagerClass();
