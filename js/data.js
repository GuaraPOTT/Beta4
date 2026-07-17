// ==========================================================
// data.js — FONTE ÚNICA DE DADOS DO JOGO
// ==========================================================
// Este módulo não contém lógica de jogo, apenas dados e pequenas
// funções de fábrica para instanciar personagens/inimigos.
//
// PARA EXPANDIR O JOGO:
//  - Novo aliado  -> adicione uma entrada em PERSONAGENS e inclua o id
//                    no array "party" de uma cena de combate.
//  - Novo inimigo -> adicione uma entrada em INIMIGOS e inclua o id
//                    no array "inimigos" de uma cena de combate.
//  - Nova cena    -> adicione um objeto em BANCO_DE_CENAS.
// ==========================================================

// ---------- ELEMENTOS / TIPOS DE DANO ----------
export const ELEMENTOS = {
    fisico:   { nome: 'Físico',   icone: '👊' },
    fogo:     { nome: 'Fogo',     icone: '🔥' },
    gelo:     { nome: 'Gelo',     icone: '❄️' },
    eletrico: { nome: 'Elétrico', icone: '⚡' },
    vento:    { nome: 'Vento',    icone: '🌪️' }
};

// ---------- BIBLIOTECA DE GOLPES DA PARTY (habilidades "Persona") ----------
export const BIBLIOTECA_GOLPES = {
    soco_fogo:      { id: 'soco_fogo',      nome: 'Soco de Fogo',     tipo: 'fogo',     dano: 15, custoSp: 8, msg: 'invocou sua Persona: Soco de Fogo!' },
    estocada:       { id: 'estocada',       nome: 'Estocada',         tipo: 'fisico',   dano: 8,  custoSp: 0, msg: 'usou Estocada!' },
    cristal_gelo:   { id: 'cristal_gelo',   nome: 'Cristal de Gelo',  tipo: 'gelo',     dano: 13, custoSp: 7, msg: 'invocou sua Persona: Cristal de Gelo!' },
    raio_zap:       { id: 'raio_zap',       nome: 'Raio Zap',         tipo: 'eletrico', dano: 14, custoSp: 8, msg: 'invocou sua Persona: Raio Zap!' }
};

// ---------- BIBLIOTECA DE GOLPES DOS INIMIGOS ----------
export const BIBLIOTECA_GOLPES_INIMIGOS = {
    investida:  { id: 'investida',  nome: 'Investida',    tipo: 'fisico', dano: 5,  msg: 'usou Investida!' },
    corte:      { id: 'corte',      nome: 'Corte Preciso', tipo: 'fisico', dano: 9,  msg: 'usou Corte Preciso!' },
    bola_fogo:  { id: 'bola_fogo',  nome: 'Bola de Fogo',  tipo: 'fogo',   dano: 12, msg: 'disparou uma Bola de Fogo!' },
    lanca_gelo: { id: 'lanca_gelo', nome: 'Lança de Gelo', tipo: 'gelo',   dano: 11, msg: 'arremessou uma Lança de Gelo!' }
};

// ---------- BIBLIOTECA DE ITENS (consumíveis usáveis em combate) ----------
// tipo: 'cura_hp' | 'cura_sp' | 'ataque'
// alvo: 'aliado' | 'inimigo' — define qual seleção de alvo a UI deve abrir.
// Itens ofensivos têm "elemento" e passam pelo MESMO cálculo de dano dos golpes
// normais (_calcularDano), então também interagem com fraqueza/resistência/nulo/
// absorção e podem disparar Down / One More / Ataque Total — "dano fixo" aqui
// significa "valor-base fixo" (não escala com atributos do usuário), não que
// ignore o sistema de afinidades.
export const BIBLIOTECA_ITENS = {
    pocao_hp: {
        id: 'pocao_hp', nome: 'Poção de HP', tipo: 'cura_hp', valor: 50, alvo: 'aliado',
        descricao: 'Recupera 50 HP de um aliado.'
    },
    eter_sp: {
        id: 'eter_sp', nome: 'Éter de SP', tipo: 'cura_sp', valor: 15, alvo: 'aliado',
        descricao: 'Recupera 15 SP de um aliado.'
    },
    bomba_fogo: {
        id: 'bomba_fogo', nome: 'Bomba de Fogo', tipo: 'ataque', elemento: 'fogo', valor: 15, alvo: 'inimigo',
        descricao: 'Causa 15 de dano de fogo (valor-base fixo) a um inimigo.'
    }
};

// Inventário inicial da party numa partida nova (ver GameState).
export const INVENTARIO_INICIAL = {
    pocao_hp: 3,
    eter_sp: 2,
    bomba_fogo: 1
};

// ---------- ROSTER DE PERSONAGENS (ALIADOS) ----------
// hp/sp aqui representam os valores MÁXIMOS/INICIAIS de um novo personagem.
export const PERSONAGENS = {
    nubanko: {
        id: 'nubanko',
        nome: 'Nubanko',
        hpMax: 100, hp: 100,
        spMax: 30, sp: 30,
        golpes: ['soco_fogo', 'estocada'],
        fraquezas: ['gelo'],
        resistencias: ['fisico'],
        nulo: [],
        absorve: [],
        spriteDialogo: 'img/nubanko.png',
        spriteCombate: {
            idle:   'img/nubanko.png',
            ataque: 'img/nubanko_ataque.png',
            defesa: 'img/nubanko_defesa.png',
            dano:   'img/nubanko_dano.png'
        }
    },

    andre: {
        id: 'andre',
        nome: 'André',
        hpMax: 100, hp: 100,
        spMax: 30, sp: 30,
        golpes: ['raio_zap', 'estocada'],
        fraquezas: ['gelo'],
        resistencias: ['fisico'],
        nulo: [],
        absorve: [],
        spriteDialogo: 'img/nubanko_dialogo.png',
        spriteCombate: {
            idle:   'img/nubanko.png',
            ataque: 'img/nubanko_ataque.png',
            defesa: 'img/nubanko_defesa.png',
            dano:   'img/nubanko_dano.png'
        }
    },

    moguiro: {
        id: 'moguiro',
        nome: 'Moguiro',
        hpMax: 100, hp: 100,
        spMax: 30, sp: 30,
        golpes: ['raio_zap', 'estocada'],
        fraquezas: ['gelo'],
        resistencias: ['fisico'],
        nulo: [],
        absorve: [],
        spriteDialogo: 'img/nubanko_dialogo.png',
        spriteCombate: {
            idle:   'img/inimigo.png',
            ataque: 'img/nubanko_ataque.png',
            defesa: 'img/nubanko_defesa.png',
            dano:   'img/nubanko_dano.png'
        }
    }

    // EXEMPLO — copie o bloco abaixo, ajuste os valores/sprites e descomente
    // para adicionar um 2º, 3º ou 4º aliado. Depois inclua o "id" no array
    // "party" das cenas de combate onde ele deve lutar.
    //
    // aliado_exemplo: {
    //     id: 'aliado_exemplo',
    //     nome: 'Nome do Aliado',
    //     hpMax: 80, hp: 80, spMax: 40, sp: 40,
    //     golpes: ['raio_zap', 'estocada'],
    //     fraquezas: ['vento'], resistencias: ['eletrico'], nulo: [], absorve: [],
    //     spriteDialogo: 'img/aliado_dialogo.png',
    //     spriteCombate: {
    //         idle: 'img/aliado.png', ataque: 'img/aliado_ataque.png',
    //         defesa: 'img/aliado_defesa.png', dano: 'img/aliado_dano.png'
    //     }
    // },
};

// ---------- ROSTER DE INIMIGOS ----------
export const INIMIGOS = {
    executor_silicio: {
        id: 'executor_silicio',
        nome: 'Executor de Silício',
        hpMax: 60, hp: 60,
        golpes: ['investida', 'corte'],
        fraquezas: ['fogo'],
        resistencias: ['fisico'],
        nulo: [],
        spriteCombate: {
            idle:   'img/inimigo.png',
            ataque: 'img/inimigo_ataque.png',
            defesa: 'img/inimigoAtaque.jpg',
            dano:   'img/inimigoAtaque.jpg'
        }
    },
    // Segundo inimigo de exemplo — reaproveita os mesmos sprites do primeiro
    // (apenas para demonstrar o suporte a múltiplos inimigos simultâneos).
    // Troque os caminhos de sprite quando tiver a arte definitiva.
    executor_silicio_jr: {
        id: 'executor_silicio_jr',
        nome: 'Executor de Silício Jr.',
        hpMax: 38, hp: 38,
        golpes: ['investida', 'lanca_gelo'],
        fraquezas: ['fogo'],
        resistencias: ['gelo'],
        nulo: [],
        spriteCombate: {
            idle:   'img/inimigo.png',
            ataque: 'img/inimigo_ataque.png',
            defesa: 'img/inimigoAtaque.jpg',
            dano:   'img/inimigoAtaque.jpg'
        }
    }
};

// ---------- MANIFESTO DE ÁUDIO ----------
// Troque os caminhos pelos seus arquivos reais. Se um arquivo não existir,
// o AudioManager avisa no console e o jogo continua funcionando sem travar.
export const AUDIO_MANIFEST = {
    bgm: {
        dialogo: 'audio/bgm_dialogo.mp3',
        combate: 'audio/bgm_combate.mp3',
        derrota: 'audio/bgm_derrota.mp3',
        vitoria: 'audio/bgm_vitoria.mp3'
    },
    sfx: {
        confirmar:       'audio/sfx_confirmar.mp3',
        cancelar:        'audio/sfx_cancelar.mp3',
        navegar:         'audio/sfx_navegar.mp3',
        texto_avanca:    'audio/sfx_texto.mp3',
        ataque_fisico:   'audio/sfx_ataque_fisico.mp3',
        ataque_fogo:     'audio/sfx_ataque_fogo.mp3',
        ataque_gelo:     'audio/sfx_ataque_gelo.mp3',
        ataque_eletrico: 'audio/sfx_ataque_eletrico.mp3',
        ataque_vento:    'audio/sfx_ataque_vento.mp3',
        fraqueza:        'audio/sfx_fraqueza.mp3',
        resistencia:     'audio/sfx_resistencia.mp3',
        down:            'audio/sfx_down.mp3',
        one_more:        'audio/sfx_one_more.mp3',
        baton_pass:      'audio/sfx_baton_pass.mp3',
        dano_recebido:   'audio/sfx_dano_recebido.mp3',
        vitoria_jingle:  'audio/sfx_vitoria.mp3',
        ataque_total:    'audio/sfx_ataque_total.mp3',
        item_usado:      'audio/sfx_item_usado.mp3'
    }
};

// ---------- HOOKS GLOBAIS DE ÁUDIO (evento -> chave do SFX) ----------
// Use AudioManager.disparar('nome_do_evento') em qualquer lugar do código
// para tocar o som configurado aqui, sem acoplar lógica de jogo a arquivos de áudio.
export const AUDIO_HOOKS = {
    ui_navegar:          'navegar',
    ui_confirmar:        'confirmar',
    ui_cancelar:         'cancelar',
    vn_texto_avanca:     'texto_avanca',
    'ataque_fisico':     'ataque_fisico',
    'ataque_fogo':       'ataque_fogo',
    'ataque_gelo':       'ataque_gelo',
    'ataque_eletrico':   'ataque_eletrico',
    'ataque_vento':      'ataque_vento',
    fraqueza_explorada:  'fraqueza',
    resistencia_ativada: 'resistencia',
    entidade_down:       'down',
    one_more:            'one_more',
    baton_pass:          'baton_pass',
    dano_recebido:       'dano_recebido',
    combate_vencido:     'vitoria_jingle',
    ataque_total:        'ataque_total',
    item_usado:          'item_usado'
};

// ---------- BANCO DE CENAS (Visual Novel + Combate) ----------
// transicao: 'fade' | 'crossfade' | 'manga'
// sfxEntrada: som único tocado assim que a cena carrega (opcional)
// curarPartyAntes: true para curar a party completamente antes desta cena
export const BANCO_DE_CENAS = [
    {
        id: 0, tipo: 'derrota',
        texto: 'Você foi derrotado...',
        personagem: 'GAME OVER',
        imagemFundo: 'img/fundo.jpg',
        bgm: 'derrota',
        transicao: 'fade'
    },
    {
        id: 1, tipo: 'dialogo',
        personagem: 'Nubanko',
        texto: 'O Executor de Silício bloqueia a passagem. Prepare-se!',
        imagemFundo: 'img/fundo.jpg',
        spriteDialogo: 'img/nubanko.png',
        bgm: 'dialogo',
        transicao: 'manga',
        opcoes: [{ texto: 'Iniciar Batalha', proximoId: 2 }]
    },
    {
        id: 2, tipo: 'combate',
        imagemFundo: 'img/fundo.jpg',
        bgm: 'combate',
        transicao: 'manga',
        party: ['nubanko'],
        inimigos: ['executor_silicio'],
        proximoId: 3
    },
    {
        id: 3, tipo: 'dialogo',
        personagem: 'Nubanko',
        texto: 'Um segundo alvo se aproxima rápido demais... vou precisar manter a guarda alta!',
        imagemFundo: 'img/fundo.jpg',
        spriteDialogo: 'img/nubanko.png',
        bgm: 'dialogo',
        transicao: 'fade',
        opcoes: [{ texto: 'Continuar', proximoId: 4 }]
    },
    {
        id: 4, tipo: 'combate',
        imagemFundo: 'img/fundo.jpg',
        bgm: 'combate',
        transicao: 'manga',
        curarPartyAntes: true,
        party: ['nubanko', 'andre'],
        inimigos: ['executor_silicio', 'executor_silicio_jr', 'executor_silicio_jr'],
        proximoId: 5
    },
    {
        id: 5, tipo: 'dialogo',
        personagem: 'Nubanko',
        texto: 'Os dois Executores foram desativados. A passagem está livre... por enquanto.',
        imagemFundo: 'img/fundo.jpg',
        spriteDialogo: 'img/nubanko.png',
        bgm: 'vitoria',
        transicao: 'fade',
        opcoes: [{ texto: 'Reiniciar Demonstração', proximoId: 1 }]
    }
];

let contadorInstancias = 0; // Contador global para gerar IDs únicos no DOM

function clonarEstadoFresco(base) {
    const copia = JSON.parse(JSON.stringify(base));
    copia.hp = copia.hpMax;
    if (copia.spMax !== undefined) copia.sp = copia.spMax;
    copia.down = false;
    copia.defendendo = false;
    copia.fraquezasReveladas = [];
    
    // 1. Mantém o ID original salvo caso o motor precise checar a "espécie" do monstro
    copia.idBase = base.id;
    
    // 2. Gera um ID único combinando o ID base com o contador 
    // (Ex: executor_silicio_jr_1, executor_silicio_jr_2...)
    contadorInstancias++;
    copia.id = `${base.id}_${contadorInstancias}`;
    
    return copia;
}

export function criarInstanciaPersonagem(id) {
    const base = PERSONAGENS[id];
    if (!base) { console.error(`[data] Personagem "${id}" não encontrado no roster.`); return null; }
    return clonarEstadoFresco(base);
}

export function criarInstanciaInimigo(id) {
    const base = INIMIGOS[id];
    if (!base) { console.error(`[data] Inimigo "${id}" não encontrado no roster.`); return null; }
    return clonarEstadoFresco(base);
}

// Coleta todos os caminhos de imagem referenciados pelos dados, para pré-carregamento.
export function coletarTodosOsCaminhosDeImagem() {
    const caminhos = new Set();
    Object.values(PERSONAGENS).forEach(p => {
        if (p.spriteDialogo) caminhos.add(p.spriteDialogo);
        if (p.spriteCombate) Object.values(p.spriteCombate).forEach(c => caminhos.add(c));
    });
    Object.values(INIMIGOS).forEach(i => {
        if (i.spriteCombate) Object.values(i.spriteCombate).forEach(c => caminhos.add(c));
    });
    BANCO_DE_CENAS.forEach(c => {
        if (c.imagemFundo) caminhos.add(c.imagemFundo);
        if (c.spriteDialogo) caminhos.add(c.spriteDialogo);
    });
    return [...caminhos];
}
