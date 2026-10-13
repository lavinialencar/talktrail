// Experiência: computador dormindo, motivo da legenda desligada e diagnóstico.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../extension/content.js', 'utf8');
let ok = 0, ruim = 0;
const t = (nome, cond, extra = '') => { cond ? ok++ : ruim++; console.log((cond ? '  ok  ' : ' FALHOU') + ' ' + nome + (extra ? '  ' + extra : '')); };

async function cena({ cc = '<button id="cc" aria-label="Desativar legendas (c)">cc</button>', regiao = true, saiDaChamada = false } = {}) {
  const dom = new JSDOM(`<!doctype html><title>x</title><body><button aria-label="Sair da chamada">sair</button>${cc}${regiao ? '<div role="region" aria-label="Legendas"></div>' : ''}</body>`,
    { url: 'https://meet.google.com/abc-defg-hij', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const cliquesCC = []; // o botão de legendas de mentira vira "ligado" e "desligado" a cada clique
  const botaoCC = w.document.getElementById('cc');
  if (botaoCC) {
    botaoCC.addEventListener('click', () => {
      cliquesCC.push(botaoCC.getAttribute('aria-label'));
      botaoCC.setAttribute('aria-label', /Desativar/.test(botaoCC.getAttribute('aria-label')) ? 'Ativar legendas (c)' : 'Desativar legendas (c)');
    });
  }
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
    runtime: { id: 'x', onMessage: { addListener: (f) => (ouvinte = f) }, sendMessage: (m) => { msgs.push(m); return Promise.resolve({ ok: true, status: 200, modo: 'extensao', data: {} }); } },
    storage: { local: { get: () => Promise.resolve({}), set: () => Promise.resolve() }, onChanged: { addListener() {} } },
  };
  w.eval(src);
  const tick = async (ms) => {
    for (let r = ms; r > 0; r -= 1000) {
      agora += Math.min(1000, r);
      ints.forEach((i) => { if (!i.morto && Math.floor(agora / 1000) % Math.max(1, i.ms / 1000) === 0) i.f(); });
      touts.filter((x) => x.em <= agora && !x.feito).forEach((x) => { x.feito = true; x.f(); });
      await new Promise((r2) => setImmediate(r2));
    }
  };
  const pular = (ms) => { agora += ms; };
  await tick(2000);
  w.document.getElementById('talktrail-host').shadowRoot.querySelector('[data-a="g"]').click();
  await tick(3000);
  const estado = () => msgs.filter((m) => m.type === 'state').pop().state;
  const pergunta = (cmd) => new Promise((res) => ouvinte({ type: 'cmd', cmd }, {}, res));
  return { tick, pular, estado, pergunta, msgs, w, cliquesCC };
}

(async () => {
  console.log('Computador dormindo');
  let r = await cena();
  r.pular(10 * 60 * 1000); // o relógio pula 10 minutos
  await r.tick(2000);
  t('avisa no painel quanto tempo ficou parado', /parada por 10 min/.test(r.estado().info), r.estado().info);
  r.w.document.getElementById('talktrail-host'); // ainda existe
  const linhas = r.estado().linhas;
  t('marca o buraco na transcrição', linhas.some((l) => l.speaker === 'Talktrail' && /parada por 10 min/.test(l.text)));
  await r.tick(3000);
  const salvo = r.msgs.filter((m) => m.type === 'save').pop().payload;
  t('o buraco vai no arquivo', salvo.transcript.some((l) => l.speaker === 'Talktrail'));
  r = await cena();
  await r.tick(30000);
  t('uso normal não gera aviso de buraco', !r.estado().info);

  console.log('Atalho de transcrever/parar');
  r = await cena();
  t('começa transcrevendo (cena pronta)', r.estado().fase === 'gravando', r.estado().fase);
  await r.pergunta('alternar');
  await r.tick(1000);
  t('"alternar" com transcrição ligada: para', r.estado().fase !== 'gravando', r.estado().fase);
  await r.pergunta('alternar');
  await r.tick(1000);
  t('"alternar" de novo: volta a transcrever', r.estado().fase === 'gravando', r.estado().fase);

  console.log('Parar transcrição e continuar na chamada');
  r = await cena();
  await r.pergunta('stop');
  await r.tick(2000);
  t('parou, mas continua na chamada: NÃO manda fechar o painel', !r.msgs.some((m) => m.type === 'fim'), JSON.stringify(r.msgs.filter((m) => m.type !== 'state' && m.type !== 'save').map((m) => m.type)));
  await r.tick(25000);
  t('mesmo depois do aviso sumir, o painel segue disponível pra transcrever de novo', !r.msgs.some((m) => m.type === 'fim'));
  await r.pergunta('start');
  await r.tick(1000);
  t('e dá pra começar de novo (várias vezes)', r.estado().fase === 'gravando', r.estado().fase);
  await r.pergunta('stop');
  await r.tick(500);
  await r.pergunta('start');
  await r.tick(500);
  await r.pergunta('stop');
  await r.tick(500);
  await r.pergunta('start');
  await r.tick(500);
  t('...inclusive depois de parar e começar várias vezes', r.estado().fase === 'gravando');
  r = await cena();
  r.w.document.querySelector('button[aria-label="Sair da chamada"]').remove();
  await r.pergunta('stop');
  await r.tick(2000);
  t('parou porque saiu da chamada: aí sim fecha o painel', r.msgs.some((m) => m.type === 'fim'));

  console.log('Legendas do Meet ao parar');
  r = await cena({ cc: '<button id="cc" aria-label="Ativar legendas (c)">cc</button>' });
  t('estavam desligadas: a extensão ligou (1 clique)', r.cliquesCC.length === 1 && /Ativar/.test(r.cliquesCC[0]), JSON.stringify(r.cliquesCC));
  await r.pergunta('stop');
  await r.tick(1000);
  t('ao parar, desliga de volta (2º clique, "Desativar")', r.cliquesCC.length === 2 && /Desativar/.test(r.cliquesCC[1]), JSON.stringify(r.cliquesCC));
  r = await cena({ cc: '<button id="cc" aria-label="Desativar legendas (c)">cc</button>' });
  await r.pergunta('stop');
  await r.tick(1000);
  t('já estavam ligadas antes: ficam como estavam (nenhum clique)', r.cliquesCC.length === 0, JSON.stringify(r.cliquesCC));

  console.log('Motivo da legenda desligada');
  r = await cena();
  await r.tick(12000);
  t('ligadas: sem motivo', r.estado().legendas === true && r.estado().legendasMotivo === '');
  r = await cena({ cc: '<button aria-label="Ativar legendas (c)">cc</button>' });
  await r.tick(12000);
  t('desligadas por mim: motivo "desligadas"', r.estado().legendas === false && r.estado().legendasMotivo === 'desligadas', r.estado().legendasMotivo);
  r = await cena({ cc: '<button aria-label="Ativar legendas" disabled>cc</button>' });
  await r.tick(12000);
  t('botão travado: motivo "organizador"', r.estado().legendasMotivo === 'organizador', r.estado().legendasMotivo);
  r = await cena({ cc: '', regiao: false });
  await r.tick(12000);
  t('sem botão e sem caixa de legendas: motivo "sem-botao"', r.estado().legendasMotivo === 'sem-botao', r.estado().legendasMotivo);

  console.log('Diagnóstico');
  r = await cena();
  await r.tick(5000);
  const d = (await r.pergunta('diagnostico')).diag;
  t('responde com o estado de cada coisa', d && d.naSala === true && d.naChamada === true && d.gravando === true && d.legendas.ligadas === true && d.regiao === true, JSON.stringify(d));
  t('diz há quanto tempo não chega fala', d && 'ultimaFalaHa' in d);

  console.log(`\n${ok} ok, ${ruim} falharam`);
  process.exit(ruim ? 1 : 0);
})();
