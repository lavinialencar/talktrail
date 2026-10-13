// Legenda desligada no meio da gravação tem que virar aviso (state.legendas === false).
// Uso: npm i jsdom@24 && node legendas.js
const { JSDOM } = require('jsdom');
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../extension/content.js', 'utf8');
(async () => {
  const dom = new JSDOM(
    `<!doctype html><title>x</title><body><button aria-label="Sair da chamada">sair</button><button id="cc" aria-label="Desativar legendas (c)">cc</button><div role="region" aria-label="Legendas"></div></body>`,
    { url: 'https://meet.google.com/abc-defg-hij', runScripts: 'outside-only', pretendToBeVisual: true }
  );
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
  const tick = async (ms) => {
    for (let r = ms; r > 0; r -= 1000) {
      agora += Math.min(1000, r);
      ints.forEach((i) => { if (Math.floor(agora / 1000) % Math.max(1, i.ms / 1000) === 0) i.f(); });
      touts.filter((t) => t.em <= agora && !t.feito).forEach((t) => { t.feito = true; t.f(); });
      await new Promise((r2) => setImmediate(r2));
    }
  };
  const legendas = () => estados[estados.length - 1].legendas;
  await tick(2000);
  w.document.getElementById('talktrail-host').shadowRoot.querySelector('[data-a="g"]').click();
  await tick(20000);
  console.log('ligadas (rótulo "Desativar legendas"):', legendas(), '← esperado true');
  w.document.getElementById('cc').setAttribute('aria-label', 'Ativar legendas (c)');
  await tick(3000);
  console.log('desligadas (rótulo "Ativar legendas")  :', legendas(), '← esperado false');
  w.document.getElementById('cc').setAttribute('aria-label', 'Desativar legendas (c)');
  await tick(3000);
  console.log('ligou de novo                          :', legendas(), '← esperado true');
})();
