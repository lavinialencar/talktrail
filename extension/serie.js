// Reunião que se repete: acha a pauta da última vez e oferece como ponto de partida; e o modelo de pauta nova.
(function (raiz) {
  // número da pauta e, embaixo, os combinados como tarefas (a pauta só vira "pronta" depois que a pessoa escreve)
  const MODELO = '1. \n2. \n3. \n\nCombinados\n- [ ] ';

  // "Daily 16/10", "Daily (seg)" e "daily" são a mesma série: sem acento, sem números e datas, sem pontuação
  function chave(titulo) {
    return String(titulo || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\b\d{1,4}([/.\-:]\d{1,4})*\b/g, ' ').replace(/#\d*/g, ' ').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // pauta mais recente, antes de `data`, de uma reunião com o mesmo nome e com texto escrito
  function anterior(linhas, titulo, data, idAtual) {
    const k = chave(titulo);
    if (!k) return null;
    return (linhas || [])
      .filter((l) => l && l.id !== idAtual && l.data < data && l.texto && l.texto.trim() && chave(l.titulo) === k)
      .sort((a, b) => (b.data + (b.hora || '')).localeCompare(a.data + (a.hora || '')))[0] || null;
  }

  // o que já foi feito (tarefa marcada) não volta; o resto vem como estava
  function copiar(texto) {
    return String(texto || '').split('\n').filter((l) => !/^\s*[-*]\s*\[[xX]\]/.test(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // Combinados vazio no fim não conta como pauta escrita
  const vazia = (t) => !String(t || '').replace(/^\s*(\d+\.|[-*]\s*\[\s*\])\s*$/gm, '').replace(/combinados/i, '').trim();

  raiz.MB_SERIE = { MODELO, chave, anterior, copiar, vazia };
})(typeof self !== 'undefined' ? self : globalThis);
