// O painel (fora do Meet) abre a página de Pautas já na reunião tocada: pautas.html?reuniao=<id>
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
let ok = 0, ruim = 0;
const t = (nome, cond, extra = '') => { cond ? ok++ : ruim++; console.log((cond ? '  ok  ' : ' FALHOU') + ' ' + nome + (extra ? '  ' + extra : '')); };
const esp = (ms) => new Promise((r) => setTimeout(r, ms));
const dia = (n) => { const d = new Date(Date.now() + n * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

(async () => {
  const html = fs.readFileSync(path.join(__dirname, '../extension/pautas.html'), 'utf8').replace(/<script[^>]*><\/script>/g, '');
  const id = `${dia(9)}|planejamento do mes`;
  const dom = new JSDOM(html, { url: `chrome-extension://abc/pautas.html?reuniao=${encodeURIComponent(id)}`, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const loja = { agendaLidaEm: Date.now(), agendaDias: {}, agendaMeet: [{ titulo: 'Planejamento do mês', data: dia(9), hora: '10:00', fim: '11:00' }, { titulo: 'Outra', data: dia(0), hora: '09:00' }], pautas: {} };
  w.chrome = {
    runtime: { sendMessage: () => Promise.resolve(), getManifest: () => ({ version: '9.9.9' }) },
    storage: { onChanged: { addListener() {} }, local: { get: (k) => Promise.resolve(Object.fromEntries([].concat(k).filter((x) => x in loja).map((x) => [x, loja[x]]))), set: () => Promise.resolve() } },
  };
  const editores = {};
  w.MBEditor = { create: (el) => (editores[el.id] = { v: '', setValue(x) { this.v = x; }, hasFocus: () => false }) };
  w.eval(fs.readFileSync(path.join(__dirname, '../extension/modelo.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(__dirname, '../extension/pautas.js'), 'utf8'));
  await esp(200);
  const $ = (x) => w.document.getElementById(x);
  console.log('Link vindo do painel');
  t('a reunião tocada no painel já abre escolhida, com o editor', $('edCorpo').hidden === false && $('edTitulo').textContent === 'Planejamento do mês');
  t('o calendário vai para o dia dela', !!w.document.querySelector(`[data-dia="${dia(9)}"].sel`));
  console.log(`\n${ok} ok, ${ruim} falharam`);
  process.exit(ruim ? 1 : 0);
})();
