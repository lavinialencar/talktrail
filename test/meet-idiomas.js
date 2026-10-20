// O Meet escreve os nomes dos botões no idioma da pessoa. A extensão acha legendas, "sair" e a caixa de legendas pelos ícones e códigos
// do Meet (iguais em qualquer idioma). Aqui o Meet é simulado em espanhol, alemão e japonês, sem nenhuma palavra em português ou inglês.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../extension/content.js', 'utf8');
let ok = 0, ruim = 0;
const t = (nome, cond, extra = '') => { cond ? ok++ : ruim++; console.log((cond ? '  ok  ' : ' FALHOU') + ' ' + nome + (extra ? '  ' + extra : '')); };

const IDIOMAS = [
  { nome: 'espanhol', sair: 'Salir de la llamada', ligar: 'Activar subtítulos (c)', desligar: 'Desactivar subtítulos (c)', regiao: 'Subtítulos', fim: 'Ir al final', fala: 'Hola a todos, empezamos la reunión' },
  { nome: 'alemão', sair: 'Anruf verlassen', ligar: 'Untertitel aktivieren (c)', desligar: 'Untertitel deaktivieren (c)', regiao: 'Untertitel', fim: 'Zum Ende springen', fala: 'Guten Tag zusammen, wir fangen an' },
  { nome: 'japonês', sair: '通話から退出', ligar: '字幕をオンにする (c)', desligar: '字幕をオフにする (c)', regiao: 'xyz-sem-palavra-conhecida', fim: '最後へ', fala: 'こんにちは、会議を始めます' },
];

async function rodar(L) {
  const dom = new JSDOM(
    `<!doctype html><title>x</title><body>
      <button id="sair" aria-label="${L.sair}"><i>call_end</i></button>
      <button id="cc" aria-label="${L.ligar}"><i>closed_caption_off</i></button>
      <button id="chat" aria-label="${L.sair}-chat"><i>chat</i><i>chat_bubble</i></button>
      <div role="region" aria-label="${L.regiao}" id="regiao"><div id="conteudo">
        <div id="fim"><button jsname="Xke7ne" aria-label="${L.fim}"><i>arrow_downward</i><span>${L.fim}</span></button></div>
      </div></div></body>`,
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
  w.eval(`globalThis.__IDIOMA='en-US';` + fs.readFileSync(__dirname + '/../extension/i18n-en.js', 'utf8') + fs.readFileSync(__dirname + '/../extension/i18n.js', 'utf8') + src);
  const tick = async (ms) => {
    for (let r = ms; r > 0; r -= 1000) {
      agora += Math.min(1000, r);
      ints.forEach((i) => { if (Math.floor(agora / 1000) % Math.max(1, i.ms / 1000) === 0) i.f(); });
      touts.filter((t) => t.em <= agora && !t.feito).forEach((t) => { t.feito = true; t.f(); });
      await new Promise((r2) => setImmediate(r2));
    }
  };
  // clicar no CC liga as legendas: o ícone e o nome mudam, como no Meet de verdade
  const cc = w.document.getElementById('cc');
  cc.addEventListener('click', () => { cc.setAttribute('aria-label', L.desligar); cc.querySelector('i').textContent = 'closed_caption'; });
  await tick(2500);
  const ofertou = !!w.document.getElementById('talktrail-host');
  t(`${L.nome}: a extensão enxerga a chamada (botão de sair só pelo ícone)`, ofertou);
  w.document.getElementById('talktrail-host').shadowRoot.querySelector('[data-a="g"]').click();
  await tick(20000);
  t(`${L.nome}: ligou as legendas sozinha (achou o botão pelo ícone)`, cc.querySelector('i').textContent === 'closed_caption');
  const ult = () => estados[estados.length - 1];
  t(`${L.nome}: sabe que as legendas estão ligadas`, ult().legendas === true, JSON.stringify({ l: ult().legendas, m: ult().legendasMotivo }));
  // alguém fala: bloco com avatar, nome e fala
  const conteudo = w.document.getElementById('conteudo');
  const bloco = w.document.createElement('div');
  bloco.innerHTML = `<img src="x"><span>Ana</span>\n<div>${L.fala}</div>`; // o innerText do Meet separa nome e fala por linha
  conteudo.insertBefore(bloco, w.document.getElementById('fim'));
  await tick(3000);
  bloco.remove();
  await tick(5000);
  const linhas = ult().linhas || [];
  t(`${L.nome}: a fala entra na transcrição, com o nome de quem falou`, linhas.some((l) => l.speaker === 'Ana' && l.text.includes(L.fala.slice(0, 8))), JSON.stringify(linhas.slice(-2)));
  t(`${L.nome}: o botão "ir para o fim" não vira fala`, !linhas.some((l) => l.text.includes(L.fim) || l.speaker.includes(L.fim)));
  // legendas desligadas pela pessoa: vira aviso
  cc.setAttribute('aria-label', L.ligar); cc.querySelector('i').textContent = 'closed_caption_off';
  await tick(3000);
  t(`${L.nome}: legenda desligada no meio vira aviso`, ult().legendas === false);
}

(async () => {
  for (const L of IDIOMAS) { console.log(L.nome); await rodar(L); }
  console.log(`\n${ok} ok, ${ruim} falharam`);
  process.exit(ruim ? 1 : 0);
})();
