// Interface em inglês: todo texto passado por trad() tem tradução, e o HTML das páginas, depois de traduzido,
// não deixa português pra trás. Também confere que o inglês não muda o português.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');
const raiz = path.join(__dirname, '..', 'extension');
const ler = (a) => fs.readFileSync(path.join(raiz, a), 'utf8');
let falhas = 0;
const t = (nome, ok, extra) => { if (!ok) { falhas++; console.log('FALHOU:', nome, extra || ''); } else console.log('ok:', nome); };

// dicionário e módulo de idioma carregados do jeito que a página carrega
function carregar(idioma, html) {
  const dom = new JSDOM(html || '<!doctype html><title>x</title><body></body>', { runScripts: 'outside-only' });
  const w = dom.window;
  w.__IDIOMA = idioma;
  w.eval(ler('i18n-en.js'));
  w.eval(ler('i18n.js'));
  return w;
}
const D = (() => { const w = carregar('en-US'); return w.MB_EN; })();

// 1. todo trad('literal') do código existe no dicionário
const unesc = (s) => s.replace(/\\(n|t|'|"|\\)/g, (m, c) => ({ n: '\n', t: '\t', "'": "'", '"': '"', '\\': '\\' }[c]));
const faltando = [];
for (const arq of ['panel.js', 'content.js', 'background.js', 'pautas.js', 'biblioteca.js', 'boas-vindas.js', 'backup.js', 'modelo.js']) {
  const src = ler(arq);
  const re = /\btrad\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)")/g;
  for (let m; (m = re.exec(src)); ) {
    const chave = unesc(m[1] != null ? m[1] : m[2]);
    if (!(chave in D) && !/^(Talktrail|\+ Tag|Chat|Cmd|ok|texto em português|\{0\} tags?)$/.test(chave)) faltando.push(`${arq}: ${chave.slice(0, 70)}`);
  }
}
t('todo trad() do código tem tradução em inglês', faltando.length === 0, '\n  ' + faltando.join('\n  '));

// 2. o HTML traduzido não deixa português pra trás
const PT = /[ãõçáéíóúâêô]|\b(reuni[ãa]o|reuni[õo]es|pauta|pautas|ajustes|painel|legendas|pasta|biblioteca|clique|toque|escolha|nunca|sempre|transcrever|transcri[çc][ãa]o)\b/i;
for (const arq of ['panel.html', 'pautas.html', 'biblioteca.html', 'boas-vindas.html']) {
  const html = ler(arq).replace(/<script[\s\S]*?<\/script>/g, '');
  const w = carregar('en-US', html);
  w.MB_IDIOMA.aplicar();
  const doc = w.document;
  const sobras = [];
  const walker = doc.createTreeWalker(doc.body, 4);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const x = n.nodeValue.replace(/\s+/g, ' ').trim();
    if (x && PT.test(x) && n.parentNode.nodeName !== 'STYLE') sobras.push(x.slice(0, 70));
  }
  for (const el of doc.querySelectorAll('[title],[placeholder],[aria-label],[alt]')) {
    for (const a of ['title', 'placeholder', 'aria-label', 'alt']) { const v = el.getAttribute(a); if (v && PT.test(v)) sobras.push(`${a}=${v.slice(0, 60)}`); }
  }
  if (PT.test(doc.title)) sobras.push('title=' + doc.title);
  t(`${arq} em inglês não tem português`, sobras.length === 0, '\n  ' + sobras.join('\n  '));
  t(`${arq} em inglês marca lang=en`, doc.documentElement.lang === 'en');
}

// 3. em português nada muda
const wpt = carregar('pt-BR');
t('em português, trad() devolve o texto original', wpt.trad('Reunião salva') === 'Reunião salva' && wpt.trad('Salvo às {0}', ['10:00']) === 'Salvo às 10:00');
t('em inglês, trad() traduz e troca os valores', carregar('en-US').trad('Salvo às {0}', ['10:00']) === 'Saved at 10:00');
t('idioma desconhecido cai no inglês, pt-PT fica em português', carregar('de').MB_IDIOMA.en === true && carregar('pt-PT').MB_IDIOMA.en === false);
t('o modelo de pauta fala em inglês', (() => { const w = carregar('en-US'); w.eval(ler('modelo.js')); return /Agreements/.test(w.MB_MODELO.TEXTO) && w.MB_MODELO.vazia(w.MB_MODELO.TEXTO); })());
process.exit(falhas ? 1 : 0);
