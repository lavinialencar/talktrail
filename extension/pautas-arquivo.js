// Pautas em arquivo: um .md por reunião na pasta Pautas/ (dentro da pasta de reuniões), pra uma IA ou a própria pessoa
// editar direto no computador. A extensão guarda as pautas no navegador e mantém os dois lados iguais:
// o arquivo mais novo ganha. Aqui só tem lógica pura (sem rede, sem pasta): nome, formato e a mescla.
(function (raiz) {
  const normT = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const idDe = (titulo, data) => `${data}|${normT(titulo)}`;
  const slug = (t) => normT(t).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'reuniao';
  const nomeDe = (p) => `${p.data}${/^\d{1,2}:\d{2}$/.test(p.hora || '') ? '_' + p.hora.replace(':', 'h').padStart(5, '0') : ''}_${slug(p.titulo)}.md`;
  const limpo = (t) => String(t || '').replace(/\r\n?/g, '\n').trim();

  function serializar(p) {
    const topo = ['---', `titulo: ${JSON.stringify(String(p.titulo || ''))}`, `data: ${p.data}`];
    if (p.hora) topo.push(`hora: ${p.hora}`);
    topo.push('---', '');
    return `${topo.join('\n')}\n${limpo(p.texto)}\n`;
  }

  // lê o arquivo; sem o cabeçalho, ainda dá pra aproveitar: data no nome (AAAA-MM-DD_...) e título na primeira linha "# ..."
  function parsear(nome, conteudo) {
    const bruto = String(conteudo || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    let titulo = '', data = '', hora = '', corpo = bruto;
    const m = bruto.match(/^---\n([\s\S]*?)\n---\n?/);
    if (m) {
      corpo = bruto.slice(m[0].length);
      for (const linha of m[1].split('\n')) {
        const kv = linha.match(/^\s*([a-zA-Z]+)\s*:\s*(.*?)\s*$/);
        if (!kv) continue;
        let v = kv[2];
        if (/^".*"$/.test(v)) { try { v = JSON.parse(v); } catch { v = v.slice(1, -1); } } else if (/^'.*'$/.test(v)) v = v.slice(1, -1);
        const k = kv[1].toLowerCase();
        if (k === 'titulo' || k === 'title') titulo = v;
        else if (k === 'data' || k === 'date') data = v;
        else if (k === 'hora' || k === 'time') hora = v;
      }
    }
    const dn = String(nome || '').match(/^(\d{4}-\d{2}-\d{2})(?:_(\d{2})h(\d{2}))?_(.+)\.md$/);
    if (!data && dn) data = dn[1];
    if (!hora && dn && dn[2]) hora = `${dn[2]}:${dn[3]}`;
    if (!titulo) {
      const h1 = corpo.match(/^\s*#\s+([^\n]+)/);
      if (h1) { titulo = h1[1].trim(); corpo = corpo.slice(h1[0].length); } else if (dn) titulo = dn[4].replace(/-+/g, ' ');
    }
    data = (String(data).match(/\d{4}-\d{2}-\d{2}/) || [''])[0];
    const h = String(hora).match(/^(\d{1,2}):(\d{2})/);
    hora = h ? `${h[1].padStart(2, '0')}:${h[2]}` : '';
    if (!titulo || !data) return null;
    return { id: idDe(titulo, data), titulo: String(titulo).trim(), data, hora, texto: limpo(corpo) };
  }

  // Compara as pautas do navegador com os arquivos e diz o que fazer.
  //  pautas: {id: {titulo,data,hora,texto,criada,atualizada}}   arquivos: [{nome, mtime, conteudo}]
  //  apagadas: {id: quando}   hoje: 'AAAA-MM-DD' (só as de uma semana pra cá vão pra arquivo)
  function mesclar({ pautas, arquivos, apagadas = {}, hoje, conhecidas = [], ultimoSync = 0 }) {
    const novas = { ...(pautas || {}) };
    let mudou = false;
    const escrever = [], apagar = [], reapareceu = [], removidas = [];
    const tinham = new Set(conhecidas);
    const porId = new Map();
    for (const a of arquivos || []) {
      const p = parsear(a.nome, a.conteudo);
      if (!p) continue; // LEIA-ME e qualquer arquivo sem título e dia
      const antes = porId.get(p.id);
      if (!antes || a.mtime > antes.mtime) {
        if (antes) apagar.push(antes.nome); // duas cópias da mesma reunião: fica a mais nova
        porId.set(p.id, { ...p, nome: a.nome, mtime: a.mtime });
      } else apagar.push(a.nome);
    }
    for (const [id, f] of porId) {
      const atual = novas[id];
      const quandoApagou = apagadas[id] || 0;
      if (quandoApagou && f.mtime <= quandoApagou) { apagar.push(f.nome); continue; } // foi apagada no navegador: o arquivo sai
      if (quandoApagou) reapareceu.push(id); // o arquivo foi editado depois: a pauta volta
      const eu = atual ? limpo(atual.texto) : '';
      if (!atual) {
        if (!f.texto) continue;
        novas[id] = { titulo: f.titulo, data: f.data, hora: f.hora, texto: f.texto, codigo: '', criada: f.mtime, atualizada: f.mtime };
        mudou = true;
      } else if (eu !== f.texto && f.mtime > (atual.atualizada || atual.criada || 0) + 1500) {
        novas[id] = { ...atual, titulo: atual.titulo || f.titulo, hora: atual.hora || f.hora, texto: f.texto, atualizada: f.mtime };
        mudou = true;
      } else if (eu !== f.texto) {
        escrever.push({ nome: f.nome, conteudo: serializar({ ...atual, texto: atual.texto }), id });
      }
    }
    // pauta que ainda não tem arquivo (e é recente): cria
    const limite = (() => { const d = new Date(`${hoje}T12:00:00`); d.setDate(d.getDate() - 7); const p2 = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; })();
    const usados = new Set([...porId.values()].map((f) => f.nome));
    for (const id of Object.keys(novas)) {
      // o arquivo existia na última conversa e sumiu: a pessoa (ou a IA) apagou o arquivo, então a pauta sai também
      if (!porId.has(id) && tinham.has(id) && (novas[id].atualizada || novas[id].criada || 0) <= ultimoSync) { delete novas[id]; removidas.push(id); mudou = true; }
    }
    for (const [id, p] of Object.entries(novas)) {
      if (porId.has(id) || !limpo(p.texto) || !p.data || p.data < limite) continue;
      let nome = nomeDe(p);
      for (let n = 2; usados.has(nome); n++) nome = nomeDe(p).replace(/\.md$/, `-${n}.md`);
      usados.add(nome);
      escrever.push({ nome, conteudo: serializar(p), id });
    }
    const naPasta = new Set([...porId.keys()].filter((id) => !(apagadas[id] && porId.get(id).mtime <= apagadas[id])));
    escrever.forEach((e) => { if (e.id) naPasta.add(e.id); });
    return { pautas: mudou ? novas : null, escrever, apagar: [...new Set(apagar)], reapareceu, removidas, conhecidas: [...naPasta].filter((id) => novas[id]) };
  }

  const LEIA_ME = `# Pautas do Talktrail

Cada reunião tem um arquivo \`.md\` nesta pasta. Pode editar à mão ou pedir pra uma IA: o Talktrail lê os arquivos
sozinho (a cada minuto, com o navegador aberto) e a pauta aparece no painel e na página de Pautas. Quem editou por último ganha.

## Formato

\`\`\`
---
titulo: "Daily de produto"
data: 2026-10-20
hora: 10:00
---

1. Primeiro ponto
2. Segundo ponto

Combinados
- [ ] Uma tarefa
\`\`\`

- \`titulo\` e \`data\` (AAAA-MM-DD) são obrigatórios. \`hora\` (HH:MM) é opcional.
- Use o MESMO título da reunião na agenda do Meet: é por título e dia que a pauta é ligada à reunião e carrega sozinha na sala.
- Nome do arquivo: \`AAAA-MM-DD_HHhMM_titulo.md\` (só uma sugestão: vale o que está dentro do arquivo).
- Pra criar uma pauta nova, basta criar o arquivo. Pra apagar, apague o arquivo.
- O texto depois do cabeçalho é Markdown simples: listas, listas numeradas e tarefas \`- [ ]\`.
`;

  raiz.MB_PAUTAS_ARQ = { normT, idDe, slug, nomeDe, serializar, parsear, mesclar, LEIA_ME };
})(typeof self !== 'undefined' ? self : globalThis);
