importScripts('i18n-en.js', 'i18n.js', 'md.js', 'pasta.js', 'pautas-arquivo.js'); // MB_MD: gera o .md no navegador; MB_PASTA: pasta escolhida pela pessoa (modo simples)
// só no build de desenvolvimento (version_name com "dev"): recarrega a extensão sozinha quando os arquivos mudam.
// O pacote da loja não leva esse arquivo nem o version_name (ver tools/empacotar.py).
if (/dev/.test(chrome.runtime.getManifest().version_name || '')) importScripts('dev-hot.js');

const SERVER = 'http://127.0.0.1:8787';
const MEET = /^https:\/\/meet\.google\.com\//;
let gravandoAgora = false;

// o painel abre em qualquer aba: no Meet mostra a reunião; fora dele, as reuniões de hoje e a pauta de cada uma
async function ajustar(tabId) {
  try {
    await chrome.sidePanel.setOptions({ tabId, path: 'panel.html', enabled: true });
    await chrome.action.enable(tabId);
  } catch (e) {}
}

function iniciarComportamento() {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  chrome.sidePanel.setOptions({ enabled: true, path: 'panel.html' }).catch(() => {});
  atualizarContagem().catch(() => {});
}
chrome.runtime.onInstalled.addListener(iniciarComportamento);
// só na primeira instalação (atualizar ou recarregar não abre de novo)
chrome.runtime.onInstalled.addListener((d) => {
  if (d && d.reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('boas-vindas.html') }).catch(() => {});
});
chrome.runtime.onStartup.addListener(iniciarComportamento);

chrome.tabs.onUpdated.addListener((id, info, tab) => {
  if (info.url || info.status === 'complete') ajustar(id);
});
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    ajustar(tabId);
  } catch (e) {}
});

// Pareamento: a primeira vez, a extensão pede o código secreto ao servidor e guarda. Daí em diante
// só ela (esse código, nessa origem) consegue gravar. Se o servidor foi pareado com outra, a mensagem diz como resolver.
async function cabecalhos(token) {
  const h = { 'Content-Type': 'application/json', 'X-Talktrail': '1' };
  if (token) h['X-Meet-Token'] = token;
  return h;
}
async function parear() {
  const r = await fetch(SERVER + '/pair', { method: 'POST', headers: await cabecalhos(), body: '{}' });
  const d = await r.json().catch(() => ({}));
  if (d.token) await chrome.storage.local.set({ pareamento: d.token });
  return { token: d.token || null, status: r.status, erro: d.erro };
}
async function enviar(payload, token) {
  const r = await fetch(SERVER + '/save', { method: 'POST', headers: await cabecalhos(token), body: JSON.stringify(payload) });
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
}
async function salvarNoServidor(payload) {
  let { pareamento } = await chrome.storage.local.get('pareamento');
  if (!pareamento) {
    const p = await parear();
    if (!p.token) return { ok: false, status: p.status, data: { erro: p.erro || trad('não consegui parear com o servidor') } };
    pareamento = p.token;
  }
  let r = await enviar(payload, pareamento);
  if (r.status === 403 && r.data.parear) {
    // o servidor esqueceu o pareamento (ou foi resetado): pareia de novo uma vez
    const p = await parear();
    if (p.token) r = await enviar(payload, p.token);
    else r.data.erro = p.erro || r.data.erro;
  }
  return r;
}

// ---------- biblioteca e modo simples ----------
// Toda reunião é guardada na biblioteca da extensão. Se o servidor da pasta ao vivo responde, o arquivo
// vai pra pasta dele; se não, ao terminar a reunião o arquivo é baixado em Downloads/Talktrail/AAAA-MM/.
const CHAVE = (id) => 'reuniao:' + String(id);
let servidorForaAte = 0; // depois de uma falha de rede, não insiste por 20 s

async function guardarNaBiblioteca(payload) {
  const chave = CHAVE(payload.id);
  const atual = (await chrome.storage.local.get(chave))[chave] || {};
  const reg = { ...atual, id: String(payload.id), atualizadoEm: Date.now(), payload };
  await chrome.storage.local.set({ [chave]: reg });
  return reg;
}

async function nomeUnico(caminho, id) {
  const todos = await chrome.storage.local.get(null);
  const usados = new Set(Object.values(todos).filter((v) => v && typeof v === 'object' && v.arquivo && v.id !== id).map((v) => v.arquivo));
  if (!usados.has(caminho)) return caminho;
  const base = caminho.replace(/\.md$/, '');
  let n = 2;
  while (usados.has(`${base}-${n}.md`)) n++;
  return `${base}-${n}.md`;
}

async function baixarArquivo(reg) {
  const { texto } = MB_MD.render(reg.payload);
  if (!reg.arquivo) {
    reg.arquivo = await nomeUnico(`${MB_MD.pasta(reg.payload)}/${MB_MD.nomeArquivo(reg.payload)}`, reg.id);
  }
  reg.downloadId = await chrome.downloads.download({
    url: 'data:text/markdown;charset=utf-8,' + encodeURIComponent(texto),
    filename: 'Talktrail/' + reg.arquivo,
    conflictAction: 'overwrite', // a mesma reunião salva de novo (Desfazer) troca o arquivo, não duplica
    saveAs: false,
  });
  await chrome.storage.local.set({ [CHAVE(reg.id)]: reg });
}

async function ajustesAtuais() {
  const { ajustes } = await chrome.storage.local.get('ajustes');
  return { baixarAoTerminar: true, apagarAntigas: 'nunca', ...(ajustes && typeof ajustes === 'object' ? ajustes : {}) };
}

async function salvarReuniao(payload) {
  // reunião sem nada pra guardar: nada na biblioteca, nada no servidor, nada em Downloads
  if (MB_MD.vazia(payload)) {
    if (payload.endedAt) await chrome.storage.local.remove(CHAVE(payload.id));
    try {
      let { pareamento } = await chrome.storage.local.get('pareamento');
      if (pareamento && Date.now() >= servidorForaAte) await enviar(payload, pareamento); // o servidor apaga o arquivo vazio que sobrou
    } catch (e) {}
    return { ok: true, status: 200, modo: 'vazia', data: { vazia: true } };
  }
  const reg = await guardarNaBiblioteca(payload);
  const aj = await ajustesAtuais();
  let r = null;
  let fora = false;
  if (Date.now() < servidorForaAte) {
    fora = true;
  } else {
    try {
      r = await salvarNoServidor(payload);
    } catch (e) {
      fora = true;
      servidorForaAte = Date.now() + 20000;
    }
  }
  if (r && r.ok) return { ok: true, status: 200, modo: 'pasta', data: r.data };
  // Sem o servidor, mas com uma pasta escolhida no navegador: grava ao vivo nela. Sem permissão ativa, cai pro plano B
  // (Downloads, ao terminar) e marca que a pasta precisa de um clique pra ser liberada.
  const alvo = await MB_PASTA.ler().catch(() => null);
  if (alvo && !(r && r.ok)) {
    try {
      if (await MB_PASTA.permissao(alvo, false)) {
        if (!reg.arquivo) reg.arquivo = await nomeUnico(`${MB_MD.pasta(reg.payload)}/${MB_MD.nomeArquivo(reg.payload)}`, reg.id);
        await MB_PASTA.escrever(alvo, reg.arquivo, MB_MD.render(reg.payload).texto);
        reg.naPasta = true;
        await chrome.storage.local.set({ [CHAVE(reg.id)]: reg, pastaPendente: false });
        return { ok: true, status: 200, modo: 'navegador', foraDoServidor: true, data: {} };
      }
    } catch (e) {}
    await chrome.storage.local.set({ pastaPendente: true });
  }
  const final = !!payload.endedAt;
  let baixou = false;
  // baixar em Downloads ao terminar é o padrão; com o ajuste desligado a reunião fica só na biblioteca
  if (final && aj.baixarAoTerminar !== false) {
    try {
      await baixarArquivo(reg);
      baixou = true;
    } catch (e) {}
  }
  // o servidor respondeu com um erro definido (não pareado, pasta sem permissão...): avisa, a reunião está na extensão
  if (r && !fora) return { ok: false, status: r.status, data: r.data, modo: baixou ? 'downloads' : 'extensao' };
  // sem servidor: é o modo simples, e isso é normal, não é erro
  return { ok: true, status: 200, modo: baixou ? 'downloads' : 'extensao', foraDoServidor: true, data: {} };
}

// "Mostrar na pasta" do aviso de salvo: o servidor abre o gerenciador de arquivos com o arquivo selecionado;
// sem servidor, o próprio navegador mostra o arquivo baixado. Nunca recebe caminho de fora, só o id da reunião.
async function mostrarNaPasta(id) {
  try {
    const { pareamento } = await chrome.storage.local.get('pareamento');
    if (pareamento && Date.now() >= servidorForaAte) {
      const r = await fetch(SERVER + '/mostrar', { method: 'POST', headers: await cabecalhos(pareamento), body: JSON.stringify({ id: String(id) }) });
      if (r.ok) return { ok: true, modo: 'pasta' };
    }
  } catch (e) {}
  const reg = (await chrome.storage.local.get(CHAVE(id)))[CHAVE(id)] || {};
  if (reg.downloadId !== undefined && reg.downloadId !== null) {
    try {
      chrome.downloads.show(reg.downloadId);
      return { ok: true, modo: 'downloads' };
    } catch (e) {}
  }
  return { ok: false };
}

async function escolherPasta() {
  let { pareamento } = await chrome.storage.local.get('pareamento');
  if (!pareamento) {
    const p = await parear();
    pareamento = p.token;
  }
  const r = await fetch(SERVER + '/escolher-pasta', { method: 'POST', headers: await cabecalhos(pareamento), body: '{}' });
  return r.json().catch(() => ({ ok: false }));
}

chrome.runtime.onMessage.addListener((msg, sender, responder) => {
  if (msg.type === 'state' && msg.state) {
    gravandoAgora = msg.state.fase === 'gravando';
    if (sender.tab) {
      const erro = gravandoAgora && (msg.state.erro || msg.state.legendas === false);
      chrome.action.setBadgeText({ tabId: sender.tab.id, text: erro ? '!' : gravandoAgora ? 'REC' : '' }).catch(() => {});
      chrome.action.setBadgeBackgroundColor({ color: erro ? '#D97706' : '#DC2626' }).catch(() => {});
    }
  }
  if (msg.type === 'sincronizar-pautas') {
    sincronizarPautas().then(() => responder({ ok: true })).catch(() => responder({ ok: false }));
    return true;
  }
  if (msg.type === 'mostrar') {
    mostrarNaPasta(msg.id).then(responder).catch(() => responder({ ok: false }));
    return true;
  }
  if (msg.type === 'escolher-pasta-navegador') {
    chrome.windows.create({ url: chrome.runtime.getURL('boas-vindas.html?so=pasta'), type: 'popup', width: 560, height: 400 }).catch(() => {});
  }
  if (msg.type === 'pasta-oferecida') {
    chrome.storage.local.get('ajustes').then(({ ajustes }) => chrome.storage.local.set({ ajustes: { ...(ajustes || {}), pastaOferecida: true } })).catch(() => {});
  }
  if (msg.type === 'escolher-pasta') {
    escolherPasta().then(responder).catch((e) => responder({ ok: false, erro: String(e) }));
    return true;
  }
  if (msg.type === 'save') {
    salvarReuniao(msg.payload)
      .then((r) => responder(r))
      .catch((e) => responder({ ok: false, status: 0, error: String(e) }));
    return true;
  }
  if (msg.type === 'atualizar-agenda') {
    atualizarAgenda(msg.dias, msg.desde).catch(() => {}); // só chega aqui quando a pessoa toca num botão de atualizar
    return false;
  }
  if (msg.type === 'cancelar-agenda') {
    fecharAbaAtualizacao(); // a pessoa mandou parar: fecha as abas de leitura na hora
    return false;
  }
  if (msg.type === 'agenda-lida' && sender.tab && abasAtualizacao.has(sender.tab.id)) {
    const resto = filaDias.get(sender.tab.id);
    if (resto && resto.length) chrome.tabs.update(sender.tab.id, { url: resto.shift() }).catch(() => {}); // próximo dia na mesma aba
    else fecharAbaAtualizacao(sender.tab.id);
  }
  if (msg.type === 'open-panel' && sender.tab) {
    chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => {});
  }
  if (msg.type === 'em-chamada' && sender.tab) {
    chrome.sidePanel.setOptions({ tabId: sender.tab.id, path: 'panel.html', enabled: true }).catch(() => {});
  }
  if (msg.type === 'fim' && sender.tab) {
    // reunião acabou: fecha o painel nessa aba (ele segue disponível pra ver as próximas reuniões)
    if (chrome.sidePanel.close) chrome.sidePanel.close({ tabId: sender.tab.id }).catch(() => {});
    else chrome.sidePanel.setOptions({ tabId: sender.tab.id, enabled: false }).catch(() => {});
    chrome.action.setBadgeText({ tabId: sender.tab.id, text: '' }).catch(() => {});
  }
  return false;
});

// ---------- apagar reuniões antigas da biblioteca (ajuste; padrão: nunca) ----------
// Só a biblioteca da extensão. Arquivo já baixado ou na pasta ao vivo não é tocado. Reunião em andamento nunca é apagada.
async function limparAntigas() {
  const aj = await ajustesAtuais();
  const dias = Number(aj.apagarAntigas);
  if (!dias) return 0;
  const limite = Date.now() - dias * 86400000;
  const todos = await chrome.storage.local.get(null);
  const apagar = Object.entries(todos)
    .filter(([k, v]) => k.startsWith('reuniao:') && v && v.payload)
    .filter(([, v]) => Date.now() - (v.atualizadoEm || 0) > 6 * 3600000) // algo gravado nas últimas 6 h pode estar em andamento
    .filter(([, v]) => {
      const d = new Date(v.payload.startedAt).getTime();
      return Number.isFinite(d) && d < limite;
    })
    .map(([k]) => k);
  if (apagar.length) await chrome.storage.local.remove(apagar);
  return apagar.length;
}
chrome.alarms.create('limpeza', { periodInMinutes: 360 });
chrome.runtime.onStartup.addListener(() => limparAntigas().catch(() => {}));
chrome.storage.onChanged.addListener((c) => {
  if (c.ajustes) limparAntigas().catch(() => {});
});

// o painel avisa que está aberto (e em qual aba) por uma porta; é assim que o atalho consegue fechá-lo
const paineis = new Map(); // porta -> id da aba
chrome.runtime.onConnect.addListener((porta) => {
  if (porta.name !== 'painel') return;
  paineis.set(porta, null);
  porta.onMessage.addListener((m) => { if (m && typeof m.tabId === 'number') paineis.set(porta, m.tabId); });
  porta.onDisconnect.addListener(() => paineis.delete(porta));
});

// atalhos de teclado: só três, pra não virar decoreba (abrir/fechar o painel, Transcrever/Parar, Marcar momento)
const COMANDOS = { 'marcar-momento': 'mark', 'transcrever-ou-parar': 'alternar' };
chrome.commands.onCommand.addListener(async (comando) => {
  if (comando === 'alternar-painel') {
    const [ativa] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!ativa) return;
    const aberto = [...paineis].find(([, id]) => id === ativa.id);
    if (aberto) aberto[0].postMessage({ fechar: true });
    else chrome.sidePanel.open({ tabId: ativa.id }).catch(() => {});
    return;
  }
  if (!COMANDOS[comando]) return;
  const abas = await chrome.tabs.query({ url: 'https://meet.google.com/*', active: true });
  const aba = abas[0] || (await chrome.tabs.query({ url: 'https://meet.google.com/*' }))[0];
  if (aba) chrome.tabs.sendMessage(aba.id, { type: 'cmd', cmd: COMANDOS[comando] }).catch(() => {});
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'limpeza') limparAntigas().catch(() => {});
  if (a.name === 'contagem') atualizarContagem().catch(() => {});
  if (a.name === 'pautas') sincronizarPautas().catch(() => {});
});

// ---------- agenda do Meet e contagem no ícone ----------
// Abas de fundo que leem as reuniões de hoje na tela inicial do Meet (conta principal e a segunda conta, se houver)
// e fecham sozinhas. Cada conta do Google tem a sua lista.
const abasAtualizacao = new Set();
let fechaAbas = null;
function fecharAbaAtualizacao(id) {
  if (id === undefined) {
    clearTimeout(fechaAbas);
    abasAtualizacao.forEach((i) => chrome.tabs.remove(i).catch(() => {}));
    abasAtualizacao.clear();
    filaDias.clear();
    return;
  }
  filaDias.delete(id);
  if (abasAtualizacao.delete(id)) chrome.tabs.remove(id).catch(() => {});
  if (!abasAtualizacao.size) clearTimeout(fechaAbas);
}
const filaDias = new Map(); // aba -> endereços dos próximos dias, ainda por ler
const DIAS_DA_AGENDA = 7; // padrão: uma semana, pra segunda e terça da semana seguinte aparecerem numa sexta (a página de Pautas pede mais)
async function atualizarAgenda(dias = DIAS_DA_AGENDA, desde = '') {
  dias = Math.max(1, Math.min(21, Number(dias) || DIAS_DA_AGENDA));
  const base = /^\d{4}-\d{2}-\d{2}$/.test(String(desde)) ? new Date(`${desde}T12:00:00`).getTime() : 0; // um dia escolhido no calendário
  if (abasAtualizacao.size) return; // já tem leitura em andamento
  const pad = (n) => String(n).padStart(2, '0');
  for (const conta of [0, 1]) {
    const urls = Array.from({ length: dias }, (_, n) => {
      const d = new Date((base || Date.now()) + n * 86400000);
      return n === 0 && !base ? `https://meet.google.com/home?authuser=${conta}` : `https://meet.google.com/home/${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}?authuser=${conta}`;
    });
    const aba = await chrome.tabs.create({ url: urls[0], active: false });
    abasAtualizacao.add(aba.id);
    filaDias.set(aba.id, urls.slice(1));
  }
  fechaAbas = setTimeout(() => fecharAbaAtualizacao(), 30000 + dias * 12000); // sem login ou sem lista: não deixa aba aberta
}

const diaLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Próxima reunião de HOJE que ainda não começou. Longe demais (mais de 8 h) ou de outro dia: não cutuca.
function proximaDeHoje(agenda, agora = new Date()) {
  const hoje = diaLocal(agora);
  const min = agora.getHours() * 60 + agora.getMinutes();
  let melhor = null;
  for (const a of Array.isArray(agenda) ? agenda : []) {
    if (!a || a.data !== hoje || !/^\d{1,2}:\d{2}$/.test(a.hora || '')) continue;
    const [h, m] = a.hora.split(':').map(Number);
    const t = h * 60 + m;
    if (t >= min && (!melhor || t < melhor.t)) melhor = { t, a };
  }
  if (!melhor || melhor.t - min > 8 * 60) return null;
  const falta = melhor.t - min;
  const texto = falta < 60 ? `${falta}m` : falta % 60 ? `${Math.floor(falta / 60)}h${String(falta % 60).padStart(2, '0')}` : `${falta / 60}h`;
  return { texto, falta, titulo: melhor.a.titulo, hora: melhor.a.hora };
}
async function atualizarContagem() {
  const v = await chrome.storage.local.get(['agendaMeet']);
  const p = proximaDeHoje(v && v.agendaMeet);
  await chrome.action.setBadgeText({ text: p ? p.texto : '' });
  if (p) {
    await chrome.action.setBadgeBackgroundColor({ color: '#2DD4BF' });
    if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: '#0E0F12' });
  }
  await chrome.action.setTitle({ title: p ? trad('Talktrail: {0} às {1} (falta {2})', [p.titulo, p.hora, p.texto]) : 'Talktrail' });
}
chrome.alarms.create('contagem', { periodInMinutes: 1 });
chrome.storage.onChanged.addListener((c) => { if (c.agendaMeet) atualizarContagem().catch(() => {}); });
atualizarContagem().catch(() => {});

// ---------- pautas em arquivo ----------
// Pasta Pautas/ dentro da pasta de reuniões: um .md por reunião. Quem editou por último ganha (ver pautas-arquivo.js).
// Usa o servidor local, se estiver pareado; senão a pasta escolhida no navegador, se a permissão estiver ativa.
async function armazemDePautas() {
  const idioma = MB_IDIOMA.en ? 'en' : 'pt'; // só decide o nome da pasta quando ela ainda não existe (Pautas/ ou Agendas/)
  const { pareamento } = await chrome.storage.local.get('pareamento');
  if (pareamento && Date.now() >= servidorForaAte) {
    try {
      const chamar = async (caminho, corpo) => {
        const r = await fetch(SERVER + caminho, { method: 'POST', headers: await cabecalhos(pareamento), body: JSON.stringify({ idioma, ...corpo }) });
        return r.json().catch(() => ({ ok: false }));
      };
      const l = await chamar('/pautas/listar', {});
      if (l && l.ok) {
        return {
          tipo: 'servidor',
          pasta: l.pasta || 'Pautas',
          arquivos: l.arquivos || [],
          gravar: (nome, conteudo) => chamar('/pautas/gravar', { nome, conteudo }),
          apagar: (nome) => chamar('/pautas/apagar', { nome }),
        };
      }
    } catch (e) {
      servidorForaAte = Date.now() + 20000;
    }
  }
  const alvo = await MB_PASTA.ler().catch(() => null);
  if (alvo && (await MB_PASTA.permissao(alvo, false).catch(() => false))) {
    const pasta = await MB_PASTA.nomeDasPautas(alvo, idioma);
    const arquivosDaPasta = await MB_PASTA.listarPautas(alvo, pasta);
    return {
      tipo: 'pasta',
      pasta,
      arquivos: arquivosDaPasta,
      gravar: (nome, conteudo) => MB_PASTA.escrever(alvo, `${pasta}/${nome}`, conteudo),
      apagar: async (nome) => { // nunca apaga de vez: o arquivo vai pra _apagadas, dentro da própria pasta
        const velho = arquivosDaPasta.find((a) => a.nome === nome);
        if (velho) await MB_PASTA.escrever(alvo, `${pasta}/_apagadas/${Date.now()}_${nome}`, velho.conteudo);
        await MB_PASTA.apagar(alvo, `${pasta}/${nome}`);
      },
    };
  }
  return null;
}

let sincronizando = null;
let sincPendente = false;
async function sincronizarPautas() {
  if (sincronizando) { sincPendente = true; return sincronizando; }
  sincronizando = (async () => {
    try {
      const arm = await armazemDePautas();
      if (!arm) { await chrome.storage.local.set({ pautasSync: { modo: '', em: Date.now() } }); return; }
      const v = await chrome.storage.local.get(['pautas', 'pautasApagadas', 'pautasConhecidas', 'pautasSync', 'pautasAusentes', 'pautasLixeira']);
      const original = v.pautas || {};
      const r = MB_PAUTAS_ARQ.mesclar({ pautas: original, arquivos: arm.arquivos, apagadas: v.pautasApagadas || {}, hoje: diaLocal(new Date()), conhecidas: v.pautasConhecidas || [], ultimoSync: (v.pautasSync && v.pautasSync.em) || 0, confiavel: arm.arquivos.some((a) => MB_PAUTAS_ARQ.ehExplicacao(a.nome)), ausentesAntes: v.pautasAusentes || [], idioma: MB_PAUTAS_ARQ.idiomaDaPasta(arm.pasta) });
      for (const e of r.escrever) await arm.gravar(e.nome, e.conteudo);
      for (const nome of r.apagar) await arm.apagar(nome);
      const expl = MB_PAUTAS_ARQ.explicacao(MB_PAUTAS_ARQ.idiomaDaPasta(arm.pasta));
      const leia = arm.arquivos.find((a) => a.nome === expl.nome);
      if (!leia || leia.conteudo !== expl.texto) await arm.gravar(expl.nome, expl.texto); // mantém a explicação em dia
      if (!arm.arquivos.some((a) => MB_PAUTAS_ARQ.ehExplicacao(a.nome))) sincPendente = true; // pasta nova (ou listagem duvidosa): com o LEIA-ME no lugar, a próxima conversa já é confiável
      const grava = { pautasSync: { modo: arm.tipo, em: Date.now(), pasta: arm.pasta }, pautasConhecidas: r.conhecidas, pautasAusentes: r.ausentes };
      if (r.pautas) {
        // aplica só o que veio dos arquivos em cima do que está agora (a pessoa pode ter editado durante a conversa com a pasta)
        const agora = (await chrome.storage.local.get('pautas')).pautas || {};
        const juntas = { ...agora };
        for (const id of Object.keys(r.pautas)) {
          if (r.pautas[id] !== original[id] && (!agora[id] || JSON.stringify(agora[id]) === JSON.stringify(original[id]) || (agora[id].atualizada || 0) <= ((original[id] || {}).atualizada || 0))) juntas[id] = r.pautas[id];
        }
        const lixeira = [...(v.pautasLixeira || [])];
        for (const id of r.removidas) {
          if (JSON.stringify(agora[id]) !== JSON.stringify(original[id])) continue; // só se ninguém mexeu nela enquanto isso
          lixeira.push({ id, em: Date.now(), pauta: agora[id] }); // rede de segurança: a pauta removida pelo sincronizador fica guardada
          removidosPelaSync.add(id);
          delete juntas[id];
        }
        if (r.removidas.length) grava.pautasLixeira = lixeira.slice(-60);
        grava.pautas = juntas;
      }
      if (r.reapareceu.length) {
        const ap = { ...(v.pautasApagadas || {}) };
        r.reapareceu.forEach((id) => delete ap[id]);
        grava.pautasApagadas = ap;
      }
      await chrome.storage.local.set(grava);
    } catch (e) {
      // pasta sem permissão, servidor fora, disco cheio: tenta de novo no próximo minuto
    } finally {
      sincronizando = null;
      if (sincPendente) { sincPendente = false; setTimeout(() => sincronizarPautas().catch(() => {}), 1500); }
    }
  })();
  return sincronizando;
}
let tSincPautas = null;
const removidosPelaSync = new Set(); // remoções feitas pelo próprio sincronizador não viram "pauta apagada pela pessoa"
chrome.storage.onChanged.addListener((c) => {
  if (!c.pautas) return;
  // pauta apagada no navegador: anota, pro arquivo dela sair em vez de a pauta voltar
  const antes = c.pautas.oldValue || {};
  const depois = c.pautas.newValue || {};
  const sumiram = Object.keys(antes).filter((id) => !(id in depois) && !removidosPelaSync.has(id));
  setTimeout(() => removidosPelaSync.clear(), 5000);
  if (sumiram.length) {
    chrome.storage.local.get('pautasApagadas').then(({ pautasApagadas }) => {
      const ap = { ...(pautasApagadas || {}) };
      const corte = Date.now() - 30 * 86400000;
      for (const k of Object.keys(ap)) if (ap[k] < corte) delete ap[k];
      sumiram.forEach((id) => { ap[id] = Date.now(); });
      return chrome.storage.local.set({ pautasApagadas: ap });
    }).catch(() => {});
  }
  clearTimeout(tSincPautas);
  tSincPautas = setTimeout(() => sincronizarPautas().catch(() => {}), 1500);
});
chrome.alarms.create('pautas', { periodInMinutes: 1 });
sincronizarPautas().catch(() => {});
