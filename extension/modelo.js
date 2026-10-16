// Modelo da pauta nova: número da pauta e, embaixo, os combinados como tarefas.
// A pauta só vira "pronta" depois que a pessoa escreve de verdade.
(function (raiz) {
  const TEXTO = '1. \n2. \n3. \n\nCombinados\n- [ ] ';
  // só o modelo, sem nada escrito, não conta como pauta
  const vazia = (t) => !String(t || '').replace(/^\s*(\d+\.|[-*]\s*\[\s*\])\s*$/gm, '').replace(/combinados/i, '').trim();
  raiz.MB_MODELO = { TEXTO, vazia };
})(typeof self !== 'undefined' ? self : globalThis);
