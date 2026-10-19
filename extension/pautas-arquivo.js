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
    if (p.codigo) topo.push(`sala: ${p.codigo}`);
    topo.push('---', '');
    return `${topo.join('\n')}\n${limpo(p.texto)}\n`;
  }

  // lê o arquivo; sem o cabeçalho, ainda dá pra aproveitar: data no nome (AAAA-MM-DD_...) e título na primeira linha "# ..."
  function parsear(nome, conteudo) {
    const bruto = String(conteudo || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    let titulo = '', data = '', hora = '', sala = '', corpo = bruto;
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
        else if (k === 'sala' || k === 'codigo' || k === 'meet' || k === 'link' || k === 'url') sala = (String(v).toLowerCase().match(/[a-z]{3}-[a-z]{4}-[a-z]{3}/) || [''])[0];
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
    return { id: idDe(titulo, data), titulo: String(titulo).trim(), data, hora, codigo: sala, texto: limpo(corpo) };
  }

  // Compara as pautas do navegador com os arquivos e diz o que fazer.
  //  pautas: {id: {titulo,data,hora,texto,criada,atualizada}}   arquivos: [{nome, mtime, conteudo}]
  //  apagadas: {id: quando}   hoje: 'AAAA-MM-DD' (só as de uma semana pra cá vão pra arquivo)
  // Regras de segurança (uma listagem ruim, de um disco que ainda não montou, nunca pode apagar pauta):
  //  - `confiavel`: a listagem tem o LEIA-ME.md (a extensão sempre grava um). Sem ele, nada é apagado, de nenhum lado.
  //  - uma pauta só sai por "o arquivo sumiu" se faltou em DUAS conversas seguidas (`ausentesAntes`) e no máximo 2 de uma vez.
  function mesclar({ pautas, arquivos, apagadas = {}, hoje, conhecidas = [], ultimoSync = 0, confiavel = true, ausentesAntes = [] }) {
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
        if (antes && confiavel) apagar.push(antes.nome); // duas cópias da mesma reunião: fica a mais nova
        porId.set(p.id, { ...p, nome: a.nome, mtime: a.mtime });
      } else if (confiavel) apagar.push(a.nome);
    }
    for (const [id, f] of porId) {
      const atual = novas[id];
      const quandoApagou = apagadas[id] || 0;
      if (quandoApagou && f.mtime <= quandoApagou) { if (confiavel) apagar.push(f.nome); continue; } // foi apagada no navegador: o arquivo sai
      if (quandoApagou) reapareceu.push(id); // o arquivo foi editado depois: a pauta volta
      const eu = atual ? limpo(atual.texto) : '';
      if (!atual) {
        if (!f.texto) continue;
        novas[id] = { titulo: f.titulo, data: f.data, hora: f.hora, texto: f.texto, codigo: f.codigo || '', criada: f.mtime, atualizada: f.mtime };
        mudou = true;
      } else if (eu !== f.texto && f.mtime > (atual.atualizada || atual.criada || 0) + 1500) {
        novas[id] = { ...atual, titulo: atual.titulo || f.titulo, hora: atual.hora || f.hora, codigo: f.codigo || atual.codigo || '', texto: f.texto, atualizada: f.mtime };
        mudou = true;
      } else if (eu !== f.texto) {
        escrever.push({ nome: f.nome, conteudo: serializar({ ...atual, texto: atual.texto }), id });
      } else if (f.codigo && f.codigo !== atual.codigo) {
        // só o código da sala mudou no arquivo: entra sem mexer na data de edição da pauta
        novas[id] = { ...atual, codigo: f.codigo };
        mudou = true;
      } else if (atual.codigo && !f.codigo) {
        escrever.push({ nome: f.nome, conteudo: serializar(atual), id }); // a pauta aprendeu a sala: o arquivo também passa a dizer
      }
    }
    // pauta que ainda não tem arquivo (e é recente): cria
    const limite = (() => { const d = new Date(`${hoje}T12:00:00`); d.setDate(d.getDate() - 7); const p2 = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; })();
    const usados = new Set([...porId.values()].map((f) => f.nome));
    // o arquivo existia na última conversa e sumiu: a pessoa (ou a IA) apagou o arquivo, então a pauta sai também.
    // Só com listagem confiável, confirmado em duas conversas seguidas e nunca em massa.
    const ausentes = confiavel ? Object.keys(novas).filter((id) => !porId.has(id) && tinham.has(id) && (novas[id].atualizada || novas[id].criada || 0) <= ultimoSync) : [];
    const confirmadas = ausentes.filter((id) => ausentesAntes.includes(id));
    if (confirmadas.length <= 2) for (const id of confirmadas) { delete novas[id]; removidas.push(id); mudou = true; }
    for (const [id, p] of Object.entries(novas)) {
      if (porId.has(id) || ausentes.includes(id) || !limpo(p.texto) || !p.data || p.data < limite) continue; // ausente: espera a confirmação, não recria na hora
      let nome = nomeDe(p);
      for (let n = 2; usados.has(nome); n++) nome = nomeDe(p).replace(/\.md$/, `-${n}.md`);
      usados.add(nome);
      escrever.push({ nome, conteudo: serializar(p), id });
    }
    if (!confiavel) escrever.length = 0; // listagem duvidosa: não grava por cima de nada (a próxima conversa, já com o LEIA-ME, grava)
    const naPasta = new Set([...porId.keys()].filter((id) => !(apagadas[id] && porId.get(id).mtime <= apagadas[id])));
    escrever.forEach((e) => { if (e.id) naPasta.add(e.id); });
    const conhecidasFim = new Set([...naPasta].filter((id) => novas[id]));
    ausentes.forEach((id) => { if (novas[id]) conhecidasFim.add(id); }); // continua "conhecida" até a remoção ser confirmada
    return { pautas: mudou ? novas : null, escrever, apagar: [...new Set(apagar)], reapareceu, removidas, ausentes: ausentes.filter((id) => novas[id]), conhecidas: [...conhecidasFim] };
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
sala: abc-defg-hij
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
