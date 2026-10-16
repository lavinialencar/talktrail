// Modo simples: sem servidor, a reunião fica na biblioteca da extensão e, ao terminar, vira arquivo em Downloads.
const fs = require('fs');
const vm = require('vm');

let ok = 0, ruim = 0;
const t = (nome, cond, extra = '') => { cond ? ok++ : ruim++; console.log((cond ? '  ok  ' : ' FALHOU') + ' ' + nome + (extra ? '  ' + extra : '')); };

function ambiente({ servidor = 'fora' } = {}) {
  const mem = {};
  const baixados = [];
  const mostrados = [];
  const janelas = [];
  let ouvinte = null;
  let alarme = null;
  let comando = null;
  const enviadasAba = [];
  const painelAberto = [];
  let aoConectar = null;
  const chamadas = [];
  const chrome = {
    storage: {
      local: {
        get: async (k) => (k === null ? { ...mem } : typeof k === 'string' ? (k in mem ? { [k]: mem[k] } : {}) : {}),
        set: async (o) => Object.assign(mem, JSON.parse(JSON.stringify(o))),
        remove: async (ks) => [].concat(ks).forEach((k) => delete mem[k]),
      },
      onChanged: { addListener() {} },
    },
    downloads: { download: async (o) => { baixados.push(o); return baixados.length; }, show: (id) => mostrados.push(id) },
    runtime: { onMessage: { addListener: (f) => (ouvinte = f) }, onConnect: { addListener: (f) => (aoConectar = f) }, onInstalled: { addListener() {} }, onStartup: { addListener() {} }, reload() {}, getManifest: () => ({ version: '0', version_name: '' }), getURL: (p) => 'chrome-extension://abc/' + p },
    sidePanel: { setPanelBehavior: async () => {}, setOptions: async () => {}, open: async (o) => { painelAberto.push(o); } },
    action: { enable: async () => {}, disable: async () => {}, setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    tabs: {
      onUpdated: { addListener() {} }, onActivated: { addListener() {} }, get: async () => ({}),
      query: async () => [{ id: 7 }],
      sendMessage: async (id, m) => { enviadasAba.push({ id, m }); },
    },
    alarms: { create() {}, onAlarm: { addListener: (f) => (alarme = f) } },
    commands: { onCommand: { addListener: (f) => (comando = f) } },
    windows: { create: async (o) => { janelas.push(o); } },
  };
  const fetch = async (url, op) => {
    chamadas.push(url);
    if (servidor === 'fora') throw new TypeError('Failed to fetch');
    if (url.endsWith('/pair')) return { ok: true, status: 200, json: async () => ({ token: 'tk' }) };
    if (servidor === 'erro') return { ok: false, status: 500, json: async () => ({ erro: 'disco cheio' }) };
    return { ok: true, status: 200, json: async () => ({ ok: true, arquivo: 'x.md' }) };
  };
  const ctx = vm.createContext({ chrome, fetch, console, URL, TextEncoder, setTimeout, importScripts: (...arqs) => arqs.forEach((f) => vm.runInContext(fs.readFileSync(__dirname + '/../extension/' + f, 'utf8'), ctx)), self: null });
  ctx.self = ctx;
  vm.runInContext(fs.readFileSync(__dirname + '/../extension/background.js', 'utf8'), ctx);
  const salvar = (payload) => new Promise((res) => ouvinte({ type: 'save', payload }, { tab: { id: 1 } }, res));
  const mostrar = (id) => new Promise((res) => ouvinte({ type: 'mostrar', id }, {}, res));
  const conectarPainel = (tabId) => {
    let recebe = null;
    const porta = { name: 'painel', recebidas: [], postMessage(m) { this.recebidas.push(m); }, onMessage: { addListener: (f) => (recebe = f) }, onDisconnect: { addListener() {} } };
    aoConectar(porta);
    recebe({ tabId });
    return porta;
  };
  const mandar = (msg) => new Promise((res) => { const rr = ouvinte(msg, { tab: { id: 7 } }, res); if (rr !== true) res(undefined); });
  return { ctx, chrome, janelas, mandar, salvar, mostrar, mostrados, mem, baixados, chamadas, limpar: () => alarme({ name: 'limpeza' }), atalho: (c) => comando(c), enviadasAba, painelAberto, conectarPainel };
}

const base = { id: 's1', startedAt: '2026-10-11T22:00:00Z', titulo: 'Kickoff 🚀 do projeto', transcript: [{ t: 3, speaker: 'Ana', text: 'oi' }], marcas: [] };

(async () => {
  console.log('Sem servidor (modo simples)');
  let e = ambiente({ servidor: 'fora' });
  let r = await e.salvar(base);
  t('salva na biblioteca e responde ok (não é erro)', r.ok && r.modo === 'extensao' && r.foraDoServidor === true, JSON.stringify(r));
  t('guarda o registro completo', e.mem['reuniao:s1'] && e.mem['reuniao:s1'].payload.titulo === base.titulo);
  t('durante a reunião não baixa nada', e.baixados.length === 0);
  r = await e.salvar({ ...base, endedAt: '2026-10-11T22:30:00Z' });
  t('ao terminar, baixa o arquivo', e.baixados.length === 1 && r.modo === 'downloads');
  const d = e.baixados[0];
  t('em Downloads/Talktrail/AAAA-MM/data_hora_titulo.md', /^Talktrail\/\d{4}-\d{2}\/\d{4}-\d{2}-\d{2}_\d{2}h\d{2}_kickoff-do-projeto\.md$/.test(d.filename), d.filename);
  t('sem janela de "salvar como" e sobrescrevendo', d.saveAs === false && d.conflictAction === 'overwrite');
  const conteudo = decodeURIComponent(d.url.split(',').slice(1).join(','));
  t('o arquivo é o markdown da reunião', conteudo.startsWith('---\ntipo: reuniao') && conteudo.includes('**[00:03] Ana:** oi'));
  r = await e.salvar({ ...base, endedAt: '2026-10-11T22:31:00Z', notes: 'depois do Desfazer' });
  t('terminar de novo (Desfazer) troca o mesmo arquivo', e.baixados.length === 2 && e.baixados[1].filename === d.filename);
  r = await e.salvar({ ...base, id: 's2', endedAt: '2026-10-11T22:40:00Z' });
  t('outra reunião com mesmo nome e minuto ganha -2, não sobrescreve', e.baixados.length === 3 && e.baixados[2].filename !== d.filename && /-2\.md$/.test(e.baixados[2].filename), e.baixados[2].filename);
  const n = e.chamadas.length;
  await e.salvar({ ...base, id: 's3' });
  await e.salvar({ ...base, id: 's3', notes: 'x' });
  t('depois de uma falha de rede não fica insistindo no servidor', e.chamadas.length - n <= 1, `${e.chamadas.length - n} chamadas`);

  console.log('Com servidor');
  e = ambiente({ servidor: 'ok' });
  r = await e.salvar({ ...base, endedAt: '2026-10-11T22:30:00Z' });
  t('vai pra pasta ao vivo', r.ok && r.modo === 'pasta');
  t('não baixa em Downloads (já está na pasta)', e.baixados.length === 0);
  t('mesmo assim guarda na biblioteca', !!e.mem['reuniao:s1']);

  console.log('Servidor com erro definido');
  e = ambiente({ servidor: 'erro' });
  r = await e.salvar({ ...base, endedAt: '2026-10-11T22:30:00Z' });
  t('avisa o erro, mas a reunião não se perde', r.ok === false && r.status === 500 && !!e.mem['reuniao:s1']);
  t('e ao terminar baixa em Downloads por segurança', e.baixados.length === 1);

  console.log('Ajustes: baixar ao terminar');
  e = ambiente({ servidor: 'fora' });
  e.mem.ajustes = { baixarAoTerminar: false };
  r = await e.salvar({ ...base, endedAt: '2026-10-11T22:30:00Z' });
  t('desligado: não baixa nada e a reunião fica na biblioteca', e.baixados.length === 0 && !!e.mem['reuniao:s1'] && r.ok && r.modo === 'extensao');
  e = ambiente({ servidor: 'fora' });
  r = await e.salvar({ ...base, endedAt: '2026-10-11T22:30:00Z' });
  t('padrão (sem o ajuste): baixa', e.baixados.length === 1);

  console.log('Ajustes: apagar antigas');
  const agora = Date.now();
  const iso = (diasAtras) => new Date(agora - diasAtras * 86400000).toISOString();
  const preparar = (apagarAntigas) => {
    const x = ambiente({ servidor: 'fora' });
    x.mem.ajustes = { apagarAntigas };
    const reg = (id, dias, atualizadoHa = 99 * 3600000) => ({ id, atualizadoEm: agora - atualizadoHa, payload: { id, startedAt: iso(dias), titulo: id } });
    Object.assign(x.mem, {
      'reuniao:nova': reg('nova', 2),
      'reuniao:velha45': reg('velha45', 45),
      'reuniao:velha120': reg('velha120', 120),
      'reuniao:andamento': reg('andamento', 120, 1000), // começou há 120 dias (data falsa) mas foi mexida agora há pouco
    });
    return x;
  };
  let x = preparar('nunca');
  await x.limpar();
  await new Promise((r2) => setImmediate(r2));
  t('"Nunca" (padrão): não apaga nada', ['nova', 'velha45', 'velha120', 'andamento'].every((k) => !!x.mem['reuniao:' + k]));
  x = preparar('30');
  await x.limpar();
  await new Promise((r2) => setImmediate(r2));
  t('30 dias: apaga as de 45 e 120 dias, mantém a nova', !x.mem['reuniao:velha45'] && !x.mem['reuniao:velha120'] && !!x.mem['reuniao:nova']);
  t('...e nunca apaga a que foi mexida há pouco (pode estar em andamento)', !!x.mem['reuniao:andamento']);
  x = preparar('90');
  await x.limpar();
  await new Promise((r2) => setImmediate(r2));
  t('90 dias: apaga só a de 120', !!x.mem['reuniao:velha45'] && !x.mem['reuniao:velha120']);

  x = preparar('7');
  await x.limpar();
  await new Promise((r2) => setImmediate(r2));
  t('7 dias: apaga as de 45 e 120, mantém a de 2 dias', !x.mem['reuniao:velha45'] && !x.mem['reuniao:velha120'] && !!x.mem['reuniao:nova']);
  x = preparar('1');
  await x.limpar();
  await new Promise((r2) => setImmediate(r2));
  t('1 dia: apaga até a de 2 dias, mantém a que foi mexida há pouco', !x.mem['reuniao:nova'] && !!x.mem['reuniao:andamento']);

  console.log('Mostrar na pasta (aviso de salvo)');
  x = ambiente({ servidor: 'fora' });
  await x.salvar({ ...base, endedAt: '2026-10-11T22:30:00Z' });
  r = await x.mostrar('s1');
  t('sem servidor: o navegador mostra o arquivo baixado', r.ok && r.modo === 'downloads' && x.mostrados.length === 1 && x.mostrados[0] === 1, JSON.stringify(r));
  x = ambiente({ servidor: 'ok' });
  await x.salvar({ ...base, endedAt: '2026-10-11T22:30:00Z' });
  r = await x.mostrar('s1');
  t('com servidor: pede pro servidor abrir a pasta', r.ok && r.modo === 'pasta' && x.chamadas.some((u) => u.endsWith('/mostrar')), JSON.stringify(r));
  x = ambiente({ servidor: 'fora' });
  await x.salvar(base); // reunião ainda em andamento: nada foi baixado
  r = await x.mostrar('s1');
  t('sem arquivo nenhum: responde que não deu (o botão nem aparece)', r.ok === false && x.mostrados.length === 0);

  console.log('Atalho de teclado');
  x = ambiente({ servidor: 'fora' });
  await x.atalho('marcar-momento');
  t('o atalho manda "marcar" pra aba do Meet', x.enviadasAba.length === 1 && x.enviadasAba[0].m.cmd === 'mark' && x.enviadasAba[0].id === 7);
  await x.atalho('transcrever-ou-parar');
  t('o atalho de transcrever/parar manda "alternar" pra aba', x.enviadasAba.length === 2 && x.enviadasAba[1].m.cmd === 'alternar');
  await x.atalho('outro-comando');
  t('comando desconhecido não faz nada', x.enviadasAba.length === 2);

  console.log('Pasta escolhida pelo navegador (sem o servidor)');
  const pastaFalsa = (permissao) => {
    const gravados = {};
    const dir = (caminho) => ({
      getDirectoryHandle: async (n) => dir(caminho + n + '/'),
      getFileHandle: async (n) => ({ createWritable: async () => ({ write: async (txt) => { gravados[caminho + n] = txt; }, close: async () => {} }) }),
    });
    return { gravados, handle: { name: 'Reuniões', ...dir(''), queryPermission: async () => permissao.valor, requestPermission: async () => permissao.valor } };
  };
  let perm = { valor: 'granted' };
  let falsa = pastaFalsa(perm);
  x = ambiente({ servidor: 'fora' });
  x.ctx.MB_PASTA.ler = async () => falsa.handle;
  r = await x.salvar({ ...base, id: 'n1' }); // ainda transcrevendo
  const arquivos = Object.keys(falsa.gravados);
  t('com a pasta liberada, grava ao vivo na subpasta do mês', r.ok && r.modo === 'navegador' && arquivos.length === 1 && /^\d{4}-\d{2}\/.+\.md$/.test(arquivos[0]), JSON.stringify([r.modo, arquivos]));
  t('o conteúdo é o arquivo da reunião', /^---\ntipo: reuniao/.test(falsa.gravados[arquivos[0]]) && /Kickoff/.test(falsa.gravados[arquivos[0]]));
  t('e não baixa nada em Downloads', x.baixados.length === 0);
  r = await x.salvar({ ...base, id: 'n1', endedAt: '2026-10-11T22:30:00Z' });
  t('ao terminar, grava no mesmo arquivo (não cria outro)', Object.keys(falsa.gravados).length === 1 && r.modo === 'navegador');
  perm = { valor: 'prompt' };
  falsa = pastaFalsa(perm);
  x = ambiente({ servidor: 'fora' });
  x.ctx.MB_PASTA.ler = async () => falsa.handle;
  r = await x.salvar({ ...base, id: 'n2', endedAt: '2026-10-11T22:30:00Z' });
  t('sem a permissão ativa, cai pra Downloads (nada se perde)', r.ok && r.modo === 'downloads' && x.baixados.length === 1 && Object.keys(falsa.gravados).length === 0, JSON.stringify([r.modo, x.baixados.length]));
  t('e marca que a pasta precisa ser liberada', x.mem.pastaPendente === true);
  x = ambiente({ servidor: 'ok' });
  falsa = pastaFalsa({ valor: 'granted' });
  x.ctx.MB_PASTA.ler = async () => falsa.handle;
  r = await x.salvar({ ...base, id: 'n3' });
  t('com o servidor ligado, ele vence e a pasta do navegador não é usada', r.modo === 'pasta' && Object.keys(falsa.gravados).length === 0);

  console.log('Escolher a pasta pelo navegador: janelinha e oferta única');
  x = ambiente({ servidor: 'fora' });
  await x.mandar({ type: 'escolher-pasta-navegador' });
  t('abre a janelinha de escolher a pasta', x.janelas.length === 1 && /boas-vindas\.html\?so=pasta$/.test(x.janelas[0].url) && x.janelas[0].type === 'popup', JSON.stringify(x.janelas));
  x.mem.ajustes = { oferta: 'perguntar' };
  await x.mandar({ type: 'pasta-oferecida' });
  await new Promise((r2) => setImmediate(r2));
  t('marca que a oferta já foi feita, sem perder os outros ajustes', x.mem.ajustes.pastaOferecida === true && x.mem.ajustes.oferta === 'perguntar', JSON.stringify(x.mem.ajustes));

  console.log('Atalho: abrir ou fechar o painel');
  x = ambiente({ servidor: 'fora' });
  await x.atalho('alternar-painel');
  t('painel fechado: o atalho abre o painel da aba ativa', x.painelAberto.length === 1 && x.painelAberto[0].tabId === 7);
  const porta = x.conectarPainel(7);
  await x.atalho('alternar-painel');
  t('painel aberto: o atalho manda ele se fechar (e não abre outro)', porta.recebidas.length === 1 && porta.recebidas[0].fechar === true && x.painelAberto.length === 1);

  console.log(`\n${ok} ok, ${ruim} falharam`);
  process.exit(ruim ? 1 : 0);
})();
