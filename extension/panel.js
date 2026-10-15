const $ = (id) => document.getElementById(id);
// Tags: a pessoa cria as que quiser (projeto, status, pessoa...). A lista fica guardada aqui.
const SEMENTE = [];
let TAGS = [];
let usaServidor = false; // já pareou com o servidor da pasta ao vivo alguma vez
chrome.storage.local.get(['pareamento', 'pastaPendente']).then((v) => {
  usaServidor = !!v.pareamento;
  pastaPendente = !!v.pastaPendente;
});
chrome.storage.onChanged.addListener((c) => {
  if (c.pareamento) usaServidor = !!c.pareamento.newValue;
  if (c.pastaPendente) {
    pastaPendente = !!c.pastaPendente.newValue;
    if (typeof ultimo !== 'undefined' && ultimo) aplicar(ultimo);
  }
});
// E-mail que recebe os relatos de problema. Vazio = o e-mail abre sem destinatário (a pessoa escolhe ou usa "Copiar o relatório").
const EMAIL_SUPORTE = 'talktrail@lavinialencar.com.br';
let servidorOk = true; // avisa ANTES de gravar se o servidor local não está de pé
let pastaServidor = '';
async function checarServidor() {
  const antes = servidorOk;
  try {
    const r = await fetch('http://127.0.0.1:8787/health', { cache: 'no-store' });
    servidorOk = r.ok;
    const d = await r.json().catch(() => ({}));
    if (d.out && d.out !== pastaServidor) pastaServidor = d.out;
  } catch (e) {
    servidorOk = false;
  }
  pintarPasta();
  if (servidorOk !== antes && ultimo) aplicar(ultimo);
}

// ---------- ajustes (engrenagem) ----------
const TEXTO_CHAT = 'Estou transcrevendo esta reunião (só o texto, sem gravar áudio nem vídeo) no meu computador, com o Talktrail. Nada vai pra nuvem.';
// um texto salvo que é uma versão antiga do padrão (começa igual, mas não tem o nome atual) migra pro padrão novo
const ehTextoPadraoAntigo = (t) => /^Estou (gravando e )?transcrevendo esta reunião/.test(String(t || '')) && !String(t).includes('Talktrail');
let AJ = { oferta: 'perguntar', avisoChat: 'nunca', salvarChat: false, textoChat: TEXTO_CHAT, palavras: [], baixarAoTerminar: true, apagarAntigas: 'nunca' };
function salvarAjustes() {
  chrome.storage.local.set({ ajustes: AJ });
}
// "…/04 Recursos/Meet": só as duas últimas pastas
function caminhoCurto(caminho) {
  const partes = String(caminho || '').split(/[\\/]+/).filter(Boolean);
  return partes.length > 3 ? '…/' + partes.slice(-2).join('/') : String(caminho || '');
}
let pastaNavegador = null; // pasta escolhida pelo navegador (sem o servidor): { name }
let pastaPendente = false; // o navegador precisa de um clique pra liberar a pasta de novo
const rotuloDe = (id, texto) => ($(id).querySelector('span') || $(id)).replaceChildren(texto);
async function lerPastaNavegador() {
  try {
    pastaNavegador = await MB_PASTA.ler();
  } catch (e) {
    pastaNavegador = null;
  }
  pintarPasta();
}
// Onde baixar o complemento quando o instalador não vem dentro da extensão (pacote da loja).
// Preencher com a página de releases do GitHub quando o repositório existir.
const URL_COMPLEMENTO = '';
// O instalador só vem embutido no build de desenvolvimento (version_name com "dev"); o pacote da loja usa o link.
const instaladorEmbutido = /dev/.test(chrome.runtime.getManifest().version_name || '');
const instalavel = instaladorEmbutido || !!URL_COMPLEMENTO;
function pintarPasta() {
  const ao_vivo = servidorOk && !!pastaServidor;
  // com o complemento: escolher a pasta ao vivo e copiar o caminho. Sem ele: escolher uma pasta pelo navegador
  $('ajAbrir').hidden = false;
  $('ajInstalar').hidden = ao_vivo || !instalavel; // com o complemento já rodando, ou sem instalador à mão, não mostra
  $('ajCopiar').hidden = !ao_vivo && !pastaNavegador;
  rotuloDe('ajAbrir', ao_vivo ? 'Escolher a pasta ao vivo…' : pastaNavegador ? 'Trocar a pasta…' : 'Escolher uma pasta…');
  rotuloDe('ajCopiar', ao_vivo ? 'Copiar o caminho' : 'Voltar pra Downloads');
  if (!ao_vivo && pastaNavegador) {
    $('ajPasta').textContent = `Pasta escolhida: ${pastaNavegador.name}`;
    $('ajPasta').title = '';
    $('ajPastaDica').textContent = 'Salva nela em tempo real, numa subpasta por mês. De vez em quando o navegador pede pra liberar a pasta de novo: é um clique. Enquanto isso, a reunião vai pra Downloads.';
    return;
  }
  if (ao_vivo) {
    $('ajPasta').textContent = caminhoCurto(pastaServidor); // o caminho inteiro é comprido e o leigo não precisa dele; fica na dica e em "Copiar o caminho"
    $('ajPasta').title = pastaServidor;
    $('ajPastaDica').textContent = 'Pasta ao vivo: salva em tempo real, uma subpasta por mês, um arquivo por reunião.';
  } else {
    $('ajPasta').textContent = 'Downloads/Talktrail/AAAA-MM/';
    $('ajPasta').title = '';
    $('ajPastaDica').textContent = 'Sem o complemento, a reunião fica na biblioteca e vira arquivo em Downloads ao terminar. Quer numa pasta sua, em tempo real? Toque em "Escolher uma pasta": abre em Documentos; crie uma pasta chamada Talktrail (botão "Nova pasta") e clique em Abrir.';
  }
}
function pintarAjustes() {
  pintarPasta();
  $('ajOferta').value = AJ.oferta;
  $('ajChat').value = AJ.avisoChat;
  $('ajChatTxt').hidden = AJ.avisoChat === 'nunca';
  $('ajSalvarChat').checked = !!AJ.salvarChat;
  $('ajBaixar').checked = AJ.baixarAoTerminar !== false;
  $('ajFab').checked = AJ.botaoFlutuante !== false;
  $('ajFabPainel').checked = AJ.fabAbrePainel !== false;
  $('ajTelaCheia').checked = AJ.painelNaTelaCheia !== false;
  $('ajApagar').value = String(AJ.apagarAntigas || 'nunca');
  $('ajChatTxt').value = AJ.textoChat || TEXTO_CHAT;
  if (document.activeElement !== $('ajPalavras')) {
    $('ajPalavras').value = (AJ.palavras || []).join(', ');
    cresce($('ajPalavras'));
  }
}
chrome.storage.local.get('ajustes').then((v) => {
  if (v.ajustes && typeof v.ajustes === 'object') AJ = { ...AJ, ...v.ajustes };
  if (AJ.avisoChat === true) AJ.avisoChat = 'sempre';
  if (ehTextoPadraoAntigo(AJ.textoChat)) AJ.textoChat = TEXTO_CHAT;
  if (!['nunca', 'sempre', 'perguntar'].includes(AJ.avisoChat)) AJ.avisoChat = 'nunca';
  pintarAjustes();
});
function abrirAjustes(abrir) {
  document.querySelector('.app').classList.toggle('ajustando', abrir);
  $('ajustes').hidden = !abrir;
  $('engrenagem').setAttribute('aria-expanded', String(abrir));
  clearInterval(timerDiag);
  if (abrir) {
    pintarAjustes();
    checarServidor();
    diagnosticar();
    timerDiag = setInterval(diagnosticar, 4000); // o status é automático: não precisa apertar nada
  }
}
let timerDiag = null;

// seletor de pasta do próprio sistema (o servidor abre a janela); ninguém precisa digitar caminho
// Baixa um zip com o instalador do complemento (a pasta ao vivo em Documentos/Talktrail) já pronto pro sistema da pessoa.
async function baixarComplemento() {
  if (!instaladorEmbutido) {
    if (URL_COMPLEMENTO) chrome.tabs.create({ url: URL_COMPLEMENTO });
    return;
  }
  const sistema = `${navigator.platform || ''} ${navigator.userAgent || ''}`;
  const so = /Win/i.test(sistema) ? 'windows' : /Mac/i.test(sistema) ? 'mac' : 'linux';
  const instalador = {
    mac: { de: 'instalar-mac.command', nome: 'Instalar Talktrail.command', modo: 0o755 },
    windows: { de: 'instalar-windows.bat', nome: 'Instalar Talktrail.bat', modo: 0o644 },
    linux: { de: 'instalar-linux.sh', nome: 'instalar-talktrail.sh', modo: 0o755 },
  }[so];
  const ler = async (arq) => new Uint8Array(await (await fetch(chrome.runtime.getURL('complemento/' + arq))).arrayBuffer());
  try {
    let bytes = await ler(instalador.de);
    if (so === 'windows') bytes = new TextEncoder().encode(new TextDecoder().decode(bytes).replace(/\r?\n/g, '\r\n')); // o .bat quer CRLF
    const zip = MB_ZIP.criar([
      { nome: instalador.nome, bytes, modo: instalador.modo },
      { nome: 'talktrail_server.py', bytes: await ler('talktrail_server.py'), modo: 0o644 },
      { nome: 'LEIA-ME.txt', bytes: await ler('LEIA-ME.txt'), modo: 0o644 },
    ]);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
    a.download = 'Talktrail-complemento.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 15000);
    const passos = {
      mac: 'Baixei o arquivo Talktrail-complemento.zip. 1) Em Downloads, dê dois cliques nele. 2) Abra "Instalar Talktrail" (na primeira vez: botão direito, Abrir). 3) Espere terminar: o Talktrail passa a salvar em Documentos/Talktrail.',
      windows: 'Baixei o arquivo Talktrail-complemento.zip. 1) Em Downloads, botão direito nele, Extrair tudo. 2) Abra "Instalar Talktrail" (se o Windows avisar: Mais informações, Executar assim mesmo). 3) Espere terminar: o Talktrail passa a salvar em Documentos\\Talktrail.',
      linux: 'Baixei o arquivo Talktrail-complemento.zip. 1) Extraia. 2) Abra um terminal na pasta e rode: bash instalar-talktrail.sh. 3) Espere terminar: o Talktrail passa a salvar em Documentos/Talktrail.',
    }[so];
    $('ajInstalarDica').textContent = passos;
    $('ajInstalarDica').hidden = false;
  } catch (e) {
    $('ajInstalarDica').textContent = 'Não consegui montar o instalador agora. Tente de novo em instantes.';
    $('ajInstalarDica').hidden = false;
  }
}

// Sem o complemento: o próprio navegador abre o seletor de pasta e guarda a escolha.
async function escolherPastaNavegador() {
  if (typeof window.showDirectoryPicker !== 'function') {
    $('ajPastaDica').textContent = 'Este navegador não deixa escolher uma pasta. As reuniões vão pra Downloads/Talktrail.';
    return;
  }
  try {
    const h = await window.showDirectoryPicker({ id: 'talktrail', mode: 'readwrite', startIn: 'documents' });
    await MB_PASTA.guardar(h);
    await chrome.storage.local.set({ pastaPendente: false });
    pastaNavegador = h;
    pintarPasta();
  } catch (e) {
    if (e && e.name !== 'AbortError') $('ajPastaDica').textContent = 'Não consegui usar essa pasta. Escolha outra, ou fique com Downloads.';
  }
}
async function voltarProDownloads() {
  try {
    await MB_PASTA.apagar();
  } catch (e) {}
  pastaNavegador = null;
  await chrome.storage.local.set({ pastaPendente: false });
  pintarPasta();
}
async function liberarPasta() {
  try {
    const h = await MB_PASTA.ler();
    if (h && (await MB_PASTA.permissao(h, true))) {
      await chrome.storage.local.set({ pastaPendente: false });
      return;
    }
  } catch (e) {}
  $('ajPastaDica').textContent = 'O navegador não liberou a pasta. Tente de novo, ou escolha outra.';
}

async function escolherPastaAoVivo() {
  if (!servidorOk) return escolherPastaNavegador();
  $('ajPastaDica').textContent = 'Escolha a pasta na janela que abriu...';
  const r = await chrome.runtime.sendMessage({ type: 'escolher-pasta' }).catch(() => null);
  if (r && r.ok) {
    pastaServidor = r.pasta;
    pintarPasta();
  } else {
    pintarPasta();
    if (r && !r.cancelado) $('ajPastaDica').textContent = (r && r.erro) || 'Não consegui abrir o seletor de pasta.';
  }
}
let CORES = {}; // tag -> cor escolhida
let corAberta = null; // tag com a paleta aberta
const PALETA = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899', '#71717a'];
const corDe = (tag) => {
  if (CORES[tag]) return CORES[tag];
  let h = 0;
  for (const ch of tag) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETA[h % (PALETA.length - 1)]; // sem cinza por padrão
};
const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches;
let pulso = null;
let tNotas = null;
let tCola = null;
const edNotas = MBEditor.create($('notasTxt'), {
  placeholder: 'Decisões e ideias da reunião',
  onChange: (v) => {
    clearTimeout(tNotas);
    tNotas = setTimeout(() => cmd('notes', { text: v }), 300);
  },
  // Cmd+Enter (Ctrl+Enter no Windows e Linux): marca o momento e devolve a hora pra entrar na nota
  onStamp: () => {
    cmd('mark');
    return `[${fmt(base.gravando ? base.seg + (Date.now() - base.em) / 1000 : base.seg)}] `;
  },
});
const edCola = MBEditor.create($('colaTxt'), {
  placeholder: 'O que você quer tratar',
  onChange: (v) => {
    clearTimeout(tCola);
    tCola = setTimeout(() => (alvoExterno() ? salvarPautaAlvo(v) : cmd('cola', { text: v })), 300);
  },
});

// ---------- Pauta por reunião ----------
// pautas: { "AAAA-MM-DD|título normalizado": { titulo, data, hora, codigo, texto, criada, atualizada } }
// agendaMeet: reuniões lidas da tela inicial do Meet (título, dia e hora). Tudo local, no navegador.
const normT = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const diaISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const COD_SALA = /([a-z]{3}-[a-z]{4}-[a-z]{3})/i;
let pautas = {};
let agendaMeet = [];
let alvo = ''; // id escolhido na lista; vazio = a reunião em que o painel está (ou a pauta por tag)
let confirmaApagar = '';
let agendaLidaEm = 0;
let atualizandoAgenda = false;
let ultimoPedido = 0;
let pautaPintada = '';
let pautaNovoAberto = false;

const alvoExterno = () => !!alvo && alvo !== ((ultimo && ultimo.pautaId) || '');
function rotuloQuando(data, hora) {
  const hoje = diaISO();
  const amanha = diaISO(new Date(Date.now() + 86400000));
  const d = data === hoje ? 'hoje' : data === amanha ? 'amanhã'
    : new Date(`${data}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');
  return hora ? `${d} · ${hora}` : d;
}
function linhasDePautas() {
  const por = new Map();
  for (const a of agendaMeet) por.set(`${a.data}|${normT(a.titulo)}`, { id: `${a.data}|${normT(a.titulo)}`, titulo: a.titulo, data: a.data, hora: a.hora || '', texto: '', salva: false });
  for (const [id, e] of Object.entries(pautas)) por.set(id, { ...(por.get(id) || {}), id, titulo: e.titulo, data: e.data, hora: e.hora || (por.get(id) || {}).hora || '', texto: e.texto || '', salva: true });
  return [...por.values()].sort((a, b) => (a.data + (a.hora || '99')).localeCompare(b.data + (b.hora || '99')));
}
function itemDePauta(l) {
  const li = document.createElement('li');
  li.className = 'pauta-item' + (l.id === (alvo || (ultimo && ultimo.pautaId)) ? ' on' : '');
  const agoraMin = new Date().getHours() * 60 + new Date().getMinutes();
  if (l.data === diaISO() && minutosDe(l.hora) !== null && minutosDe(l.hora) < agoraMin) li.classList.add('passou'); // já começou ou passou: fica apagada
  const abrir = document.createElement('button');
  abrir.type = 'button';
  abrir.className = 'abrir';
  const tit = document.createElement('span');
  tit.className = 'tit';
  tit.textContent = l.titulo;
  const meta = document.createElement('span');
  meta.className = 'meta';
  meta.textContent = rotuloQuando(l.data, l.hora);
  if (l.texto) {
    const tem = document.createElement('span');
    tem.className = 'tem';
    tem.textContent = 'com pauta';
    meta.append(tem);
  }
  abrir.append(tit, meta);
  abrir.onclick = () => escolherPauta(l.id);
  li.append(abrir);
  if (l.salva) {
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'apagar' + (confirmaApagar === l.id ? ' confirma' : '');
    x.textContent = confirmaApagar === l.id ? 'Apagar?' : '×';
    x.setAttribute('aria-label', `Apagar a pauta de ${l.titulo}`);
    x.onclick = () => {
      if (confirmaApagar !== l.id) {
        confirmaApagar = l.id;
        pintarPautas();
        setTimeout(() => { if (confirmaApagar === l.id) { confirmaApagar = ''; pintarPautas(); } }, 3000);
        return;
      }
      confirmaApagar = '';
      delete pautas[l.id];
      if (alvo === l.id) alvo = '';
      chrome.storage.local.set({ pautas });
      pintarPautas();
      rotularPauta();
      if (!edCola.hasFocus()) edCola.setValue(alvoExterno() ? '' : (ultimo && ultimo.cola) || '');
    };
    li.append(x);
  }
  return li;
}
const minutosDe = (hora) => { const m = /^(\d{1,2}):(\d{2})$/.exec(hora || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
function pintarPautas() {
  const hoje = diaISO();
  const todas = linhasDePautas();
  const deHoje = todas.filter((l) => l.data === hoje);
  const proximos = todas.filter((l) => l.data > hoje);
  const passadas = todas.filter((l) => l.data < hoje && l.texto).reverse();
  $('pautasLista').replaceChildren(...deHoje.map(itemDePauta));
  $('pautasProxLista').replaceChildren(...proximos.map(itemDePauta));
  $('pautasProximos').hidden = !proximos.length;
  $('pautasAntLista').replaceChildren(...passadas.map(itemDePauta));
  $('pautasAnteriores').hidden = !passadas.length;
  $('pautasVazio').hidden = deHoje.length > 0;
  $('pautaEscolha').textContent = deHoje.length ? 'Toque numa reunião pra escrever a pauta dela.' : 'Adicione uma reunião aqui em cima pra escrever a pauta dela.';
  if (!deHoje.length && document.body.classList.contains('fora') && !pautaNovoAberto) { pautaNovoAberto = true; $('pautaNovo').open = true; }
  $('pautasN').textContent = deHoje.length ? String(deHoje.length) : '';
  // a próxima reunião de hoje (só de hoje: uma de daqui a um mês não fica cutucando)
  const agora = new Date();
  const min = agora.getHours() * 60 + agora.getMinutes();
  const prox = deHoje.map((l) => ({ l, t: minutosDe(l.hora) })).filter((x) => x.t !== null && x.t >= min).sort((a, b) => a.t - b.t)[0];
  $('proxima').hidden = !prox;
  if (prox) {
    const falta = prox.t - min;
    $('proximaTit').textContent = prox.l.titulo;
    $('proximaQuando').textContent = `${prox.l.hora} · ` + (falta === 0 ? 'agora' : falta < 60 ? `em ${falta} min` : `em ${Math.floor(falta / 60)} h${falta % 60 ? ` ${falta % 60} min` : ''}`);
  }
  const lida = agendaLidaEm ? new Date(agendaLidaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
  $('pautasLidaEm').hidden = !lida && !atualizandoAgenda;
  $('pautasLidaEm').textContent = atualizandoAgenda ? 'Atualizando…' : lida ? `Atualizado às ${lida}.` : '';
}
function rotularPauta() {
  const externo = alvoExterno();
  const e = externo ? pautas[alvo] || linhasDePautas().find((l) => l.id === alvo) : null;
  const noAtual = ultimo && ultimo.pautaId;
  $('pautaRot').textContent = externo ? `Pauta: ${e ? e.titulo : ''}` : noAtual ? 'Pauta desta reunião' : 'Pauta';
  $('pautaVoltar').hidden = !externo;
  document.body.classList.toggle('sem-alvo', !externo);
  $('pautaEscolha').hidden = externo;
  $('pautaVoltar').textContent = ultimo && ultimo.sala ? 'Voltar pra reunião atual' : 'Voltar';
  $('pautaDica').innerHTML = externo
    ? 'Escreva o que quer tratar. Quando você entrar nessa reunião no Meet, a pauta aparece sozinha.'
    : 'O que você leva <strong>antes</strong> da reunião: pontos e perguntas pra tratar. Sem uma reunião escolhida, fica guardada pela primeira tag.';
}
function escolherPauta(id) {
  alvo = id === ((ultimo && ultimo.pautaId) || '') ? '' : id;
  pintarPautas();
  rotularPauta();
  edCola.setValue(alvoExterno() ? (pautas[alvo] && pautas[alvo].texto) || '' : (ultimo && ultimo.cola) || '');
}
function salvarPautaAlvo(texto) {
  if (!alvoExterno()) return;
  const base = pautas[alvo] || (() => {
    const l = linhasDePautas().find((x) => x.id === alvo) || {};
    return { titulo: l.titulo || '', data: l.data || alvo.split('|')[0], hora: l.hora || '', codigo: '', criada: Date.now() };
  })();
  if (!texto && !pautas[alvo]) return;
  pautas[alvo] = { ...base, texto, atualizada: Date.now() };
  chrome.storage.local.set({ pautas });
  pintarPautas(); // o selo "com pauta" aparece na hora
}
async function carregarPautas() {
  const v = await chrome.storage.local.get(['pautas', 'agendaMeet', 'agendaLidaEm']);
  if (v && v.agendaLidaEm && v.agendaLidaEm !== agendaLidaEm) atualizandoAgenda = false;
  agendaLidaEm = (v && v.agendaLidaEm) || 0;
  pautas = (v && v.pautas) || {};
  agendaMeet = Array.isArray(v && v.agendaMeet) ? v.agendaMeet : [];
  pintarPautas();
  rotularPauta();
}
chrome.storage.onChanged.addListener((c) => { if (c.pautas || c.agendaMeet || c.agendaLidaEm) carregarPautas(); });
function atualizarAgendaDoMeet() {
  if (Date.now() - ultimoPedido < 15000) return;
  ultimoPedido = Date.now();
  atualizandoAgenda = true;
  pintarPautas();
  chrome.runtime.sendMessage({ type: 'atualizar-agenda' }).catch(() => {});
  setTimeout(() => { atualizandoAgenda = false; pintarPautas(); }, 30000);
}
$('pautasAtualizar').onclick = atualizarAgendaDoMeet;
// fora do Meet o painel vira só "reuniões de hoje e pauta": sem gravar, sem texto, sem marcadores
function modoFora(ligado) {
  if (document.body.classList.contains('fora') === ligado) return;
  document.body.classList.toggle('fora', ligado);
  if (!ligado) return;
  const dataExtenso = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  $('foraData').textContent = dataExtenso.charAt(0).toUpperCase() + dataExtenso.slice(1);
  alvo = '';
  pintarPautas();
  rotularPauta();
  $('abaCola').click();
  $('pautasPainel').hidden = false;
  $('pautasBotao').setAttribute('aria-expanded', 'true');
  if (!agendaLidaEm || Date.now() - agendaLidaEm > 20 * 60 * 1000) atualizarAgendaDoMeet();
}
$('pautasBotao').onclick = () => {
  const aberto = $('pautasPainel').hidden;
  $('pautasPainel').hidden = !aberto;
  $('pautasBotao').setAttribute('aria-expanded', String(aberto));
};
$('pautaVoltar').onclick = () => {
  alvo = '';
  pintarPautas();
  rotularPauta();
  edCola.setValue((ultimo && ultimo.cola) || '');
};
$('pautaQuando').value = diaISO();
$('pautaForm').onsubmit = (ev) => {
  ev.preventDefault();
  const link = $('pautaLink').value.trim();
  const cod = (link.match(COD_SALA) || [])[1] || '';
  const titulo = $('pautaTitulo').value.trim() || cod;
  if (!titulo) {
    $('pautaTitulo').focus();
    return;
  }
  const data = $('pautaQuando').value || diaISO();
  const id = `${data}|${normT(titulo)}`;
  if (!pautas[id]) pautas[id] = { titulo, data, hora: '', codigo: cod.toLowerCase(), texto: '', criada: Date.now(), atualizada: Date.now() };
  else if (cod) pautas[id].codigo = cod.toLowerCase();
  chrome.storage.local.set({ pautas });
  $('pautaTitulo').value = '';
  $('pautaLink').value = '';
  $('pautaNovo').open = false;
  escolherPauta(id);
};
carregarPautas();
let travaEsconder = 0; // o interruptor responde na hora; o eco do estado não pode desfazer o clique
// vírgula e ponto e vírgula separam tags; pontuação nas pontas não faz parte do nome
const limparTag = (s) => String(s).replace(/^[\s,;.#]+|[\s,;]+$/g, '');
const partirTags = (s) => [...new Set(String(s).split(/[,;]/).map(limparTag).filter(Boolean))];

chrome.storage.local.get(['tagsSalvas', 'projetos', 'tagCores']).then((v) => {
  CORES = v.tagCores || {};
  const bruta = Array.isArray(v.tagsSalvas) ? v.tagsSalvas : Array.isArray(v.projetos) ? v.projetos : SEMENTE;
  TAGS = [...new Set(bruta.flatMap(partirTags))];
  if (!Array.isArray(v.tagsSalvas) || TAGS.length !== bruta.length || TAGS.some((x, i) => x !== bruta[i])) chrome.storage.local.set({ tagsSalvas: TAGS });
  if (ultimo) chips(ultimo.tags || []);
});
function salvarTags() {
  chrome.storage.local.set({ tagsSalvas: TAGS });
}
let base = { seg: 0, em: Date.now(), gravando: false };
let ultimo = null;
let linhasVistas = 0;

const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const hhmm = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

async function abaAtiva() {
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  return t;
}

async function cmd(c, extra = {}) {
  const t = await abaAtiva();
  if (!t) return;
  try {
    const r = await chrome.tabs.sendMessage(t.id, { type: 'cmd', cmd: c, ...extra });
    if (r) aplicar(r);
  } catch (e) {
    semMeet();
  }
}

// resposta crua do script da página (sem desenhar), pro diagnóstico
async function cmdCru(c) {
  const t = await abaAtiva();
  if (!t) return null;
  try {
    return await chrome.tabs.sendMessage(t.id, { type: 'cmd', cmd: c });
  } catch (e) {
    return null;
  }
}

function semMeet() {
  $('sub').textContent = 'Abra uma reunião do Meet pra transcrever.';
  $('sub').hidden = false;
  $('rec').className = 'rec';
  modoFora(true);
}

let acaoAviso = 'ligar';
function aviso(txt, botao = null, titulo = 'Atenção', tom = 'erro') {
  $('aviso').hidden = !txt;
  $('aviso').classList.toggle('neutro', tom === 'neutro');
  $('avisoTit').textContent = titulo;
  $('avisoTxt').textContent = txt || '';
  $('ligar').hidden = !botao;
  if (botao) {
    $('ligar').textContent = botao.rotulo;
    acaoAviso = botao.acao;
  }
}

let tagsAbertas = false;

function chip(p, on, sel, comX) {
  const b = document.createElement('div');
  b.className = 'chip' + (on ? ' on' : '');
  b.style.setProperty('--c', corDe(p));
  b.setAttribute('role', 'button');
  b.tabIndex = 0; // alcançável pelo teclado
  b.addEventListener('keydown', (e) => {
    if (e.target === b && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      b.click();
    }
  });
  b.innerHTML = '<span class="cor" title="Mudar a cor"></span><span class="n"></span><span class="x"></span>';
  b.querySelector('.n').textContent = p;
  b.querySelector('.x').textContent = '×';
  b.querySelector('.x').title = comX === 'apagar' ? 'Apagar esta tag da lista' : 'Tirar desta reunião';
  b.onclick = (e) => {
    if (e.target.classList.contains('cor')) {
      corAberta = corAberta === p ? null : p;
      tagsAbertas = true;
      chips(sel);
      return;
    }
    if (e.target.classList.contains('x')) {
      if (comX === 'apagar') {
        TAGS = TAGS.filter((x) => x !== p);
        salvarTags();
        if (corAberta === p) corAberta = null;
      }
      cmd('meta', { tags: sel.filter((x) => x !== p) });
      return;
    }
    cmd('meta', { tags: on ? sel.filter((x) => x !== p) : [...sel, p] });
  };
  return b;
}

// Discreto: por padrão só aparecem as tags desta reunião e um "+ Tag". A gestão abre sob demanda.
function chips(sel) {
  const linha = $('tagsSel');
  linha.innerHTML = '';
  for (const p of sel) linha.appendChild(chip(p, true, sel, 'tirar'));
  $('tagMais').textContent = tagsAbertas ? 'Fechar' : '+ Tag';
  $('tagMais').setAttribute('aria-expanded', String(tagsAbertas));
  $('tagsGerencia').hidden = !tagsAbertas;

  const box = $('chips');
  box.innerHTML = '';
  if (tagsAbertas) {
    for (const p of new Set([...TAGS, ...sel])) box.appendChild(chip(p, sel.includes(p), sel, 'apagar'));
  }
  const pal = $('paleta');
  pal.hidden = !corAberta;
  pal.innerHTML = '';
  if (corAberta) {
    const rot = document.createElement('span');
    rot.className = 'rotcor';
    rot.append('Cor da tag ');
    const nome = document.createElement('b');
    nome.textContent = corAberta;
    nome.title = corAberta;
    rot.appendChild(nome);
    pal.appendChild(rot);
    for (const cor of PALETA) {
      const s = document.createElement('button');
      s.style.setProperty('--c', cor);
      s.className = corDe(corAberta) === cor ? 'sel' : '';
      s.setAttribute('aria-label', 'Cor ' + cor);
      s.onclick = () => {
        CORES[corAberta] = cor;
        chrome.storage.local.set({ tagCores: CORES });
        corAberta = null;
        chips(sel);
      };
      pal.appendChild(s);
    }
  }
}

function aplicar(s) {
  ultimo = s;
  modoFora(false);
  const gravando = s.fase === 'gravando';
  base = { seg: s.segundos, em: Date.now(), gravando };
  if (!calmo && typeof gsap !== 'undefined' && $('rec').classList.contains('on') !== gravando) {
    gsap.fromTo('#rec', { scale: 0.95 }, { scale: 1, duration: 0.5, ease: 'back.out(3)' });
  }
  $('rec').className = 'rec' + (gravando ? ' on' : '');
  $('rec').title = gravando ? 'Parar' : 'Transcrever';
  $('estado').textContent = gravando ? 'Parar' : 'Transcrever';
  const nota = s.info || (s.avisoChat === 'falhou' ? 'Não consegui avisar no chat do Meet. Avise os participantes por conta própria.' : '');
  $('sub').textContent = nota;
  $('sub').hidden = !nota;
  $('tempo').textContent = gravando ? fmt(s.segundos) : '';
  if (Date.now() > travaEsconder) $('esconder').checked = !!s.esconderLegendas;
  if (!calmo && typeof gsap !== 'undefined') {
    if (gravando && !pulso) {
      pulso = gsap.fromTo('.onda', { scale: 1, opacity: 0.55 }, { scale: 3, opacity: 0, duration: 1.4, ease: 'power2.out', repeat: -1 });
    } else if (!gravando && pulso) {
      pulso.kill();
      pulso = null;
      gsap.set('.onda', { opacity: 0, scale: 1 });
    }
  }

  if (document.activeElement !== $('titulo')) $('titulo').value = s.titulo || '';
  if (!edNotas.hasFocus()) edNotas.setValue(s.notes || '');
  if (!edCola.hasFocus() && !alvoExterno()) edCola.setValue(s.cola || '');
  if (alvo && alvo === (s.pautaId || '')) alvo = ''; // entrou na reunião que estava aberta: passa a ser a atual
  if ((s.pautaId || '') !== pautaPintada) { // a lista só se redesenha quando a reunião atual muda, não a cada fala
    pautaPintada = s.pautaId || '';
    pintarPautas();
    rotularPauta();
  }
  chips(s.tags || []);

  const ul = $('linhas');
  const pai = ul.parentElement;
  const colado = pai.scrollHeight - pai.scrollTop - pai.clientHeight < 70;
  ul.innerHTML = '';
  s.linhas.forEach((l, i) => {
    const li = document.createElement('li');
    li.className = 'linha-fala' + (l.speaker === 'Eu' ? ' eu' : '');
    li.innerHTML = `<div class="cab"><span class="quem"></span><span class="hora"></span></div><div class="fala"></div>`;
    li.querySelector('.quem').textContent = l.speaker;
    li.querySelector('.hora').textContent = fmt(l.t);
    li.querySelector('.fala').textContent = l.text;
    ul.appendChild(li);
    if (i >= linhasVistas && typeof gsap !== 'undefined') gsap.from(li, { y: 8, opacity: 0, duration: 0.35, ease: 'power2.out' });
  });
  linhasVistas = s.linhas.length;
  $('vazio').hidden = s.linhas.length > 0;
  if (colado) pai.scrollTop = pai.scrollHeight;

  const lm = $('listaMarcas');
  lm.innerHTML = '';
  for (const m of s.marcas) {
    const li = document.createElement('li');
    li.className = 'marca';
    li.innerHTML = `<span class="hora"></span><div class="fala"></div>`;
    li.querySelector('.hora').textContent = fmt(m.t);
    li.querySelector('.fala').textContent = m.texto || '(sem texto)';
    lm.appendChild(li);
  }
  $('nM').textContent = s.marcas.length ? `(${s.marcas.length})` : '';


  const motivo = s.legendasMotivo;
  if (s.erro) {
    aviso(s.erro, null, /palavra bloqueada/.test(s.erro) ? 'Transcrição bloqueada' : /não está autorizada/.test(s.erro) ? 'Extensão não autorizada' : 'Problema ao salvar');
  } else if (gravando && !s.legendas && (motivo === 'organizador' || motivo === 'sem-botao')) {
    aviso(
      motivo === 'organizador'
        ? 'O organizador pode ter desativado as legendas desta reunião, e sem elas não dá pra transcrever. Peça pra ele ligar.'
        : 'Não encontro o botão de legendas do Meet. O organizador pode ter desativado, ou o Meet mudou a tela.',
      { rotulo: 'Diagnosticar', acao: 'diagnostico' },
      'Legendas indisponíveis'
    );
  } else if (gravando && !s.legendas) {
    aviso('Sem as legendas ligadas, a transcrição para de funcionar. Ligue o CC do Meet ou use o botão.', { rotulo: 'Ligar legendas agora', acao: 'ligar' }, 'Legendas do Meet desligadas');
  } else if (!servidorOk && pastaNavegador && pastaPendente) {
    aviso(
      'A pasta que você escolheu precisa de um clique pra continuar recebendo as reuniões. Enquanto isso, elas vão pra Downloads.',
      { rotulo: 'Liberar a pasta', acao: 'liberar-pasta' },
      'Libere a pasta',
      'neutro'
    );
  } else if (!servidorOk && usaServidor && !pastaNavegador) {
    aviso(
      'Esta reunião está sendo guardada só na extensão e, ao terminar, é baixada em Downloads/Talktrail. Pra salvar direto na pasta de novo, ligue o complemento opcional da pasta ao vivo.',
      null,
      'A pasta ao vivo está desligada',
      'neutro'
    );
  } else {
    aviso('');
  }

  // "Salvo às 07:23" e, quando há arquivo, um botão que abre a pasta com ele selecionado
  const ondeSalvou = { pasta: 'na pasta', extensao: 'na extensão', downloads: 'em Downloads' }[s.modoSalvar] || '';
  const elSalvo = $('salvo');
  const chave = s.salvoEm ? `${hhmm(s.salvoEm)}|${s.modoSalvar}|${s.id}` : '';
  if (elSalvo.dataset.chave !== chave) {
    elSalvo.dataset.chave = chave;
    elSalvo.textContent = '';
    if (s.salvoEm) {
      elSalvo.append(`Salvo às ${hhmm(s.salvoEm)}`);
      if (s.modoSalvar === 'navegador') {
        elSalvo.append(' · na pasta escolhida');
      } else if (s.modoSalvar === 'pasta' || s.modoSalvar === 'downloads') {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'abrir';
        b.title = 'Abre a pasta com o arquivo desta reunião selecionado';
        b.innerHTML = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M1.75 4.5a1 1 0 0 1 1-1h3.2l1.4 1.5h5.9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2.75a1 1 0 0 1-1-1z"/></svg>Mostrar na pasta';
        b.onclick = () => chrome.runtime.sendMessage({ type: 'mostrar', id: s.id }).catch(() => {});
        elSalvo.append(b);
      } else if (ondeSalvou) {
        elSalvo.append(` · ${ondeSalvou}`);
      }
    }
  }
}

// ---------- eventos ----------
$('abas').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-aba]');
  if (!b) return;
  document.querySelectorAll('#abas button').forEach((x) => x.classList.toggle('on', x === b));
  for (const id of ['texto', 'notas', 'cola', 'marcadores']) $(id).hidden = id !== b.dataset.aba;
});

$('rec').onclick = () => cmd(ultimo && ultimo.fase === 'gravando' ? 'stop' : 'start');
$('marcar').onclick = () => cmd('mark');
$('esconder').onchange = () => {
  travaEsconder = Date.now() + 900;
  cmd('legendas', { valor: $('esconder').checked });
};
$('ligar').onclick = () => {
  if (acaoAviso === 'liberar-pasta') {
    liberarPasta();
  } else if (acaoAviso === 'diagnostico') {
    abrirAjustes(true);
    diagnosticar();
  } else {
    cmd('ligar');
  }
};
$('ajInstalar').onclick = baixarComplemento;
$('ajBiblioteca').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('biblioteca.html') });
$('ajAbrir').onclick = escolherPastaAoVivo;

// "Por que não está transcrevendo?": cada ponto da cadeia, com o que fazer
let ultimoDiag = null;
async function diagnosticar() {
  const ul = $('diagLista');
  await checarServidor();
  const r = await cmdCru('diagnostico');
  const d = r && r.diag;
  const itens = [];
  const add = (nivel, titulo, detalhe) => itens.push({ nivel, titulo, detalhe });
  if (!d) {
    add('falha', 'Aba do Meet', 'Não consegui falar com a aba. Abra uma reunião do Meet em aba normal (não no app instalado) e recarregue a página.');
  } else {
    add(d.naSala ? 'ok' : 'falha', 'Reunião do Meet', d.naSala ? 'Você está numa sala do Meet.' : 'Esta aba não é uma sala do Meet.');
    add(d.naChamada ? 'ok' : 'falha', 'Dentro da chamada', d.naChamada ? 'Você está na chamada.' : 'Entre na chamada: a transcrição só roda dentro dela.');
    add(d.gravando ? 'ok' : 'atencao', 'Transcrevendo', d.gravando ? 'A transcrição está ligada.' : 'A transcrição está desligada. Clique em Transcrever.');
    const l = d.legendas || {};
    if (l.ligadas === true) add('ok', 'Legendas do Meet', 'Estão ligadas.');
    else if (l.ligadas === false) add('falha', 'Legendas do Meet', l.desabilitado ? 'Estão desligadas e o botão está travado: o organizador pode ter desativado.' : 'Estão desligadas. Use o botão "Ligar legendas agora" ou tecle C no Meet.');
    else if (l.botao) add('atencao', 'Legendas do Meet', 'Achei o botão, mas não sei se estão ligadas. Tecle C no Meet.');
    else add(d.regiao ? 'ok' : 'falha', 'Legendas do Meet', d.regiao ? 'A caixa de legendas está na tela.' : 'Não encontro o botão nem a caixa de legendas. O organizador pode ter desativado, ou o Meet mudou a tela.');
    if (d.gravando) {
      if (d.ultimaFalaHa === null) add('atencao', 'Texto chegando', 'Ainda não chegou fala. Se já falaram, confira se o idioma das legendas é o da conversa.');
      else add(d.ultimaFalaHa < 90 ? 'ok' : 'atencao', 'Texto chegando', d.ultimaFalaHa < 90 ? `Última fala há ${d.ultimaFalaHa} s.` : `Faz ${Math.round(d.ultimaFalaHa / 60)} min sem fala nova. Pode ser silêncio, ou as legendas pararam.`);
      add(d.salvoHa !== null ? 'ok' : 'atencao', 'Salvando', d.salvoHa !== null ? `Salvo há ${d.salvoHa} s (${{ pasta: 'na pasta', navegador: 'na pasta escolhida', extensao: 'na extensão', downloads: 'em Downloads' }[r.modoSalvar] || 'ok'}).` : 'Ainda não salvou nada. Aguarde alguns segundos.');
    }
  }
  if (!servidorOk && pastaNavegador) {
    add(pastaPendente ? 'atencao' : 'ok', 'Pasta escolhida', pastaPendente ? `A pasta "${pastaNavegador.name}" precisa de um clique pra ser liberada. Enquanto isso, vai pra Downloads.` : `Grava em tempo real em "${pastaNavegador.name}".`);
  } else add(servidorOk ? 'ok' : 'atencao', 'Pasta ao vivo (complemento)', servidorOk ? `Funcionando. ${pastaServidor}` : 'Desligada. Tudo bem: as reuniões ficam na biblioteca da extensão e vão pra Downloads/Talktrail ao terminar.');
  ultimoDiag = { itens, modo: r && r.modoSalvar, erro: (ultimo && ultimo.erro) || '' };
  const falhas = itens.filter((x) => x.nivel === 'falha').length;
  const gravando = !!(d && d.gravando);
  $('diagResumo').textContent = falhas
    ? `Achei ${falhas} ${falhas === 1 ? 'problema' : 'problemas'}. Veja abaixo o que fazer.`
    : gravando
      ? 'Tudo certo: está transcrevendo.'
      : 'Tudo pronto pra transcrever.';
  ul.innerHTML = '';
  for (const it of itens) {
    const li = document.createElement('li');
    li.className = it.nivel;
    li.innerHTML = '<span class="ponto"></span><span><b></b><small></small></span>';
    li.querySelector('b').textContent = it.titulo;
    li.querySelector('small').textContent = it.detalhe;
    ul.appendChild(li);
  }
}

$('engrenagem').onclick = () => abrirAjustes($('engrenagem').getAttribute('aria-expanded') !== 'true');
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('engrenagem').getAttribute('aria-expanded') === 'true' && document.activeElement !== $('tag')) abrirAjustes(false);
});
$('ajOferta').onchange = () => {
  AJ.oferta = $('ajOferta').value;
  salvarAjustes();
};
$('ajChat').onchange = () => {
  AJ.avisoChat = $('ajChat').value;
  $('ajChatTxt').hidden = AJ.avisoChat === 'nunca';
  salvarAjustes();
};
$('ajTelaCheia').onchange = () => {
  AJ.painelNaTelaCheia = $('ajTelaCheia').checked;
  salvarAjustes();
};
$('ajFabPainel').onchange = () => {
  AJ.fabAbrePainel = $('ajFabPainel').checked;
  salvarAjustes();
};
$('ajFab').onchange = () => {
  AJ.botaoFlutuante = $('ajFab').checked;
  salvarAjustes();
};
$('ajBaixar').onchange = () => {
  AJ.baixarAoTerminar = $('ajBaixar').checked;
  salvarAjustes();
};
$('ajApagar').onchange = () => {
  AJ.apagarAntigas = $('ajApagar').value;
  salvarAjustes();
};
$('ajAtalhoMudar').onclick = () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
async function pintarAtalho() {
  try {
    const todos = await chrome.commands.getAll();
    const tecla = (nome) => (todos.find((x) => x.name === nome) || {}).shortcut || '';
    $('ajAtalho').textContent = tecla('marcar-momento') || 'sem atalho';
    $('ajAtalhoRec').textContent = tecla('transcrever-ou-parar') || 'sem atalho';
    $('ajAtalhoPainel').textContent = tecla('alternar-painel') || 'sem atalho';
    if (tecla('marcar-momento')) $('marcar').title = `Marcar momento (${tecla('marcar-momento')})`;
  } catch (e) {
    $('ajAtalho').textContent = $('ajAtalhoRec').textContent = $('ajAtalhoPainel').textContent = 'sem atalho';
  }
}
pintarAtalho();
$('ajSalvarChat').onchange = () => {
  AJ.salvarChat = $('ajSalvarChat').checked;
  salvarAjustes();
};
let tChat = null;
$('ajChatTxt').addEventListener('input', () => {
  clearTimeout(tChat);
  tChat = setTimeout(() => {
    AJ.textoChat = $('ajChatTxt').value.slice(0, 300);
    salvarAjustes();
  }, 300);
});
let tPal = null;
// a caixa cresce com o que a pessoa escreve, pra ver tudo sem rolar
function cresce(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 2 + 'px';
}
$('ajPalavras').addEventListener('input', () => {
  cresce($('ajPalavras'));
  clearTimeout(tPal);
  tPal = setTimeout(() => {
    AJ.palavras = partirTags($('ajPalavras').value.replace(/\n/g, ',')).slice(0, 30);
    salvarAjustes();
  }, 300);
});
// copia pra área de transferência e mostra "Copiado" no próprio botão por um instante
async function copiar(botao, texto) {
  const rotulo = botao.textContent;
  try {
    await navigator.clipboard.writeText(texto);
    botao.textContent = 'Copiado';
    setTimeout(() => (botao.textContent = rotulo), 1500);
  } catch (e) {}
}
$('ajCopiar').onclick = () => (servidorOk && pastaServidor ? copiar($('ajCopiar'), pastaServidor) : voltarProDownloads());

// ---------- relatar um problema ----------
// Só o que ajuda a achar o defeito: versão, sistema, estado do diagnóstico. Nunca nome, texto, notas nem caminho de pasta.
const semCaminho = (s) => String(s || '').replace(/(\/Users\/|\/home\/|[A-Za-z]:\\Users\\)[^\s/\\)"']+/g, '$1…').replace(/\s+/g, ' ').trim();
function sistemaENavegador() {
  const ua = navigator.userAgent || '';
  const so = /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'sistema desconhecido';
  const nav = (ua.match(/(Edg|OPR|Chrome|Brave|Vivaldi)\/(\d+)/) || []);
  const nome = { Edg: 'Edge', OPR: 'Opera' }[nav[1]] || nav[1] || 'navegador desconhecido';
  return { so, navegador: nav[2] ? `${nome} ${nav[2]}` : nome };
}
async function textoDoRelatorio() {
  const { so, navegador } = sistemaENavegador();
  let atalhos = '';
  try {
    const todos = await chrome.commands.getAll();
    atalhos = todos.filter((c) => /^(marcar-momento|transcrever-ou-parar)$/.test(c.name)).map((c) => `${c.name}=${c.shortcut || 'sem atalho'}`).join(', ');
  } catch (e) {}
  const linhas = [
    'O que aconteceu (conte com as suas palavras):', '', '', 'O que você esperava que acontecesse:', '', '',
    '--- Dados técnicos (pode deixar, ajudam a achar o problema; não há nada da sua reunião aqui) ---',
    `Talktrail ${chrome.runtime.getManifest().version}`,
    `Navegador: ${navegador}`,
    `Sistema: ${so}`,
    `Pasta ao vivo (complemento): ${servidorOk ? 'ligada' : 'desligada'}`,
  ];
  if (ultimoDiag) {
    if (ultimoDiag.modo) linhas.push(`Onde salva: ${{ pasta: 'na pasta', extensao: 'na extensão', downloads: 'em Downloads' }[ultimoDiag.modo] || ultimoDiag.modo}`);
    if (ultimoDiag.erro) linhas.push(`Último erro: ${semCaminho(ultimoDiag.erro)}`);
    linhas.push('Diagnóstico:');
    for (const it of ultimoDiag.itens) {
      linhas.push(`- ${{ ok: 'ok', falha: 'PROBLEMA', atencao: 'atenção' }[it.nivel] || it.nivel}: ${it.titulo}${it.nivel === 'ok' ? '' : ' (' + semCaminho(it.detalhe) + ')'}`);
    }
  } else {
    linhas.push('Diagnóstico: não rodou (abra os Ajustes dentro de uma reunião do Meet).');
  }
  if (atalhos) linhas.push(`Atalhos: ${atalhos}`);
  return linhas.join('\r\n');
}
$('ajRelatar').onclick = async () => {
  const assunto = `Talktrail: problema (v${chrome.runtime.getManifest().version})`;
  const url = `mailto:${EMAIL_SUPORTE}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(await textoDoRelatorio())}`;
  const a = document.createElement('a'); // a âncora abre o programa de e-mail sem tirar o painel do lugar
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
};
$('ajRelatorioCopiar').onclick = async () => copiar($('ajRelatorioCopiar'), `Assunto: Talktrail: problema\r\n\r\n${await textoDoRelatorio()}`);
if (EMAIL_SUPORTE) {
  $('ajSuporteEmail').textContent = `Ou escreva direto pra ${EMAIL_SUPORTE}.`;
  $('ajSuporteEmail').hidden = false;
}

$('tagMais').onclick = () => {
  tagsAbertas = !tagsAbertas;
  if (!tagsAbertas) corAberta = null;
  chips((ultimo && ultimo.tags) || []);
  if (tagsAbertas) $('tag').focus();
};

function criarTags() {
  const novas = partirTags($('tag').value);
  $('tag').value = '';
  if (!novas.length) return;
  for (const v of novas) if (!TAGS.includes(v)) TAGS = [...TAGS, v].slice(-30);
  salvarTags();
  const sel = (ultimo && ultimo.tags) || [];
  corAberta = novas[novas.length - 1]; // a paleta já abre pra tag nova: é o jeito de descobrir que dá pra mudar a cor
  cmd('meta', { tags: [...new Set([...sel, ...novas])] });
}

$('tag').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    tagsAbertas = false;
    corAberta = null;
    chips((ultimo && ultimo.tags) || []);
    $('tagMais').focus();
    return;
  }
  if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
    e.preventDefault();
    criarTags();
  }
});

let tMeta = null;
$('titulo').addEventListener('input', () => {
  clearTimeout(tMeta);
  tMeta = setTimeout(() => cmd('meta', { titulo: $('titulo').value }), 350);
});

chrome.runtime.onMessage.addListener((m) => {
  if (m.type === 'state') aplicar(m.state);
});

setInterval(() => {
  if (base.gravando) $('tempo').textContent = fmt(base.seg + (Date.now() - base.em) / 1000);
}, 1000);

checarServidor();
setInterval(checarServidor, 6000);
cmd('getState');

// o texto de ajuda diz a tecla certa pro sistema (Cmd no Mac, Ctrl nos outros)
if (!/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) document.querySelectorAll('.tmod').forEach((k) => (k.textContent = 'Ctrl'));

// o fundo precisa saber que o painel está aberto nesta aba, pro atalho "abrir ou fechar" conseguir fechar
try {
  const porta = chrome.runtime.connect({ name: 'painel' });
  chrome.tabs.query({ active: true, currentWindow: true }).then(([aba]) => porta.postMessage({ tabId: aba && aba.id })).catch(() => {});
  porta.onMessage.addListener((m) => { if (m && m.fechar) window.close(); });
} catch (e) {}

lerPastaNavegador();
