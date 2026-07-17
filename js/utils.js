// ==========================================================
// utils.js — Funções utilitárias puras, sem estado e sem
// dependência de nenhum outro módulo do jogo.
// ==========================================================

/** Promise que resolve após `ms` milissegundos. Base de toda a coreografia assíncrona do jogo. */
export function aguardar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/** Restringe um valor numérico entre min e max. */
export function clamp(valor, min, max) {
    return Math.max(min, Math.min(max, valor));
}

/** Retorna um elemento aleatório de um array (não modifica o array original). */
export function escolherAleatorio(lista) {
    if (!lista || lista.length === 0) return undefined;
    return lista[Math.floor(Math.random() * lista.length)];
}

/**
 * Pré-carrega uma lista de imagens no cache do navegador.
 * Nunca rejeita: uma imagem ausente apenas conta como "concluída" (é registrada
 * no console), para que um asset faltando não trave a tela de carregamento.
 * @param {string[]} urls
 * @param {(carregadas:number, total:number)=>void} [onProgress]
 */
export function precarregarImagens(urls, onProgress) {
    const total = urls.length;
    if (total === 0) return Promise.resolve();
    let carregadas = 0;
    return Promise.all(urls.map(url => new Promise(resolve => {
        const img = new Image();
        const finalizar = (erro) => {
            carregadas++;
            if (erro) console.warn(`[precarregarImagens] Falha ao carregar "${url}" (arquivo ausente?)`);
            if (onProgress) onProgress(carregadas, total);
            resolve();
        };
        img.onload = () => finalizar(false);
        img.onerror = () => finalizar(true);
        img.src = url;
    })));
}
