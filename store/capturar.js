// Tira as imagens do painel e da página de Pautas pra arte da loja, com o navegador de verdade (extensão carregada)
// e dados fictícios. Uso: node store/capturar.js   (precisa do servidor estático: python3 -m http.server 8799, na raiz do repo)
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const RAIZ = path.resolve(__dirname, '..');
const HELIUM = '/Applications/Helium.app/Contents/MacOS/Helium';
let PORTA = 9444;
const PERFIL = fs.mkdtempSync('/tmp/talktrail-loja-');
const esp = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = (u) => new Promise((res, rej) => http.get(u, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
async function conectar(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pend = new Map();
  ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); } });
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : 'erro'); return r.result.value; };
  return { send, ev, close: () => ws.close() };
}
const nova = async (url) => (await fetch(`http://127.0.0.1:${PORTA}/json/new?${encodeURI(url)}`, { method: 'PUT' })).json();
async function foto(url, arquivo, w, h, antes) {
  const aba = await nova(url);
  const pg = await conectar(aba.webSocketDebuggerUrl);
  await pg.send('Page.enable');
  await pg.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: false });
  await esp(1800);
  if (antes) await antes(pg);
  await esp(700);
  const r = await pg.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(arquivo, Buffer.from(r.data, 'base64'));
  pg.close();
  await fetch(`http://127.0.0.1:${PORTA}/json/close/${aba.id}`).catch(() => {});
}
let proc2 = null;
(async () => {
  const proc = spawn(HELIUM, ['--headless=new', `--user-data-dir=${PERFIL}`, `--remote-debugging-port=${PORTA}`, `--load-extension=${path.join(RAIZ, 'extension')}`, '--no-first-run', '--window-size=1400,900', 'about:blank'], { stdio: 'ignore' });
  try {
    await esp(5000);
    const alvos = await getJSON(`http://127.0.0.1:${PORTA}/json`);
    const sw = alvos.find((t) => t.type === 'service_worker');
    const ID = new URL(sw.url).host;
    const bg = await conectar(sw.webSocketDebuggerUrl);
    const p2 = (n) => String(n).padStart(2, '0');
    // dias úteis: hoje, depois o próximo dia útil, e assim por diante (a arte não mostra reunião de sábado)
    const dia = (n) => { const d = new Date(); for (let k = 0; k < n;) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) k++; } return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
    const agenda = [
      ['Revisão do projeto Aurora', 0, '14:00', '14:45'], ['Alinhamento com o cliente', 0, '16:30', '17:00'],
      ['Daily de produto', 1, '09:30', '09:45'], ['Planejamento do trimestre', 1, '15:00', '16:30'],
      ['Daily de produto', 2, '09:30', '09:45'], ['Revisão de design', 3, '11:00', '12:00'], ['Daily de produto', 5, '09:30', '09:45'], ['Retrospectiva da sprint', 6, '16:00', '17:00'],
    ].map(([titulo, n, hora, fim]) => ({ titulo, data: dia(n), hora, fim }));
    const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
    const pauta = (titulo, n, hora, texto) => [`${dia(n)}|${norm(titulo)}`, { titulo, data: dia(n), hora, texto, criada: 1, atualizada: 2 }];
    const pautas = Object.fromEntries([
      pauta('Revisão do projeto Aurora', 0, '14:00', '1. Status do protótipo\n2. Quem decide o prazo?\n3. Quais acessos faltam?\n\nCombinados\n- [ ] Enviar a proposta revisada\n- [ ] Marcar a próxima reunião'),
      pauta('Planejamento do trimestre', 1, '15:00', '1. Metas do trimestre\n2. Prioridades por time\n3. Riscos e dependências\n\nCombinados\n- [ ] Fechar o orçamento\n- [ ] Definir responsáveis'),
      pauta('Daily de produto', 1, '09:30', '1. Bloqueios\n2. Prioridades de hoje'),
      pauta('Daily de produto', 2, '09:30', '1. Bloqueios\n2. Prioridades de hoje'),
    ]);
    const dias = Object.fromEntries(Array.from({ length: 10 }, (_, n) => [dia(n), 1]));
    await bg.ev(`chrome.storage.local.set(${JSON.stringify({ agendaMeet: agenda, pautas, agendaDias: dias, agendaLidaEm: Date.now(), tagsSalvas: ['Produto', 'Aurora', 'Design'] })})`);
    await esp(800);
    const out = path.join(__dirname, 'painel');
    // painel fora do Meet: a agenda de hoje
    await foto(`chrome-extension://${ID}/panel.html`, path.join(out, 'agenda.png'), 400, 760);
    // página de Pautas: calendário e a pauta aberta
    await foto(`chrome-extension://${ID}/pautas.html`, path.join(out, 'pautas-pagina.png'), 1100, 760, async (pg) => {
      await pg.ev(`document.querySelector('[data-dia="${dia(1)}"]').click()`);
      await esp(300);
      await pg.ev(`[...document.querySelectorAll('#diaLista .abrir')].find(b => /Planejamento/.test(b.textContent)).click()`);
    });
    proc.kill();
    // painel dentro da reunião: Chrome simulado (a demo define o próprio chrome.*), por isso num navegador sem a extensão
    PORTA = 9445;
    const perfil2 = fs.mkdtempSync('/tmp/talktrail-loja2-');
    proc2 = spawn(HELIUM, ['--headless=new', `--user-data-dir=${perfil2}`, `--remote-debugging-port=${PORTA}`, '--no-first-run', '--window-size=1400,900', 'about:blank'], { stdio: 'ignore' });
    await esp(4000);
    await foto('http://127.0.0.1:8799/store/src/painel-loja.html?aba=texto', '/tmp/talktrail-aquecimento.png', 400, 760); // a primeira aba do navegador novo sai em branco
    for (const [aba, arq] of [['texto', 'texto'], ['notas', 'notas'], ['cola', 'pauta'], ['marcadores', 'marcadores']]) {
      await foto(`http://127.0.0.1:8799/store/src/painel-loja.html?aba=${aba}`, path.join(out, `${arq}.png`), 400, 760);
    }
    console.log('ok');
  } finally {
    proc.kill();
    if (proc2) proc2.kill();
  }
})().catch((e) => { console.error('ERRO', e.message); process.exit(1); });
