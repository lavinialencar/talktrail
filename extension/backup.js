// Cópia de segurança: reuniões da biblioteca, pautas, tags e ajustes num arquivo .json que a pessoa guarda onde quiser.
// Nunca entram a chave de pareamento nem a agenda lida do Meet. Importar junta com o que já existe (não apaga nem troca ajustes).
(function (raiz) {
  const FIXAS = ['pautas', 'tagsSalvas', 'tagCores', 'projetos', 'ajustes'];
  const permitida = (k) => FIXAS.includes(k) || /^reuniao:/.test(k) || /^cola:/.test(k);

  function exportar(tudo, agora = new Date()) {
    const dados = {};
    for (const [k, v] of Object.entries(tudo || {})) if (permitida(k) && v !== undefined) dados[k] = v;
    const dois = (n) => String(n).padStart(2, '0');
    return {
      nome: `talktrail-copia-${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}.json`,
      texto: JSON.stringify({ talktrail: 1, exportadoEm: agora.toISOString(), dados }, null, 1),
    };
  }

  function ler(texto) {
    let o;
    try { o = JSON.parse(texto); } catch { return { erro: 'Esse arquivo não é uma cópia do Talktrail.' }; }
    if (!o || o.talktrail !== 1 || !o.dados || typeof o.dados !== 'object' || Array.isArray(o.dados)) return { erro: 'Esse arquivo não é uma cópia do Talktrail.' };
    return { dados: o.dados };
  }

  const quando = (p) => Number((p && (p.atualizada || p.criada)) || 0);

  // devolve só o que precisa ser gravado e quantos itens são novos
  function mesclar(atual, arquivo) {
    atual = atual || {};
    const grava = {};
    const n = { reunioes: 0, pautas: 0, tags: 0 };
    for (const [k, v] of Object.entries(arquivo || {})) {
      if (!permitida(k) || v == null) continue;
      if (/^reuniao:/.test(k)) {
        if (!(k in atual) && v && v.payload) { grava[k] = v; n.reunioes++; }
      } else if (k === 'pautas') {
        if (typeof v !== 'object' || Array.isArray(v)) continue;
        const juntas = { ...(atual.pautas || {}) };
        let mudou = false;
        for (const [id, p] of Object.entries(v)) {
          if (!p || typeof p !== 'object') continue;
          if (!juntas[id] || quando(p) > quando(juntas[id])) { if (!juntas[id]) n.pautas++; juntas[id] = p; mudou = true; }
        }
        if (mudou) grava.pautas = juntas;
      } else if (k === 'tagsSalvas' || k === 'projetos') {
        if (!Array.isArray(v)) continue;
        const base = Array.isArray(atual[k]) ? atual[k] : [];
        const novas = v.filter((t) => typeof t === 'string' && t && !base.includes(t));
        if (novas.length) { grava[k] = [...base, ...novas]; n.tags += novas.length; }
      } else if (k === 'tagCores') {
        if (typeof v !== 'object' || Array.isArray(v)) continue;
        const juntas = { ...v, ...(atual.tagCores || {}) };
        if (Object.keys(juntas).length !== Object.keys(atual.tagCores || {}).length) grava.tagCores = juntas;
      } else if (k === 'ajustes') {
        if (!(k in atual) && typeof v === 'object') grava.ajustes = v;
      } else if (/^cola:/.test(k)) {
        if (!(k in atual) && typeof v === 'string') grava[k] = v;
      }
    }
    return { grava, n };
  }

  function resumo(n) {
    const partes = [];
    if (n.reunioes) partes.push(`${n.reunioes} ${n.reunioes === 1 ? 'reunião' : 'reuniões'}`);
    if (n.pautas) partes.push(`${n.pautas} ${n.pautas === 1 ? 'pauta' : 'pautas'}`);
    if (n.tags) partes.push(`${n.tags} ${n.tags === 1 ? 'tag' : 'tags'}`);
    return partes.length ? `Importado: ${partes.join(', ')}.` : 'Nada novo: tudo o que está no arquivo já existe aqui.';
  }

  raiz.MB_BACKUP = { exportar, ler, mesclar, resumo };
})(typeof self !== 'undefined' ? self : globalThis);
