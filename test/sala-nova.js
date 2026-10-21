// O Meet passou a usar também meet.google.com/meet/abc-defg-hij. Com o endereço novo a extensão tem que se comportar como numa sala:
// oferecer transcrever, ligar o painel de gravação e não cair na agenda.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const c = require('../extension/content.js');
const src = fs.readFileSync(__dirname + '/../extension/content.js', 'utf8');
let ok = 0, ruim = 0;
const t = (nome, cond, extra = '') => { cond ? ok++ : ruim++; console.log((cond ? '  ok  ' : ' FALHOU') + ' ' + nome + (extra ? '  ' + extra : '')); };

t('o endereço antigo continua sendo sala', c.CODIGO_SALA.test('/abc-defg-hij') && c.CODIGO_SALA.test('/abc-defg-hij/'));
t('o endereço novo (/meet/código) também é sala', c.CODIGO_SALA.test('/meet/abc-defg-hij') && c.CODIGO_SALA.test('/meet/abc-defg-hij/'));
t('tela inicial, agenda e outras páginas não são sala', !['/', '/landing', '/home', '/home/2026/10/21', '/meet', '/meet/', '/meet/home', '/new', '/lookup/abc'].some((p) => c.CODIGO_SALA.test(p)));

(async () => {
  for (const [rotulo, url, esperado] of [['endereço antigo', 'https://meet.google.com/abc-defg-hij', 'abc-defg-hij'], ['endereço novo', 'https://meet.google.com/meet/abc-defg-hij', 'abc-defg-hij']]) {
    const dom = new JSDOM(`<!doctype html><title>x</title><body><button aria-label="Sair da chamada"><i>call_end</i></button><button id="cc" aria-label="Ativar legendas (c)"><i>closed_caption_off</i></button></body>`,
      { url, runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    Object.defineProperty(w.HTMLElement.prototype, 'innerText', { get() { return this.textContent; } });
    let agora = 1_000_000; const ints = [], touts = [], estados = [];
    w.Date.now = () => agora;
    w.setInterval = (f, ms) => { ints.push({ f, ms }); return ints.length; };
    w.clearInterval = () => {}; w.clearTimeout = () => {};
    w.setTimeout = (f, ms) => { touts.push({ f, em: agora + ms }); return touts.length; };
    w.chrome = {
      runtime: { id: 'x', onMessage: { addListener() {} }, sendMessage: (m) => { if (m.type === 'state') estados.push(m.state); return Promise.resolve({ ok: true }); } },
      storage: { local: { get: () => Promise.resolve({}), set: () => Promise.resolve() }, onChanged: { addListener() {} } },
    };
    w.eval(src);
    for (let r = 0; r < 4000; r += 1000) {
      agora += 1000;
      ints.forEach((i) => { if (Math.floor(agora / 1000) % Math.max(1, i.ms / 1000) === 0) i.f(); });
      touts.filter((x) => x.em <= agora && !x.feito).forEach((x) => { x.feito = true; x.f(); });
      await new Promise((r2) => setImmediate(r2));
    }
    const e = estados[estados.length - 1] || {};
    t(`${rotulo}: o painel sabe que está numa sala (não mostra a agenda)`, e.semSala === false && e.sala === esperado, JSON.stringify({ semSala: e.semSala, sala: e.sala }));
    t(`${rotulo}: o aviso "Transcrever esta reunião?" aparece`, !!w.document.getElementById('talktrail-host') && !!w.document.getElementById('talktrail-host').shadowRoot.querySelector('[data-a="g"]'));
  }
  console.log(`\n${ok} ok, ${ruim} falharam`);
  process.exit(ruim ? 1 : 0);
})();
