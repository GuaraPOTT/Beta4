// ======================================================
// NUBANKO CHRONICLES - MENU PRINCIPAL
// ======================================================

const intro = document.getElementById("intro");
const video = document.getElementById("intro-video");
const musicaMenu = document.getElementById("menu-music");

const botoes = [...document.querySelectorAll(".menu-button")];

let selecionado = 0;

// ======================================================
// INTRO
// ======================================================

video.onended = () => {

    intro.style.transition = "opacity .8s";
    intro.style.opacity = "0";

    iniciarMusica();

    setTimeout(() => {
        intro.remove();
        animarEntrada();
    }, 800);

};

// ======================================================
// MÚSICA
// ======================================================

function iniciarMusica() {

    musicaMenu.volume = 0.5;

    musicaMenu.play().catch(() => {

        console.log("Autoplay bloqueado. Esperando interação do usuário...");

        document.addEventListener("click", tocarDepois, {
            once: true
        });

        document.addEventListener("keydown", tocarDepois, {
            once: true
        });

    });

}

function tocarDepois() {

    console.log("Clique detectado!");

    musicaMenu.play()
        .then(() => {
            console.log("Música iniciada!");
        })
        .catch(err => {
            console.error(err);
        });

}

// ======================================================
// LOAD
// ======================================================

window.addEventListener("load", () => {

    atualizarSelecao();

});

// ======================================================
// ANIMAÇÃO DO MENU
// ======================================================

function animarEntrada() {

    botoes.forEach((botao, i) => {

        botao.style.opacity = "0";
        botao.style.transform = "translateX(-120px) skew(-18deg)";

        setTimeout(() => {

            botao.style.transition =
                "all .45s cubic-bezier(.2,.8,.2,1)";

            botao.style.opacity = "1";
            botao.style.transform = "skew(-18deg)";

        }, i * 90);

    });

}

// ======================================================
// SELEÇÃO
// ======================================================

function atualizarSelecao() {

    botoes.forEach((b, i) => {

        b.classList.remove("selected");

        if (i === selecionado) {

            b.classList.add("selected");

        }

    });

}

// ======================================================
// NAVEGAÇÃO PELO TECLADO
// ======================================================

window.addEventListener("keydown", (e) => {

    switch (e.key) {

        case "ArrowDown":

            selecionado = (selecionado + 1) % botoes.length;
            atualizarSelecao();

            break;

        case "ArrowUp":

            selecionado =
                (selecionado - 1 + botoes.length) % botoes.length;

            atualizarSelecao();

            break;

        case "Enter":

            executarOpcao();

            break;

    }

});

// ======================================================
// CLIQUE / HOVER
// ======================================================

botoes.forEach((botao, i) => {

    botao.addEventListener("mouseenter", () => {

        selecionado = i;
        atualizarSelecao();

    });

    botao.addEventListener("click", () => {

        selecionado = i;
        atualizarSelecao();
        executarOpcao();

    });

});

// ======================================================
// EXECUTAR OPÇÃO
// ======================================================

function executarOpcao() {

    const texto = botoes[selecionado].innerText.trim();

    switch (texto) {

        case "JOGAR":

            transicao(() => {

                window.location.href = "game.html";

            });

            break;

        case "CRÉDITOS":

            window.location.href = "creditos.html";

            break;

        case "SAIR":

            window.location.href = "https://google.com";

            break;

        default:

            alert(texto + " ainda não implementado.");

    }

}

// ======================================================
// TRANSIÇÃO
// ======================================================

function transicao(callback) {

    const pecas =
        [...document.querySelectorAll(".transition-piece")];

    pecas.forEach((p, i) => {

        setTimeout(() => {

            p.style.transition = "transform .45s ease";
            p.style.transform =
                "translateX(0) rotate(-10deg)";

        }, i * 60);

    });

    setTimeout(callback, 700);

}

// ======================================================
// PARALAXE
// ======================================================

const personagem = document.getElementById("character");
const fundo = document.getElementById("background");

window.addEventListener("mousemove", (e) => {

    const x = (e.clientX / window.innerWidth) - 0.5;
    const y = (e.clientY / window.innerHeight) - 0.5;

    personagem.style.transform =
        `translate(${x * 25}px, ${y * 18}px)`;

    fundo.style.transform =
        `translate(${x * 12}px, ${y * 8}px) scale(1.03)`;

});

// ======================================================
// ANIMAÇÃO DO LOGO
// ======================================================

const logo = document.querySelector("#logo h1");

window.addEventListener("load", () => {

    logo.animate(
        [
            {
                transform: "translateY(-60px)",
                opacity: 0
            },
            {
                transform: "translateY(0)",
                opacity: 1
            }
        ],
        {
            duration: 700,
            easing: "ease-out"
        }
    );

});
