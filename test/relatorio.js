// "Algo não funcionou?": o relatório sai com o que ajuda e SEM nada da reunião nem caminho de pasta.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../extension/panel.html', 'utf8').replace(/<script[^>]*><\/script>/g, '');
const src = fs.readFileSync(__dirname + '/../extension/panel.js', 'utf8');
let ok = 0, ruim = 0;
const t = (nome, cond, extra = '') => { cond ? ok++ : ruim++; console.log((cond ? '  ok  ' : ' FALHOU') + ' ' + nome + (extra ? '  ' + extra : '')); };

(async () => {
  const dom = new JSDOM(html, { url: 'chrome-extension://abc/panel.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  Object.defineProperty(w.navigator, 'userAgent', { value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', configurable: true });
  const copiados = [];
  const abertos = [];
  const estado = { fase: 'gravando', titulo: 'Reunião secreta com a Ana', projeto: 'Cliente X', tags: [], segundos: 5, notes: 'nota confidencial', cola: '', linhas: [{ speaker: 'Ana', t: 1, text: 'texto secreto da fala' }], marcas: [], modoSalvar: 'pasta',
    erro: 'Não consegui salvar na pasta (Permission denied em /Users/pessoa/Documents/Talktrail)', legendas: true };
  w.chrome = {
    commands: { getAll: () => Promise.resolve([{ name: 'marcar-momento', shortcut: 'Ctrl+Shift+K' }, { name: 'transcrever-ou-parar', shortcut: '' }]) },
    runtime: { onMessage: { addListener() {} }, sendMessage: () => Promise.resolve(), getURL: (p) => p, getManifest: () => ({ version: '9.9.9' }) },
    tabs: {
      query: () => Promise.resolve([{ id: 1 }]),
      sendMessage: (id, m) => Promise.resolve(m && m.cmd === 'diagnostico'
        ? { ...estado, diag: { naSala: true, naChamada: true, gravando: true, legendas: { ligadas: true, botao: true, desabilitado: false }, regiao: true, ultimaFalaHa: 3, salvoHa: 2 } }
        : estado),
      create() {},
    },
    storage: { onChanged: { addListener() {} }, local: { get: () => Promise.resolve({}), set: () => Promise.resolve() } },
  };
  w.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, out: '/Users/pessoa/Documents/Reunioes', pasta_existe: true }) });
  w.navigator.clipboard = { writeText: (x) => { copiados.push(x); return Promise.resolve(); } };
  w.HTMLAnchorElement.prototype.click = function () { abertos.push(this.href); };
  w.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  w.MBEditor = { create: () => new Proxy({}, { get: () => () => '' }) }; // o editor de verdade tem teste próprio
  w.eval(src);
  await new Promise((r) => setTimeout(r, 300));
  w.document.getElementById('engrenagem').click();
  await new Promise((r) => setTimeout(r, 400));

  console.log('Relatar um problema');
  w.document.getElementById('ajRelatar').click();
  await new Promise((r) => setTimeout(r, 100));
  t('abre o e-mail (mailto) com assunto e versão', abertos.length === 1 && abertos[0].startsWith('mailto:?subject=') && decodeURIComponent(abertos[0]).includes('v9.9.9'), abertos[0] && abertos[0].slice(0, 80));
  const corpo = decodeURIComponent((abertos[0] || '').split('&body=')[1] || '');
  t('traz versão, navegador e sistema', /Talktrail 9\.9\.9/.test(corpo) && /Chrome 130/.test(corpo) && /Sistema: Windows/.test(corpo), corpo.slice(corpo.indexOf('Dados'), corpo.indexOf('Dados') + 230).replace(/\r?\n/g, ' / '));
  t('traz o diagnóstico e onde salva', /Diagnóstico:/.test(corpo) && /Onde salva: na pasta/.test(corpo) && /ok: Reunião do Meet/.test(corpo));
  t('traz os atalhos (com "sem atalho" quando vazio)', /marcar-momento=Ctrl\+Shift\+K/.test(corpo) && /transcrever-ou-parar=sem atalho/.test(corpo));
  t('NÃO leva nome da reunião, projeto, notas nem fala', !/secreta|Cliente X|confidencial|texto secreto|Ana/.test(corpo));
  t('NÃO leva o nome da pasta do usuário', !/lavinialencar/.test(corpo) && /\/Users\/…/.test(corpo), (corpo.match(/Último erro:.*/) || [''])[0]);
  t('cabe num mailto (abaixo de 2000 caracteres)', abertos[0].length < 2000, String(abertos[0].length));

  console.log('Copiar o relatório (sem programa de e-mail)');
  w.document.getElementById('ajRelatorioCopiar').click();
  await new Promise((r) => setTimeout(r, 100));
  t('copia o mesmo texto, com assunto', copiados.length === 1 && /^Assunto: Talktrail: problema/.test(copiados[0]) && !/secret/i.test(copiados[0]));
  t('o botão mostra "Copiado"', w.document.getElementById('ajRelatorioCopiar').textContent === 'Copiado');
  t('e o endereço aparece só quando houver um definido', w.document.getElementById('ajSuporteEmail').hidden === true);

  console.log(`\n${ok} ok, ${ruim} falharam`);
  process.exit(ruim ? 1 : 0);
})();
