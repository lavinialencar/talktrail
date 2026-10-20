// Modelo da pauta nova: número da pauta e, embaixo, os combinados como tarefas.
// A pauta só vira "pronta" depois que a pessoa escreve de verdade.
(function (raiz) {
  const T = typeof raiz.trad === 'function' ? raiz.trad : (x) => x; // sem i18n.js carregado (testes isolados), fica em português
  const TEXTO = '1. \n2. \n3. \n\n' + T('Combinados') + '\n- [ ] ';
  // só o modelo, sem nada escrito, não conta como pauta
  const vazia = (t) => !String(t || '').replace(/^\s*(\d+\.|[-*]\s*\[\s*\])\s*$/gm, '').replace(/combinados|agreements/i, '').trim();
  raiz.MB_MODELO = { TEXTO, vazia };
})(typeof self !== 'undefined' ? self : globalThis);
