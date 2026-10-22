// Navegador de verdade (Helium sem janela, perfil descartável) com o PACOTE DA LOJA carregado.
// Tudo aqui fala com o Chromium pelo protocolo de depuração (CDP). Nada abre na tela de ninguém.
const { spawn, execSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), https = require('https');
const RAIZ = path.join(__dirname, '..', '..');
const esp = (ms) => new Promise((r) => setTimeout(r, ms));
const BIN = ['/Applications/Helium.app/Contents/MacOS/Helium', '/Applications/Chromium.app/Contents/MacOS/Chromium', process.env.TT_CHROME].filter(Boolean).find((p) => fs.existsSync(p));

const get = (u) => new Promise((res, rej) => http.get(u, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej));

async function conectar(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  let id = 0; const pend = new Map(); const ouvintes = [];
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
    else if (d.method) ouvintes.forEach((f) => f(d.method, d.params));
  });
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text || 'erro');
    return r.result.value;
  };
  return { send, ev, on: (f) => ouvintes.push(f), close: () => ws.close() };
}

// Cria uma cópia da pasta do pacote com o idioma do navegador forçado (no Mac a flag --lang é ignorada).
function pacote({ idioma, de, destinoFixo, portaServidor: portaFixa } = {}) {
  const man = JSON.parse(fs.readFileSync(path.join(RAIZ, 'extension/manifest.json'), 'utf8'));
  let origem = de;
  if (!origem) { execSync(`python3 tools/empacotar.py ${JSON.stringify(os.tmpdir())}`, { cwd: RAIZ, stdio: 'pipe' }); origem = path.join(os.tmpdir(), `talktrail-${man.version}`); }
  const destino = destinoFixo || fs.mkdtempSync(path.join(os.tmpdir(), 'tt-pacote-')) + '/ext';
  fs.rmSync(destino, { recursive: true, force: true });
  fs.cpSync(origem, destino, { recursive: true });
  // NUNCA falar com o servidor de verdade (porta 8787): a cópia de teste aponta pra uma porta de teste, em todos os arquivos
  const portaServidor = portaFixa || Number(process.env.TT_PORTA_SERVIDOR) || 20000 + Math.floor(Math.random() * 20000);
  (function varre(d) {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const c = path.join(d, f.name);
      if (f.isDirectory()) varre(c);
      else if (/\.(js|json|html)$/.test(f.name)) { const t = fs.readFileSync(c, 'utf8'); if (t.includes('8787')) fs.writeFileSync(c, t.split('8787').join(String(portaServidor))); }
    }
  })(destino);
  let sobrou = ''; (function acha(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const c = path.join(d, f.name); if (f.isDirectory()) acha(c); else if (/\.(js|json|html)$/.test(f.name) && fs.readFileSync(c, 'utf8').includes('8787')) sobrou = c; } })(destino);
  if (sobrou) throw new Error('a cópia de teste ainda aponta pra porta 8787 (servidor de verdade): ' + sobrou);
  const arqI18n = path.join(destino, 'i18n.js');
  if (idioma && fs.existsSync(arqI18n)) { // versões antigas não têm i18n.js
    const f = arqI18n; let s = fs.readFileSync(f, 'utf8');
    const forca = `try { chrome.i18n.getUILanguage = () => '${idioma}'; } catch (e) {}\n`;
    fs.writeFileSync(f, forca + s);
  }
  pacote.portaServidor = portaServidor;
  return destino;
}

let portaSeq = 9400 + Math.floor(Math.random() * 400);
async function abrir({ idioma, meetPorta, isolarGoogle, args = [], pacoteDe, destinoExt, perfilDir, portaServidor } = {}) {
  const porta = portaSeq++;
  const perfil = perfilDir || fs.mkdtempSync(path.join(os.tmpdir(), 'tt-perfil-'));
  const ext = pacote({ idioma, de: pacoteDe, destinoFixo: destinoExt, portaServidor });
  const baixados = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-down-'));
  fs.mkdirSync(path.join(perfil, 'Default'), { recursive: true });
  fs.writeFileSync(path.join(perfil, 'Default', 'Preferences'), JSON.stringify({ download: { default_directory: baixados, prompt_for_download: false }, savefile: { default_directory: baixados } }));
  const a = ['--headless=new', `--remote-debugging-port=${porta}`, `--user-data-dir=${perfil}`, `--load-extension=${ext}`, '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--ignore-certificate-errors', '--allow-insecure-localhost', '--disable-features=Translate,MediaRouter',
    ...(meetPorta ? [`--host-resolver-rules=MAP meet.google.com 127.0.0.1:${meetPorta}, MAP *.google.com 127.0.0.1:1`] : isolarGoogle ? ['--host-resolver-rules=MAP *.google.com 127.0.0.1:1'] : []), ...args, 'about:blank'];
  const proc = spawn(BIN, a, { stdio: 'ignore' });
  let alvos;
  for (let i = 0; i < 60; i++) { try { alvos = await get(`http://127.0.0.1:${porta}/json`); if (alvos.some((t) => t.type === 'service_worker')) break; } catch (e) {} await esp(500); }
  const sw = alvos && alvos.find((t) => t.type === 'service_worker');
  if (!sw) { proc.kill(); throw new Error('a extensão não subiu (sem service worker)'); }
  const ID = new URL(sw.url).host;
  const B = { porta, ID, ext, perfil, baixados, proc, erros: [], portaServidor: pacote.portaServidor };
  B.url = (p) => `chrome-extension://${ID}/${p}`;
  B.abas = async () => (await get(`http://127.0.0.1:${porta}/json`)).filter((t) => t.type === 'page');
  B.nova = async (url, { largura = 436, altura = 880 } = {}) => {
    const externa = /^https?:/.test(url); // a 1ª navegação de uma aba nova às vezes é abortada: abre em branco e navega (com nova tentativa)
    const r = await (await fetch(`http://127.0.0.1:${porta}/json/new?${encodeURI(externa ? 'about:blank' : url)}`, { method: 'PUT' })).json();
    const pg = await conectar(r.webSocketDebuggerUrl); pg.id = r.id; pg.erros = [];
    pg.on((m, p) => {
      if (m === 'Runtime.exceptionThrown' && !/ViewTransition/.test(JSON.stringify(p))) pg.erros.push('exceção: ' + ((p.exceptionDetails.exception && p.exceptionDetails.exception.description) || p.exceptionDetails.text).split('\n')[0]);
      if (m === 'Runtime.consoleAPICalled' && p.type === 'error') pg.erros.push('console.error: ' + p.args.map((x) => x.value || x.description || '').join(' ').slice(0, 300));
      if (m === 'Page.javascriptDialogOpening') pg.send('Page.handleJavaScriptDialog', { accept: !!pg.aceitaDialogo }).catch(() => {});
    });
    await pg.send('Page.enable'); await pg.send('Runtime.enable'); await pg.send('Log.enable').catch(() => {});
    await pg.send('Emulation.setDeviceMetricsOverride', { width: largura, height: altura, deviceScaleFactor: 1, mobile: false });
    if (externa) {
      await esp(400);
      for (let i = 0; i < 5; i++) {
        const nav = await pg.send('Page.navigate', { url });
        if (!nav.errorText) break;
        await esp(500);
      }
    }
    pg.espera = async (expr, ms = 10000) => { const fim = Date.now() + ms; while (Date.now() < fim) { try { if (await pg.ev(expr)) return true; } catch (e) {} await esp(250); } return false; };
    pg.fecha = async () => { try { pg.close(); await fetch(`http://127.0.0.1:${porta}/json/close/${r.id}`); } catch (e) {} };
    pg.tamanho = (w, h) => pg.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    pg.clique = async (x, y) => { for (const t of ['mousePressed', 'mouseReleased']) await pg.send('Input.dispatchMouseEvent', { type: t, x, y, button: 'left', clickCount: 1 }); };
    pg.foto = async (arq) => { const s = await pg.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(arq, Buffer.from(s.data, 'base64')); };
    return pg;
  };
  // fala com o service worker da extensão (chrome.storage de verdade)
  B.sw = async () => { const t = (await get(`http://127.0.0.1:${porta}/json`)).find((x) => x.type === 'service_worker'); return conectar(t.webSocketDebuggerUrl); };
  B.fechar = (manterPerfil) => { try { proc.kill('SIGKILL'); } catch (e) {} if (!manterPerfil) { try { fs.rmSync(perfil, { recursive: true, force: true }); } catch (e) {} } };
  return B;
}

// Relatório simples: cada verificação conta; no fim sai com código 1 se algo falhou.
function relatorio(titulo) {
  let ok = 0, ruim = 0; const falhas = [];
  const t = (nome, cond, extra = '') => { cond ? ok++ : (ruim++, falhas.push(nome + (extra ? '  ' + extra : ''))); console.log((cond ? '  ok  ' : ' FALHOU') + ' ' + nome + (extra && !cond ? '  ' + extra : '')); };
  const fim = () => { console.log(`\n${titulo}: ${ok} ok, ${ruim} falhou`); if (ruim) { console.log(falhas.map((f) => ' - ' + f).join('\n')); process.exit(1); } process.exit(0); };
  return { t, fim, sec: (s) => console.log('\n' + s) };
}

module.exports = { abrir, conectar, get, esp, relatorio, RAIZ };
