// Teste do fluxo no Meet simulado. Uso: cd ~/Developer/talktrail/test && npm i jsdom@24 && node fluxo.js
// Meet simulado: oferta -> gravar -> encerrar -> some. Roda o content.js de verdade.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../extension/content.js', 'utf8');

async function cenario(nome, fimDaChamada) {
  const dom = new JSDOM(
    `<!doctype html><title>Meet: tgg-phfk-nkx</title><body><button aria-label="Sair da chamada">sair</button></body>`,
    { url: 'https://meet.google.com/tgg-phfk-nkx', runScripts: 'outside-only', pretendToBeVisual: true }
  );
  const w = dom.window;
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', { get() { return this.textContent; } });
  let agora = 1_000_000;
  const ints = [], touts = [], msgs = [];
  w.Date.now = () => agora;
  w.setInterval = (f, ms) => { ints.push({ f, ms }); return ints.length; };
  w.clearInterval = () => {};
  w.setTimeout = (f, ms) => { touts.push({ f, ms, em: agora + ms }); return touts.length; };
  w.clearTimeout = () => {};
  w.chrome = {
    runtime: { id: 'x', sendMessage: (m) => { msgs.push(m); return Promise.resolve({ ok: true, status: 200, data: { arquivo: 'x.md' } }); }, onMessage: { addListener() {} } },
    storage: { local: { get: () => Promise.resolve({}), set: () => Promise.resolve() }, onChanged: { addListener() {} } },
  };
  w.eval(src);
  const tick = async (ms) => {
    // avança em passos de 1 s, deixando as promessas resolverem entre os passos (como o navegador faz)
    for (let r = ms; r > 0; r -= 1000) {
      agora += Math.min(1000, r);
      ints.forEach((i) => { if (Math.floor(agora / 1000) % Math.max(1, i.ms / 1000) === 0) i.f(); });
      touts.filter((t) => t.em <= agora && !t.feito).forEach((t) => { t.feito = true; t.f(); });
      await new Promise((r2) => setImmediate(r2));
    }
  };
  const card = () => {
    const h = w.document.getElementById('talktrail-host');
    return h ? h.shadowRoot.querySelector('.card') : null;
  };
  const txt = () => (card() ? card().textContent.replace(/\s+/g, ' ').trim() : '(nenhum aviso)');
  const out = [];
  await tick(2000);
  out.push(['oferta', txt()]);
  card().querySelector('[data-a="g"]').click();
  await tick(1000);
  out.push(['gravando (nada fora do painel)', txt()]);
  await tick(60000);
  fimDaChamada(w);
  await tick(2000);
  out.push(['2 s depois do fim', txt()]);
  await tick(15000);
  out.push(['17 s depois', txt()]);
  await tick(6000);
  out.push(['mais 6 s', txt()]);
  const tipos = msgs.map((m) => m.type);
  out.push(['mensagens', [...new Set(tipos)].join(',')]);
  const ultimoSalvo = msgs.filter((m) => m.type === 'save').pop();
  out.push(['titulo salvo', ultimoSalvo ? ultimoSalvo.payload.titulo : '(sem save)']);
  console.log('\n## ' + nome);
  out.forEach(([k, v]) => console.log('  ' + k.padEnd(34) + v));
}

(async()=>{ await cenario('Encerrou para todos (tela "Você encerrou a reunião")', (w) => {
  const b = w.document.body; b.innerHTML = '<h1>Você encerrou a reunião para todos</h1><button>Voltar à tela inicial</button>';
});
await cenario('Saiu da reunião', (w) => {
  w.document.body.innerHTML = '<h1>Você saiu da reunião</h1><button>Participar novamente</button>';
});
await cenario('Barra sumiu e texto desconhecido (só pela ausência do botão)', (w) => {
  w.document.body.innerHTML = '<div>alguma tela nova do Meet</div>';
});
})();
