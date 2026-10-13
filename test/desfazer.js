// "Desfazer" no aviso de salvo: parou com a chamada aberta continua a mesma reunião; saiu da chamada não oferece.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../extension/content.js', 'utf8');

async function cenario(nome, sair) {
  const dom = new JSDOM(
    `<!doctype html><title>x</title><body><button aria-label="Sair da chamada">sair</button></body>`,
    { url: 'https://meet.google.com/abc-defg-hij', runScripts: 'outside-only', pretendToBeVisual: true }
  );
  const w = dom.window;
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', { get() { return this.textContent; } });
  let agora = 1_000_000;
  const ints = [], touts = [], msgs = [];
  let ouvinte = null;
  w.Date.now = () => agora;
  w.setInterval = (f, ms) => { ints.push({ f, ms }); return ints.length; };
  w.clearInterval = (id) => { if (ints[id - 1]) ints[id - 1].morto = true; };
  w.clearTimeout = () => {};
  w.setTimeout = (f, ms) => { touts.push({ f, em: agora + ms }); return touts.length; };
  w.chrome = {
    runtime: { id: 'x', onMessage: { addListener: (f) => (ouvinte = f) }, sendMessage: (m) => { msgs.push(m); return Promise.resolve({ ok: true, status: 200, data: { arquivo: 'x.md' } }); } },
    storage: { local: { get: () => Promise.resolve({}), set: () => Promise.resolve() }, onChanged: { addListener() {} } },
  };
  w.eval(src);
  const tick = async (ms) => {
    for (let r = ms; r > 0; r -= 1000) {
      agora += Math.min(1000, r);
      ints.forEach((i) => { if (!i.morto && Math.floor(agora / 1000) % Math.max(1, i.ms / 1000) === 0) i.f(); });
      touts.filter((t) => t.em <= agora && !t.feito).forEach((t) => { t.feito = true; t.f(); });
      await new Promise((r2) => setImmediate(r2));
    }
  };
  const card = () => { const h = w.document.getElementById('talktrail-host'); return h ? h.shadowRoot.querySelector('.card') : null; };
  const fase = () => msgs.filter((m) => m.type === 'state').pop().state.fase;
  await tick(2000);
  card().querySelector('[data-a="g"]').click();
  await tick(5000);
  sair(w, ouvinte);
  await tick(1000);
  const botao = card() && card().querySelector('[data-a="d"]');
  console.log(`\n## ${nome}`);
  console.log('  aviso de salvo        :', card() ? card().querySelector('.t').textContent : '(nenhum)');
  console.log('  botão Desfazer        :', botao ? 'sim' : 'não');
  if (botao) {
    botao.click();
    await tick(8000); // passa da janela de 6 s do aviso
    console.log('  depois de Desfazer    :', fase(), '(esperado gravando)');
    console.log('  mensagens ao painel   :', [...new Set(msgs.map((m) => m.type))].join(','));
    ouvinte({ type: 'cmd', cmd: 'stop' }, {}, () => {});
    await tick(1000);
    console.log('  parar de novo         :', fase(), '(esperado parado)');
  }
}

(async () => {
  await cenario('Parar pelo painel, chamada aberta', (w, ouv) => ouv({ type: 'cmd', cmd: 'stop' }, {}, () => {}));
  await cenario('Saiu da chamada', (w) => { w.document.body.innerHTML = '<h1>Você saiu da reunião</h1>'; });
})();
