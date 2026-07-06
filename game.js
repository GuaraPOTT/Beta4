// ==========================================
// 1. GERENCIADOR DE ÁUDIO
// ==========================================
const audioManager = {
    bgmAtual: null,
    tocarBGM(musica) { return; },
    tocarSFX(som) { return; },
    vincularSonsBotoes() { return; }
};

// ==========================================
// 2. ESTADO GLOBAL E CONFIG DE SPRITES
// ==========================================
let hpAtualInimigo = 0;
let hpJogador = 100;
let inimigoAtual = null;
let defendendo = false;
let cenaAtual = null; 

const nubankoConfig = {
    spriteDialogo: "img/nubanko_dialogo.png",
    spriteCombate: {
        idle: "img/nubanko.png",        
        ataque: "img/nubanko_ataque.png",     
        defesa: "img/nubanko_defesa.png",     
        dano: "img/nubanko_dano.png"        
    }
};

const bibliotecaGolpes = {
    investida: { nome: "Investida", dano: 5, msg: "usou Investida!" },
    corte: { nome: "Corte Preciso", dano: 9, msg: "usou Corte Preciso!" },
    bola_fogo: { nome: "Bola de Fogo", dano: 12, msg: "disparou uma Bola de Fogo!" }
};

const golpesPersona = [
    { nome: "Soco de Fogo", tipo: "fogo", dano: 15 },
    { nome: "Estocada", tipo: "fisico", dano: 8 }
];

const bancoDeCenas = [
    { id: 0, tipo: "derrota", texto: "Você foi derrotado...", personagem: "Nubanko", imagemFundo: "img/fundo.jpg" },
    { 
        id: 1, tipo: "dialogo", texto: "O Executor de Silício bloqueia a passagem. Prepare-se!", personagem: "Nubanko", imagemFundo: "img/fundo.jpg", 
        spriteDialogo: "img/nubanko_dialogo_assustado.png", 
        opcoes: [{ texto: "Iniciar Batalha", proximoId: 2 }] 
    },
    { 
        id: 2, tipo: "combate", 
        inimigo: { 
            nome: "Executor de Silício", hp: 60, golpes: ["investida", "corte"], fraqueza: "fogo", resistencia: "fisico", 
            spriteCombate: { idle: "img/inimigo.png", ataque: "img/inimigo_ataque.png", defesa: "img/inimigoAtaque.jpg", dano: "img/inimigoAtaque.jpg" },
            defendendo: false 
        }, 
        proximoId: 0 
    }
];

// ==========================================
// 3. MOTOR PRINCIPAL
// ==========================================
function carregarCena(id) {
    const cena = bancoDeCenas.find(c => c.id === id);
    if (!cena) return;
    cenaAtual = cena;

    const nav = document.getElementById("nav-comentario");
    // Agora apontamos para o novo container que envolve a caixa e o header
    const caixaDialogo = document.getElementById("dialog-container"); 
    const hud = document.getElementById("hud");
    const elementoFundo = document.getElementById("game-container"); 
    const spriteInimigo = document.getElementById("sprite-inimigo");
    const spriteJogadorCombate = document.getElementById("sprite-personagem");
    const spriteDialogo = document.getElementById("sprite-dialogo");
    const battleMenu = document.getElementById("battle-menu");
    
    document.getElementById("victory-screen").classList.remove("active");

    if (cena.imagemFundo) elementoFundo.style.backgroundImage = `url('${cena.imagemFundo}')`;

    if (cena.tipo === "dialogo") {
        audioManager.tocarBGM(audioManager.bgmDialogo);
        hud.style.display = "none";
        nav.style.display = "none";
        spriteInimigo.style.display = "none";
        spriteJogadorCombate.style.display = "none";
        
        spriteDialogo.src = cena.spriteDialogo || nubankoConfig.spriteDialogo;
        spriteDialogo.style.display = "block";
        caixaDialogo.style.display = "block";
        battleMenu.innerHTML = "";
        
        document.getElementById("nome-personagem").innerText = cena.personagem;
        document.getElementById("texto-dialogo").innerText = cena.texto;
        
        const opcoesDiv = document.getElementById("opcoes");
        opcoesDiv.innerHTML = "";
        cena.opcoes.forEach(opcao => {
            const btn = document.createElement("button");
            btn.innerText = opcao.texto;
            btn.onclick = () => carregarCena(opcao.proximoId);
            opcoesDiv.appendChild(btn);
        });
        audioManager.vincularSonsBotoes();
    } 
    else if (cena.tipo === "combate") {
        audioManager.tocarBGM(audioManager.bgmCombate);
        inimigoAtual = cena.inimigo;
        hpAtualInimigo = cena.inimigo.hp;
        defendendo = false;
        
        caixaDialogo.style.display = "none";
        spriteDialogo.style.display = "none";
        
        hud.style.display = "flex";
        nav.style.display = "block";
        document.getElementById("enemy-name").innerText = inimigoAtual.nome;
        
        spriteJogadorCombate.src = nubankoConfig.spriteCombate.idle;
        spriteJogadorCombate.style.display = "block";
        
        spriteInimigo.src = inimigoAtual.spriteCombate.idle;
        spriteInimigo.style.display = "block";
        
        nav.innerText = `Um novo inimigo aparece: ${inimigoAtual.nome}!`;
        atualizarDisplay();
        exibirMenuPrincipal();
    } 
    else if (cena.tipo === "derrota") {
        audioManager.tocarBGM(null); 
        hud.style.display = "none";
        nav.style.display = "none";
        spriteInimigo.style.display = "none";
        spriteJogadorCombate.style.display = "none";
        spriteDialogo.style.display = "none";
        
        caixaDialogo.style.display = "block";
        document.getElementById("nome-personagem").innerText = "GAME OVER";
        document.getElementById("texto-dialogo").innerText = cena.texto;
        document.getElementById("opcoes").innerHTML = `<button onclick="reiniciarJogo()">Tentar Novamente</button>`;
        battleMenu.innerHTML = "";
        audioManager.vincularSonsBotoes();
    }
}

function animarAcao(isJogador, acao, tempo = 800) {
    const img = isJogador ? document.getElementById("sprite-personagem") : document.getElementById("sprite-inimigo");
    const sprites = isJogador ? nubankoConfig.spriteCombate : inimigoAtual.spriteCombate;
    if (!sprites[acao]) return; 
    
    img.src = sprites[acao];
    setTimeout(() => {
        if (hpJogador > 0 && hpAtualInimigo > 0) img.src = sprites.idle;
    }, tempo);
}

function reiniciarJogo() { hpJogador = 100; carregarCena(1); }

function atualizarDisplay() {
    document.getElementById("player-status").innerText = "HP Inimigo: " + hpAtualInimigo;
    document.getElementById("player-status-jogador").innerText = "HP Nubanko: " + hpJogador;
}

function aplicarShake(alvo, intensidade = "light") {
    const sprite = document.getElementById(alvo);
    if(sprite) { 
        const classeAnimacao = intensidade === "heavy" ? "shake-heavy" : "shake-light";
        sprite.classList.add(classeAnimacao); 
        setTimeout(() => sprite.classList.remove(classeAnimacao), 400); 
    }
}

function mostrarPopup(texto, tipo = "damage", alvo = "sprite-inimigo", offsetY = 0) {
    const sprite = document.getElementById(alvo);
    const game = document.getElementById("game-container");
    if(!sprite || !game) return;
    
    const rectSprite = sprite.getBoundingClientRect();
    const popup = document.createElement("div");
    popup.className = "battle-popup " + tipo;
    popup.innerText = texto;
    popup.style.left = (rectSprite.left + rectSprite.width/2) + "px";
    popup.style.top = (rectSprite.top + 50 + offsetY) + "px";
    game.appendChild(popup);
    setTimeout(() => popup.remove(), 900);
}

function exibirMenuPrincipal() {
    const battleMenu = document.getElementById("battle-menu");
    battleMenu.innerHTML = "";
    
    const atacar = document.createElement("button");
    atacar.innerText = "ATACAR";
    atacar.onclick = exibirMenuGolpes;
    battleMenu.appendChild(atacar);
    
    const defender = document.createElement("button");
    defender.innerText = "DEFENDER";
    defender.onclick = defenderJogador;
    battleMenu.appendChild(defender);
    audioManager.vincularSonsBotoes();
}

function exibirMenuGolpes() {
    const battleMenu = document.getElementById("battle-menu");
    battleMenu.innerHTML = "";
    golpesPersona.forEach(golpe => {
        const btn = document.createElement("button");
        btn.innerText = golpe.nome;
        btn.onclick = () => executarGolpe(golpe);
        battleMenu.appendChild(btn);
    });
    audioManager.vincularSonsBotoes();
}

function defenderJogador() {
    defendendo = true;
    animarAcao(true, 'defesa', 1500); 
    document.getElementById("nav-comentario").innerText = "Posição de defesa!";
    document.querySelectorAll("#battle-menu button").forEach(btn => btn.disabled = true);
    setTimeout(turnoInimigo, 1500);
}

function executarGolpe(golpe) {
    if(!inimigoAtual || hpAtualInimigo <= 0) return; 
    document.querySelectorAll("#battle-menu button").forEach(btn => btn.disabled = true);

    const nav = document.getElementById("nav-comentario");
    const gif = document.getElementById("gif-invocacao");
    gif.src = "img/invocacao.gif?t=" + new Date().getTime(); 
    gif.style.display = "block";
    audioManager.tocarSFX(audioManager.sfxPersona);
    
    setTimeout(() => { gif.style.display = "none"; }, 1200);

    animarAcao(true, 'ataque');
    setTimeout(() => animarAcao(false, 'dano'), 500);

    let dano = golpe.dano;
    let tipoTexto = ""; let estiloPopup = ""; let escudoBloqueou = false; let intensidadeShake = "light";

    if(golpe.tipo === inimigoAtual.fraqueza) {
        dano *= 2; tipoTexto = "WEAK"; estiloPopup = "weak"; nav.innerText = "Fraqueza explorada!";
        intensidadeShake = "heavy";
    } else if(golpe.tipo === inimigoAtual.resistencia) {
        dano = Math.floor(dano/2); tipoTexto = "RESIST"; estiloPopup = "resist"; nav.innerText = "O inimigo resistiu!";
        intensidadeShake = "none";
    } else if(Math.random() < 0.10) { 
        dano *= 2; tipoTexto = "CRITICAL!"; estiloPopup = "critical"; nav.innerText = "Golpe Crítico!";
        intensidadeShake = "heavy";
    } else {
        nav.innerText = golpe.nome + " acertou!";
    }

    if(inimigoAtual.defendendo) { 
        dano = Math.floor(dano/2); escudoBloqueou = true; nav.innerText += " (Bloqueio!)"; 
        intensidadeShake = "none"; 
    }

    setTimeout(() => {
        audioManager.tocarSFX(audioManager.sfxAtaque);
        
        if(tipoTexto !== "") mostrarPopup(tipoTexto, estiloPopup, "sprite-inimigo", -40);
        if(escudoBloqueou && tipoTexto === "") mostrarPopup("BLOCK", "miss", "sprite-inimigo", -40);
        
        mostrarPopup(String(dano), "damage", "sprite-inimigo", 30);
        if (intensidadeShake !== "none") aplicarShake("sprite-inimigo", intensidadeShake);
        
        hpAtualInimigo -= dano;
        if(hpAtualInimigo < 0) hpAtualInimigo = 0;
        atualizarDisplay();

        if(hpAtualInimigo <= 0) {
            nav.innerText = "O inimigo foi derrotado!";
            document.getElementById("battle-menu").innerHTML = ""; 
            
            setTimeout(() => {
                const proximoId = cenaAtual ? cenaAtual.proximoId : 0;
                document.getElementById("victory-screen").classList.add("active");
                document.getElementById("victory-options").innerHTML = `<button onclick="carregarCena(${proximoId})">Avançar</button>`;
            }, 1200);
            return;
        }
        setTimeout(turnoInimigo, 2200);
    }, 500);
}

function turnoInimigo() {
    if(!inimigoAtual) return;
    const nav = document.getElementById("nav-comentario");

    if(Math.random() < 0.25) {
        inimigoAtual.defendendo = true;
        animarAcao(false, 'defesa', 1500);
        nav.innerText = inimigoAtual.nome + " entrou em guarda!";
        setTimeout(exibirMenuPrincipal, 1800);
        return;
    }

    inimigoAtual.defendendo = false;
    const nomeGolpe = inimigoAtual.golpes[Math.floor(Math.random() * inimigoAtual.golpes.length)];
    const golpe = bibliotecaGolpes[nomeGolpe];

    animarAcao(false, 'ataque');
    setTimeout(() => { audioManager.tocarSFX(audioManager.sfxDano); animarAcao(true, 'dano'); }, 500);

    setTimeout(() => {
        let danoRecebido = golpe.dano;
        let shake = "light";
        
        if(defendendo) {
            danoRecebido = Math.floor(danoRecebido / 2);
            defendendo = false;
            mostrarPopup("BLOCK", "miss", "sprite-personagem", -40);
            shake = "none";
        }

        hpJogador = Math.max(hpJogador - danoRecebido, 0);
        atualizarDisplay();
        nav.innerText = inimigoAtual.nome + " " + golpe.msg;
        mostrarPopup(String(danoRecebido), "damage", "sprite-personagem", 30);
        if (shake !== "none") aplicarShake("sprite-personagem", shake);

        if(hpJogador <= 0) { 
            animarAcao(true, 'dano', 9999); 
            setTimeout(() => carregarCena(0), 1500); 
            return; 
        }
        setTimeout(exibirMenuPrincipal, 2200);
    }, 500);
}

window.onload = () => carregarCena(1);
