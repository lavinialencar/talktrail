// Gera o arquivo .md de uma reunião. É o espelho do render() do servidor (server/talktrail_server.py):
// o teste test/md.js roda os dois sobre as mesmas entradas e exige texto idêntico.
// Usado pelo modo simples (sem servidor): a biblioteca da extensão e o salvamento em Downloads.
(function (raiz) {
  const INVISIVEL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u2028\u2029\u202a-\u202e\u2066-\u2069\u200b\u2060\ufeff]/g;
  const CONTROLE = /[\x00\x01-\x08\x0b\x0c\x0e-\x1f\x7f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g;
  const MAX_TEXTO = 500000;
  const MAX_FALA = 100000;
  const MAX_LINHAS = 50000;

  const cp = (s) => Array.from(s);
  const cortar = (s, n) => (cp(s).length > n ? cp(s).slice(0, n).join('') : s);

  // Qualquer coisa vira texto seguro: sem controle, sem substituto solto, no máximo n letras.
  function texto(v, n) {
    if (v === null || v === undefined || typeof v === 'boolean' || typeof v === 'object') return '';
    let s = typeof v === 'string' ? v : String(v);
    if (s.toWellFormed) s = s.toWellFormed();
    s = s.normalize('NFC');
    s = n === undefined ? s.replace(CONTROLE, '') : s.replace(INVISIVEL, '');
    return n === undefined ? s : cortar(s, n);
  }

  function linhaUnica(v, n = 200) {
    return cortar(texto(v, n * 4).replace(/\s+/g, ' ').trim(), n);
  }

  function numero(v, maximo = 10 * 24 * 3600) {
    const x = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
    return Number.isFinite(x) && x >= 0 ? Math.min(x, maximo) : 0;
  }

  const mmss = (seg) => {
    const s = Math.floor(numero(seg));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  function parseIso(s) {
    if (typeof s !== 'string') throw new Error('data inválida');
    const d = new Date(s.trim());
    if (Number.isNaN(d.getTime())) throw new Error('data inválida');
    if (d.getFullYear() < 2000 || d.getFullYear() > 2100) throw new Error('data fora do intervalo');
    return d;
  }

  function semAcento(s) {
    return String(s || '').normalize('NFKD').replace(/\p{Mn}/gu, '').toLowerCase();
  }

  const bytes = (s) => new TextEncoder().encode(s).length;

  // Nome de arquivo: letras e números de qualquer alfabeto, nunca passa de maxBytes.
  function slug(s, maxBytes = 100) {
    let r = semAcento(linhaUnica(s, 200)).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
    while (bytes(r) > maxBytes) r = cp(r).slice(0, -1).join('');
    return r.replace(/^-+|-+$/g, '') || 'reuniao';
  }

  // Frase longa em blocos de até ~limite letras, nas fronteiras de frase.
  function quebrar(conteudo, limite = 300) {
    const frases = String(conteudo || '').trim().split(/(?<=[.!?])\s+/);
    const blocos = [];
    let atual = '';
    for (const f of frases) {
      if (atual && atual.length + 1 + f.length > limite) {
        blocos.push(atual);
        atual = f;
      } else {
        atual = `${atual} ${f}`.trim();
      }
    }
    if (atual) blocos.push(atual);
    return blocos.length ? blocos : [''];
  }

  // Notas e Pauta viram markdown arrumado: cada linha é um item, título digitado desce pra nível 4,
  // o recuo da hierarquia fica, e cerca de código aberta é fechada.
  function comoLista(txt) {
    const saida = [];
    let cercas = 0;
    for (const linha of String(txt || '').trim().split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/)) {
      const s = linha.trim();
      if (s === '-' || s === '*' || s === '+' || /^[-*+]\s\[[ xX]\]$/.test(s)) continue;
      if (!s) {
        saida.push('');
        continue;
      }
      if (s.startsWith('```') || s.startsWith('~~~')) cercas += 1;
      const recuo = linha.slice(0, linha.length - linha.trimStart().length).replace(/\t/g, '  ');
      const h = /^#{1,6}\s+(.*)/.exec(s);
      if (h) saida.push('#### ' + h[1]);
      else if (/^([-*+]|\d+[.)])\s/.test(s) || s.startsWith('>')) saida.push(recuo + s);
      else saida.push(recuo + '- ' + s);
    }
    if (cercas % 2) saida.push('```');
    return saida.join('\n');
  }

  // Fala que começaria com marcação de markdown ganha uma barra, pra não virar título ou lista.
  function escaparEstrutura(parte) {
    return /^\s*(#|>|[-*+]\s|\d+[.)]\s|```|~~~|---|===|\||<)/.test(parte) ? '\\' + parte : parte;
  }

  function tagsLimpas(brutas) {
    if (!Array.isArray(brutas)) return [];
    const saida = [];
    for (const bruta of brutas.slice(0, 200)) {
      for (const parte of linhaUnica(bruta, 200).split(/[,;]/)) {
        const tag = cortar(parte.replace(/^[\s,;.#]+|[\s,;]+$/g, ''), 60);
        if (tag && !saida.includes(tag)) saida.push(tag);
      }
    }
    return saida.slice(0, 20);
  }

  const comparar = (a, b) => {
    const x = cp(a), y = cp(b);
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
      const d = x[i].codePointAt(0) - y[i].codePointAt(0);
      if (d) return d;
    }
    return x.length - y.length;
  };

  // arredonda meio pra par, igual ao round() do Python, pra os dois lados darem o mesmo número
  const arredondar = (x) => {
    const f = Math.floor(x), d = x - f;
    return d < 0.5 ? f : d > 0.5 ? f + 1 : f % 2 === 0 ? f : f + 1;
  };

  const dois = (n) => String(n).padStart(2, '0');

  function render(p) {
    const ini = parseIso(p.startedAt);
    let dur = '';
    try {
      if (p.endedAt) dur = Math.max(0, arredondar((parseIso(p.endedAt) - ini) / 1000 / 60));
    } catch (e) {
      dur = '';
    }
    const linhas = [];
    for (const l of (Array.isArray(p.transcript) ? p.transcript : []).slice(0, MAX_LINHAS)) {
      if (!l || typeof l !== 'object' || Array.isArray(l)) continue;
      const nome = linhaUnica(l.speaker, 80).replace(/[*_`\[\]<>]/g, '') || '?';
      linhas.push({ t: numero(l.t), speaker: nome, text: texto(l.text, MAX_FALA) });
    }
    const nomes = [...new Set(linhas.map((l) => l.speaker).filter((n) => n !== '?' && n !== 'Talktrail'))].sort(comparar).slice(0, 50);
    const titulo = linhaUnica(p.titulo, 200) || 'Reunião sem título';
    const tags = tagsLimpas(p.tags);
    const projeto = linhaUnica(p.projeto, 60) || tags[0] || '';
    const q = (v) => (Array.isArray(v) ? '[' + v.map((x) => JSON.stringify(x)).join(', ') + ']' : JSON.stringify(v)); // mesmo espaçamento do Python
    const sessao = texto(p.id, 80).replace(/[^A-Za-z0-9_.:-]/g, '');
    const corte = '\n\n_(texto cortado: passou de 500 mil caracteres)_';
    let notas = texto(p.notes, MAX_TEXTO + 1);
    let pauta = texto(p.cola, MAX_TEXTO + 1);
    notas = cp(notas).length > MAX_TEXTO ? cortar(notas, MAX_TEXTO) + corte : notas;
    pauta = cp(pauta).length > MAX_TEXTO ? cortar(pauta, MAX_TEXTO) + corte : pauta;
    const fm = [
      '---',
      'tipo: reuniao',
      `sessao: ${q(sessao)}`,
      `titulo: ${q(titulo)}`,
      `projeto: ${q(projeto)}`,
      `tags: ${q(tags)}`,
      `data: ${ini.getFullYear()}-${dois(ini.getMonth() + 1)}-${dois(ini.getDate())}`,
      `inicio: ${dois(ini.getHours())}:${dois(ini.getMinutes())}`,
      `duracao_min: ${dur}`,
      'fonte: legendas-do-meet',
      `participantes: ${q(nomes)}`,
      `url: ${q(linhaUnica(p.url, 300))}`,
      'status: cru',
      'notion: ""',
      '---',
      '',
      `# ${titulo}`,
      '',
      '## Resumo',
      '',
      '_(resumo, a preencher depois da reunião)_',
      '',
      '## Pauta',
      '',
      comoLista(pauta) || '_(vazia)_',
      '',
      '## Notas',
      '',
      comoLista(notas) || '_(sem notas)_',
      '',
      '## Momentos marcados',
      '',
    ];
    const marcas = (Array.isArray(p.marcas) ? p.marcas : []).slice(0, 500).filter((m) => m && typeof m === 'object' && !Array.isArray(m));
    if (marcas.length) {
      for (const m of marcas) fm.push(`- [${mmss(m.t)}] ${escaparEstrutura(linhaUnica(m.texto, 400)) || '(sem fala neste momento)'}`);
    } else {
      fm.push('_(nenhum)_');
    }
    const chat = [];
    for (const m of (Array.isArray(p.chat) ? p.chat : []).slice(0, 2000)) {
      if (m && typeof m === 'object' && !Array.isArray(m) && linhaUnica(m.text, 2000)) {
        const quem = linhaUnica(m.speaker, 80).replace(/[*_`\[\]<>]/g, '') || 'Chat';
        chat.push(`- [${mmss(m.t)}] ${quem}: ${escaparEstrutura(linhaUnica(m.text, 2000))}`);
      }
    }
    if (chat.length) fm.push('', '## Chat da reunião', '', ...chat);
    const estrutura = linhaUnica(p.chatEstrutura, 1400).replace(/-->/g, '').replace(/--/g, '-');
    if (chat.length && estrutura) fm.push('', `<!-- estrutura do chat (sem texto): ${estrutura} -->`);
    fm.push('', '## Transcrição', '');
    for (const l of linhas) {
      const partes = quebrar(l.text);
      fm.push(`**[${mmss(l.t)}] ${l.speaker}:** ${partes[0]}`);
      for (const x of partes.slice(1)) fm.push(escaparEstrutura(x));
      fm.push('');
    }
    if (!linhas.length) fm.push('_(vazia)_');
    return { ini, texto: fm.join('\n') + '\n' };
  }

  const pasta = (p) => {
    const d = parseIso(p.startedAt);
    return `${d.getFullYear()}-${dois(d.getMonth() + 1)}`;
  };
  const nomeArquivo = (p) => {
    const d = parseIso(p.startedAt);
    return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}_${dois(d.getHours())}h${dois(d.getMinutes())}_${slug(p.titulo || 'reuniao')}.md`;
  };

  // Reunião sem nada: nem fala, nem marcador, nem nota, nem pauta, nem chat de verdade (o aviso da extensão não conta).
  const AVISOS_CHAT = ['estou transcrevendo esta reuni', 'i am transcribing this meeting']; // o texto padrão do aviso, em português e em inglês
  function vazia(p) {
    const lista = (v) => (Array.isArray(v) ? v : []).filter((x) => x && typeof x === 'object' && !Array.isArray(x));
    const falas = lista(p.transcript).filter((l) => l.speaker !== 'Talktrail' && linhaUnica(l.text, 20));
    const chat = lista(p.chat).filter((m) => linhaUnica(m.text, 2000) && !AVISOS_CHAT.some((a) => linhaUnica(m.text, 200).toLowerCase().startsWith(a)));
    return !(falas.length || lista(p.marcas).length || chat.length || texto(p.notes, MAX_TEXTO).trim() || texto(p.cola, MAX_TEXTO).trim());
  }

  const api = { render, vazia, slug, comoLista, quebrar, tagsLimpas, linhaUnica, texto, mmss, pasta, nomeArquivo, parseIso };
  if (typeof module !== 'undefined') module.exports = api;
  raiz.MB_MD = api;
})(typeof self !== 'undefined' ? self : globalThis);
