// ==========================================================
// audioManager.js — Sistema de áudio completo do jogo.
// ==========================================================
// Arquitetura (Web Audio API):
//
//   <audio> A ---> GainNode A ---\
//                                 +--> bgmGain --> masterGain --> destino
//   <audio> B ---> GainNode B ---/
//
//   AudioBuffer (SFX) --> BufferSourceNode --> sfxGain --> masterGain --> destino
//
// - BGM usa dois elementos <audio> alternados (A/B) para permitir CROSS-FADE
//   suave entre músicas sem cortes.
// - SFX usa buffers decodificados (Web Audio) para tocar com latência mínima
//   e permitir sobreposição (vários efeitos ao mesmo tempo, ex. dano + crítico).
// - Três canais de volume independentes: master, bgm, sfx.
// - Autoplay em mobile só é liberado após um gesto do usuário: o AudioContext
//   começa "suspended" e é retomado no primeiro toque/clique/tecla.
// ==========================================================

class AudioManagerClass {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.bgmGain = null;
        this.sfxGain = null;

        this.bgmElementos = { a: null, b: null };
        this.bgmAtivo = 'a';
        this.bgmKeyAtual = null;

        this.sfxBuffers = new Map();   // key -> AudioBuffer decodificado
        this.sfxManifest = new Map();  // key -> url
        this.bgmManifest = new Map();  // key -> url

        this.hooks = new Map();        // evento -> chave do sfx

        this.volumes = { master: 1, bgm: 0.6, sfx: 0.85 };

        this.desbloqueado = false;
        this._bgmPendente = null;      // { key, opts } aguardando gesto do usuário
        this._inicializado = false;
    }

    /** Cria o AudioContext e os nós de mixagem. Seguro para chamar mais de uma vez. */
    init() {
        if (this._inicializado) return;
        this._inicializado = true;

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            console.warn('[AudioManager] Web Audio API não suportada neste navegador.');
            return;
        }
        this.ctx = new AudioContextClass();

        this.masterGain = this.ctx.createGain();
        this.bgmGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();

        this.bgmGain.connect(this.masterGain);
        this.sfxGain.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        this.masterGain.gain.value = this.volumes.master;
        this.bgmGain.gain.value = this.volumes.bgm;
        this.sfxGain.gain.value = this.volumes.sfx;

        ['a', 'b'].forEach(chave => {
            const el = new Audio();
            el.loop = true;
            el.preload = 'auto';
            const source = this.ctx.createMediaElementSource(el);
            const gain = this.ctx.createGain();
            gain.gain.value = 0;
            source.connect(gain);
            gain.connect(this.bgmGain);
            this.bgmElementos[chave] = { el, gain };
        });

        this._registrarDesbloqueioAutoplay();
    }

    _registrarDesbloqueioAutoplay() {
        const desbloquear = () => {
            if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
            this.desbloqueado = true;
            if (this._bgmPendente) {
                const { key, opts } = this._bgmPendente;
                this._bgmPendente = null;
                this.playBGM(key, opts);
            }
            window.removeEventListener('touchstart', desbloquear);
            window.removeEventListener('click', desbloquear);
            window.removeEventListener('keydown', desbloquear);
        };
        window.addEventListener('touchstart', desbloquear, { once: true, passive: true });
        window.addEventListener('click', desbloquear, { once: true });
        window.addEventListener('keydown', desbloquear, { once: true });
    }

    // ---------------- PRELOAD ----------------

    /** Registra os caminhos de BGM/SFX disponíveis (não carrega ainda, apenas registra). */
    registrarManifest({ bgm = {}, sfx = {} } = {}) {
        Object.entries(bgm).forEach(([k, v]) => this.bgmManifest.set(k, v));
        Object.entries(sfx).forEach(([k, v]) => this.sfxManifest.set(k, v));
    }

    /** Registra um único hook evento -> sfxKey. */
    registrarHook(evento, sfxKey) {
        this.hooks.set(evento, sfxKey);
    }

    /** Registra vários hooks de uma vez a partir de um objeto { evento: sfxKey }. */
    registrarHooks(mapaDeHooks) {
        Object.entries(mapaDeHooks).forEach(([evento, sfxKey]) => this.hooks.set(evento, sfxKey));
    }

    /**
     * Pré-carrega e decodifica todos os SFX registrados (essencial para que os
     * efeitos de combate toquem sem atraso perceptível). BGM não é pré-decodificado
     * (é tocado via streaming pelo <audio>), apenas o primeiro arquivo é pré-conectado.
     */
    async precarregar(onProgress) {
        this.init();
        if (!this.ctx) return;

        const entradas = [...this.sfxManifest.entries()];
        const total = entradas.length;
        let carregadas = 0;

        await Promise.all(entradas.map(async ([key, url]) => {
            try {
                const resposta = await fetch(url);
                if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
                const arrayBuffer = await resposta.arrayBuffer();
                const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
                this.sfxBuffers.set(key, audioBuffer);
            } catch (erro) {
                console.warn(`[AudioManager] SFX "${key}" não pôde ser pré-carregado (${erro.message}). O jogo seguirá sem esse som.`);
            } finally {
                carregadas++;
                if (onProgress) onProgress(carregadas, total);
            }
        }));
    }

    // ---------------- BGM ----------------

    /**
     * Toca uma música de fundo com cross-fade suave. Se já for a BGM atual, não faz nada
     * (a menos que `force: true`).
     */
    playBGM(key, { loop = true, fadeMs = 900, force = false } = {}) {
        this.init();
        if (!this.ctx) return;
        if (!force && this.bgmKeyAtual === key) return;

        const url = this.bgmManifest.get(key);
        if (!url) { console.warn(`[AudioManager] BGM "${key}" não registrada.`); return; }

        if (!this.desbloqueado || this.ctx.state === 'suspended') {
            this._bgmPendente = { key, opts: { loop, fadeMs, force } };
            return;
        }

        const proximaChave = this.bgmAtivo === 'a' ? 'b' : 'a';
        const atual = this.bgmElementos[this.bgmAtivo];
        const proxima = this.bgmElementos[proximaChave];

        proxima.el.src = url;
        proxima.el.loop = loop;
        proxima.el.currentTime = 0;
        proxima.el.play().catch(() => { /* política de autoplay pode recusar; ok, ficará pendente no próximo gesto */ });

        const t0 = this.ctx.currentTime;
        const duracao = fadeMs / 1000;

        proxima.gain.gain.cancelScheduledValues(t0);
        proxima.gain.gain.setValueAtTime(proxima.gain.gain.value, t0);
        proxima.gain.gain.linearRampToValueAtTime(1, t0 + duracao);

        atual.gain.gain.cancelScheduledValues(t0);
        atual.gain.gain.setValueAtTime(atual.gain.gain.value, t0);
        atual.gain.gain.linearRampToValueAtTime(0, t0 + duracao);

        const elParaPausar = atual.el;
        setTimeout(() => elParaPausar.pause(), fadeMs + 60);

        this.bgmAtivo = proximaChave;
        this.bgmKeyAtual = key;
    }

    /** Silencia a BGM atual com fade-out. */
    stopBGM({ fadeMs = 700 } = {}) {
        if (!this.ctx) return;
        const atual = this.bgmElementos[this.bgmAtivo];
        const t0 = this.ctx.currentTime;
        atual.gain.gain.cancelScheduledValues(t0);
        atual.gain.gain.setValueAtTime(atual.gain.gain.value, t0);
        atual.gain.gain.linearRampToValueAtTime(0, t0 + fadeMs / 1000);
        const el = atual.el;
        setTimeout(() => el.pause(), fadeMs + 60);
        this.bgmKeyAtual = null;
    }

    // ---------------- SFX ----------------

    /** Toca um efeito sonoro pré-carregado. Várias chamadas podem sobrepor sem problema. */
    playSFX(key, { volume = 1, taxa = 1 } = {}) {
        if (!this.ctx || this.ctx.state === 'suspended') return; // silencioso até o desbloqueio
        const buffer = this.sfxBuffers.get(key);
        if (!buffer) return; // som ausente/não pré-carregado: falha silenciosa (não deve travar o jogo)

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = taxa;

        const gainLocal = this.ctx.createGain();
        gainLocal.gain.value = clampVolume(volume);
        source.connect(gainLocal);
        gainLocal.connect(this.sfxGain);
        source.start(0);
    }

    /** Dispara o SFX associado a um evento registrado via registrarHook(s). Falha silenciosa se não houver hook. */
    disparar(evento, opts) {
        const chave = this.hooks.get(evento);
        if (chave) this.playSFX(chave, opts);
    }

    // ---------------- VOLUME ----------------

    /** canal: 'master' | 'bgm' | 'sfx' */
    setVolume(canal, valor) {
        const v = clampVolume(valor);
        this.volumes[canal] = v;
        if (!this.ctx) return;
        if (canal === 'master') this.masterGain.gain.value = v;
        if (canal === 'bgm') this.bgmGain.gain.value = v;
        if (canal === 'sfx') this.sfxGain.gain.value = v;
    }

    getVolume(canal) {
        return this.volumes[canal] ?? 1;
    }
}

function clampVolume(v) {
    return Math.max(0, Math.min(1, v));
}

export const AudioManager = new AudioManagerClass();
