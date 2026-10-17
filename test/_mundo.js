// Mundo de teste: o script da página (jsdom) e o fundo da extensão (vm) conversando de verdade. Usado pela bateria e pelo estresse.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const vm = require('vm');
const contentSrc = fs.readFileSync(__dirname + '/../extension/content.js', 'utf8');

async function mundo({ ajustes = {}, loja: lojaInicial = {} } = {}) {
  const loja = { ajustes, ...lojaInicial }; // armazenamento do script da página (chrome.storage.local da aba)
  // ---- fundo da extensão (service worker)
  const mem = {};
  const painel = { habilitado: null, desabilitacoes: 0, aberturas: 0, portas: new Set() };
  let ouveBg = null, comando = null, aoConectar = null;
  let ouveConteudo = null;
  const salvos = []; // o que o "servidor" recebeu
  const badges = [];
  const criadas = [];
  const removidas = [];
  let aoInstalar = null;
  const atualizadas = [];
  const criadasOpts = [];
  const titulos = [];
  const bg = {
    storage: { local: {
      get: async (k) => JSON.parse(JSON.stringify(k === null ? mem : typeof k === 'string' ? (k in mem ? { [k]: mem[k] } : {}) : Array.isArray(k) ? Object.fromEntries(k.filter((x) => x in mem).map((x) => [x, mem[x]])) : {})), // cópia, como o navegador de verdade
      set: async (o) => Object.assign(mem, JSON.parse(JSON.stringify(o))),
      remove: async (ks) => [].concat(ks).forEach((k) => delete mem[k]),
    }, onChanged: { addListener() {} } },
    downloads: { download: async () => 1, show() {} },
    runtime: { onMessage: { addListener: (f) => (ouveBg = f) }, onConnect: { addListener: (f) => (aoConectar = f) }, onInstalled: { addListener: (f) => (aoInstalar = f) }, onStartup: { addListener() {} }, reload() {}, getManifest: () => ({ version: '0', version_name: '' }), getURL: (p) => 'chrome-extension://abc/' + p },
    sidePanel: {
      setPanelBehavior: async () => {},
      setOptions: async (o) => { if (o.enabled === false) { painel.habilitado = false; painel.desabilitacoes++; } else if (o.enabled === true) painel.habilitado = true; },
      open: async () => { if (painel.habilitado === false) throw new Error('painel desabilitado'); painel.aberturas++; },
      close: async () => { painel.habilitado = false; painel.fechamentos = (painel.fechamentos || 0) + 1; }, // fecha; na vida real segue habilitado
    },
    action: { enable: async () => {}, disable: async () => {}, setBadgeText: async (o) => { badges.push(o); }, setBadgeBackgroundColor: async () => {}, setTitle: async (o) => { titulos.push(o.title); } },
    tabs: {
      onUpdated: { addListener() {} }, onActivated: { addListener() {} }, get: async () => ({}),
      create: async (o) => { criadas.push(o.url); criadasOpts.push(o); return { id: 100 + criadas.length }; },
      remove: async (id) => { removidas.push(id); },
      update: async (id, o) => { atualizadas.push({ id, ...o }); },
      query: async () => [{ id: 7, url: 'https://meet.google.com/abc-defg-hij' }],
      sendMessage: async (id, m) => { if (ouveConteudo) return new Promise((res) => { const r = ouveConteudo(m, {}, res); if (r !== true) res(undefined); }); },
    },
    alarms: { create() {}, onAlarm: { addListener() {} } },
    commands: { onCommand: { addListener: (f) => (comando = f) } },
  };
  const fetchBg = async (url, op) => {
    if (url.endsWith('/pair')) return { ok: true, status: 200, json: async () => ({ token: 'tk' }) };
    if (url.endsWith('/save')) { salvos.push(JSON.parse(op.body)); return { ok: true, status: 200, json: async () => ({ ok: true, arquivo: 'x.md' }) }; }
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  const ctx = vm.createContext({ chrome: bg, fetch: fetchBg, console, URL, TextEncoder, setTimeout, clearTimeout, importScripts: (...arqs) => arqs.forEach((f) => vm.runInContext(fs.readFileSync(__dirname + '/../extension/' + f, 'utf8'), ctx)), self: null });
  ctx.self = ctx;
  vm.runInContext(fs.readFileSync(__dirname + '/../extension/background.js', 'utf8'), ctx);

  // ---- página do Meet (script de conteúdo)
  const dom = new JSDOM('<!doctype html><title>Reunião</title><body><button id="sair" aria-label="Sair da chamada">sair</button><button id="cc" aria-label="Desativar legendas (c)">cc</button><div role="region" aria-label="Legendas"></div></body>',
    { url: 'https://meet.google.com/abc-defg-hij', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', { get() { return this.textContent; } });
  let agora = 1_000_000;
  const ints = [], touts = [];
  w.Date.now = () => agora;
  w.setInterval = (f, ms) => { ints.push({ f, ms }); return ints.length; };
  w.clearInterval = (id) => { if (ints[id - 1]) ints[id - 1].morto = true; };
  w.clearTimeout = (id) => { if (touts[id - 1]) touts[id - 1].feito = true; };
  w.setTimeout = (f, ms) => { touts.push({ f, em: agora + ms }); return touts.length; };
  const aoMudarLoja = [];
  const msgsParaBg = [];
  w.chrome = {
    runtime: { id: 'x',
      onMessage: { addListener: (f) => (ouveConteudo = f) },
      sendMessage: (m) => { msgsParaBg.push(m); return new Promise((res) => { const r = ouveBg(m, { tab: { id: 7 } }, res); if (r !== true) res(undefined); }); } },
    storage: { local: {
      get: (k) => {
        const ks = k == null ? Object.keys(loja) : [].concat(k);
        const o = {};
        ks.forEach((x) => { if (x in loja) o[x] = JSON.parse(JSON.stringify(loja[x])); });
        return Promise.resolve(o);
      },
      set: (o) => { Object.assign(loja, JSON.parse(JSON.stringify(o))); return Promise.resolve(); },
    }, onChanged: { addListener: (f) => aoMudarLoja.push(f) } },
  };
  w.eval(contentSrc);
  const tick = async (ms) => {
    for (let r = ms; r > 0; r -= 100) {
      agora += Math.min(100, r);
      ints.forEach((i) => { if (!i.morto && Math.floor(agora / 100) % Math.max(1, Math.round(i.ms / 100)) === 0) i.f(); });
      touts.filter((x) => x.em <= agora && !x.feito).forEach((x) => { x.feito = true; x.f(); });
      await new Promise((r2) => setImmediate(r2));
    }
  };
  await tick(2500);
  const raiz = () => w.document.getElementById('talktrail-host').shadowRoot;
  const fab = () => raiz().querySelector('.fab');
  const cmdPainel = (c, extra = {}) => new Promise((res) => ouveConteudo({ type: 'cmd', cmd: c, ...extra }, {}, res));
  const estado = async () => cmdPainel('estado').catch(() => null);
  const conectarPainel = () => {
    let recebe = null;
    const porta = { name: 'painel', recebidas: [], postMessage(m) { this.recebidas.push(m); }, onMessage: { addListener: (f) => (recebe = f) }, onDisconnect: { addListener() {} } };
    aoConectar(porta);
    recebe({ tabId: 7 });
    return porta;
  };
  const sairDaChamada = (comTela = true) => {
    w.document.getElementById('sair').remove();
    if (comTela) w.document.body.append(Object.assign(w.document.createElement('p'), { textContent: 'Você saiu da reunião' }));
  };
  const voltarPraChamada = () => {
    [...w.document.body.querySelectorAll('p')].forEach((p) => p.remove());
    if (!w.document.getElementById('sair')) w.document.body.prepend(Object.assign(w.document.createElement('button'), { id: 'sair', ariaLabel: 'Sair da chamada' }));
    w.document.getElementById('sair').setAttribute('aria-label', 'Sair da chamada');
  };
  const reunioes = () => Object.values(mem).filter((v) => v && v.payload).map((v) => v.payload);
  const fala = (txt, quem = 'Eu') => {
    const r = w.document.querySelector('[role="region"]');
    r.innerHTML = `<div><div>${quem}\n${txt}</div><div></div></div>`; // bloco: primeira linha o falante, o resto a fala (o segundo bloco vazio é como no Meet)
  };
  return { mudouLoja: (c) => aoMudarLoja.forEach((f) => f(c)), instalar: (d) => aoInstalar && aoInstalar(d), bgMensagem: (msg, tabId) => ouveBg(msg, { tab: { id: tabId } }, () => {}), atualizadas, criadas, criadasOpts, removidas, badges, titulos, bgCtx: ctx, loja, tick, raiz, fab, cmdPainel, estado, conectarPainel, sairDaChamada, voltarPraChamada, reunioes, painel, msgsParaBg, salvos, comando: (c) => comando(c), fala, w };
}

module.exports = { mundo };
