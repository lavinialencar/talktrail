// Página de pautas: calendário do mês, reuniões do dia escolhido e a pauta de cada uma, em tela cheia.
// Dados (os mesmos do painel): `pautas` (o que a pessoa escreveu), `agendaMeet` (o que a extensão leu) e
// `agendaDias` (quais dias já foram lidos, com ou sem reunião). Tudo local, no navegador.
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const normT = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const diaISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const minutosDe = (hora) => { const m = /^(\d{1,2}):(\d{2})$/.exec(hora || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const dataDe = (iso) => new Date(`${iso}T12:00:00`);
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1); // "outubro de 2026" -> "Outubro de 2026" (só a primeira letra)
const ROTULO = /^(agora|now|hoje|today|amanh[ãa]|em andamento|ao vivo|live|participar|join|entrar)$/i;
const DIAS_A_FRENTE = 14;

let pautas = {};
let agenda = [];
let diasLidos = {};
let lidaEm = 0;
let alvo = '';
let vista = 'calendario';
let filtro = 'todas';
let mes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let diaSel = diaISO();
let confirmaApagar = '';
let lendo = ''; // 'tudo' ou o dia que está sendo lido no Meet
let tSalvar = null;

const ed = MBEditor.create($('edTxt'), {
  placeholder: 'O que você quer tratar',
  onChange: (v) => {
    clearTimeout(tSalvar);
    tSalvar = setTimeout(() => salvar(v), 300);
  },
});

function linhas() {
  const por = new Map();
  for (const a of agenda) {
    if (!a || ROTULO.test(String(a.titulo || '').trim())) continue;
    const id = `${a.data}|${normT(a.titulo)}`;
    por.set(id, { id, titulo: a.titulo, data: a.data, hora: a.hora || '', fim: a.fim || '', texto: '', salva: false });
  }
  for (const [id, e] of Object.entries(pautas)) {
    const antes = por.get(id) || {};
    por.set(id, { ...antes, id, titulo: e.titulo, data: e.data, hora: e.hora || antes.hora || '', fim: antes.fim || '', texto: e.texto || '', salva: true });
  }
  return [...por.values()].sort((a, b) => (a.data + (a.hora || '99')).localeCompare(b.data + (b.hora || '99')));
}
const porDia = () => {
  const m = new Map();
  for (const l of linhas()) m.set(l.data, [...(m.get(l.data) || []), l]);
  return m;
};

function diaLongo(iso) {
  const hoje = diaISO();
  const base = dataDe(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  if (iso === hoje) return `Hoje, ${base}`;
  if (iso === diaISO(new Date(Date.now() + 86400000))) return `Amanhã, ${base}`;
  return cap(base);
}

function item(l) {
  const li = document.createElement('li');
  li.className = 'pauta-item' + (l.id === alvo ? ' on' : '');
  const agora = new Date().getHours() * 60 + new Date().getMinutes();
  const ini = minutosDe(l.hora);
  let fim = minutosDe(l.fim);
  if (fim !== null && ini !== null && fim < ini) fim += 1440; // termina depois da meia-noite
  const hoje = l.data === diaISO();
  const andando = hoje && ini !== null && fim !== null && ini <= agora && agora < fim;
  if (hoje && ini !== null && !andando && (fim !== null ? fim <= agora : ini < agora)) li.classList.add('passou');
  if (andando) li.classList.add('andando');
  const abrir = document.createElement('button');
  abrir.type = 'button';
  abrir.className = 'abrir';
  const hora = document.createElement('span');
  hora.className = 'hora';
  const b = document.createElement('b');
  b.textContent = l.hora || '--:--';
  hora.append(b);
  if (l.fim) {
    const f = document.createElement('small');
    f.textContent = l.fim;
    hora.append(f);
  }
  const corpo = document.createElement('span');
  corpo.className = 'corpo';
  const tit = document.createElement('span');
  tit.className = 'tit';
  tit.textContent = l.titulo;
  const estado = document.createElement('span');
  estado.className = 'estado';
  if (andando) {
    const e = document.createElement('span');
    e.className = 'chip-agora';
    e.textContent = 'Em andamento';
    estado.append(e);
  }
  const chip = document.createElement('span');
  chip.className = l.texto ? 'chip-pauta tem' : 'chip-pauta sem';
  chip.textContent = l.texto ? 'Pauta pronta' : 'Adicionar pauta';
  estado.append(chip);
  corpo.append(tit, estado);
  abrir.append(hora, corpo);
  abrir.setAttribute('aria-label', `${l.hora || ''} ${l.titulo}. ${l.texto ? 'Pauta pronta' : 'Adicionar pauta'}`);
  abrir.onclick = () => escolher(l.id);
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
        pintar();
        setTimeout(() => { if (confirmaApagar === l.id) { confirmaApagar = ''; pintar(); } }, 3000);
        return;
      }
      confirmaApagar = '';
      delete pautas[l.id];
      if (alvo === l.id) alvo = '';
      chrome.storage.local.set({ pautas });
      pintar();
      pintarEditor();
    };
    li.append(x);
  }
  return li;
}

function pintarCalendario(dias) {
  const ano = mes.getFullYear();
  const m = mes.getMonth();
  const nome = mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  $('mesNome').textContent = cap(nome);
  const hoje = diaISO();
  const cels = [];
  for (let i = 0; i < new Date(ano, m, 1).getDay(); i++) cels.push(document.createElement('span'));
  for (let d = 1; d <= new Date(ano, m + 1, 0).getDate(); d++) {
    const iso = `${ano}-${pad(m + 1)}-${pad(d)}`;
    const reunioes = dias.get(iso) || [];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dia' + (iso === hoje ? ' hoje' : '') + (iso === diaSel ? ' sel' : '') + (iso < hoje ? ' passado' : '');
    b.textContent = String(d);
    b.dataset.dia = iso;
    const completas = reunioes.length && reunioes.every((r) => r.texto);
    if (reunioes.length) {
      const p = document.createElement('i');
      p.className = 'ponto ' + (completas ? 'tem' : 'sem');
      b.append(p);
    }
    b.setAttribute('aria-label', `${dataDe(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}${reunioes.length ? `, ${reunioes.length} ${reunioes.length === 1 ? 'reunião' : 'reuniões'}, ${completas ? 'todas com pauta' : 'falta pauta'}` : ''}`);
    b.setAttribute('aria-pressed', String(iso === diaSel));
    b.onclick = () => { diaSel = iso; pintar(); };
    cels.push(b);
  }
  $('calGrade').replaceChildren(...cels);
}

function pintarDia(dias) {
  const doDia = dias.get(diaSel) || [];
  $('diaNome').textContent = diaLongo(diaSel);
  $('diaN').textContent = doDia.length ? `${doDia.length} ${doDia.length === 1 ? 'reunião' : 'reuniões'}` : '';
  $('diaLista').replaceChildren(...doDia.map(item));
  const lido = !!diasLidos[diaSel];
  $('diaVazio').hidden = doDia.length > 0;
  if (!doDia.length) {
    $('diaVazioTxt').textContent = lido ? 'Nenhuma reunião do Meet neste dia.' : diaSel < diaISO() ? 'Dia que já passou.' : 'Ainda não li este dia. Use o botão no alto da página para ler.';
  }
}

function pintarLista() {
  const hoje = diaISO();
  const futuras = linhas().filter((l) => l.data >= hoje);
  const sem = futuras.filter((l) => !l.texto);
  const com = futuras.filter((l) => l.texto);
  $('nTodas').textContent = String(futuras.length);
  $('nSem').textContent = String(sem.length);
  $('nCom').textContent = String(com.length);
  const mostrar = filtro === 'sem' ? sem : filtro === 'com' ? com : futuras;
  const els = [];
  let dia = '';
  for (const l of mostrar) {
    if (l.data !== dia) {
      dia = l.data;
      const h = document.createElement('li');
      h.className = 'pauta-dia';
      const nome = document.createElement('b');
      nome.textContent = diaLongo(l.data).split(',')[0];
      const curta = document.createElement('span');
      curta.textContent = dataDe(l.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      h.append(nome, curta);
      els.push(h);
    }
    els.push(item(l));
  }
  $('lista').replaceChildren(...els);
  $('vazio').hidden = mostrar.length > 0;
  $('vazio').textContent = futuras.length ? (filtro === 'sem' ? 'Todas as reuniões já têm pauta.' : 'Nenhuma reunião com pauta ainda.') : 'Nenhuma reunião lida ainda. Toque em "Atualizar os próximos 14 dias".';
}

function pintar() {
  const dias = porDia();
  $('vCal').hidden = vista !== 'calendario';
  $('vLista').hidden = vista !== 'lista';
  if (vista === 'calendario') {
    pintarCalendario(dias);
    pintarDia(dias);
  } else {
    pintarLista();
  }
  const versao = (chrome.runtime.getManifest && chrome.runtime.getManifest().version) || '';
  const hora = lidaEm ? new Date(lidaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
  const ate = Object.keys(diasLidos).sort().pop();
  const ateTxt = ate ? new Date(`${ate}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '') : '';
  $('status').textContent = lendo ? 'Lendo a agenda do Meet em abas de fundo.' : hora ? `Atualizado às ${hora} · lido até ${ateTxt || 'hoje'}` : 'A agenda ainda não foi lida.';
  $('status').title = versao ? `Talktrail ${versao}` : '';
  const pt = pontoDeLeitura();
  $('atualizar').textContent = lendo ? 'Parar a leitura' : pt.rotulo;
}

function pintarEditor() {
  const e = alvo ? linhas().find((l) => l.id === alvo) : null;
  $('edVazio').hidden = !!e;
  $('edCorpo').hidden = !e;
  if (!e) return;
  $('edTitulo').textContent = e.titulo;
  $('edQuando').textContent = cap(`${dataDe(e.data).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}${e.hora ? ` · ${e.hora}${e.fim ? ` às ${e.fim}` : ''}` : ''}`);
  ed.setValue(e.texto || '');
}

function escolher(id) {
  alvo = id;
  const l = linhas().find((x) => x.id === id);
  if (l) { diaSel = l.data; mes = new Date(dataDe(l.data).getFullYear(), dataDe(l.data).getMonth(), 1); }
  pintar();
  pintarEditor();
}

function salvar(texto) {
  if (!alvo) return;
  const l = linhas().find((x) => x.id === alvo) || {};
  if (!texto && !pautas[alvo]) return;
  const base = pautas[alvo] || { titulo: l.titulo || '', data: l.data || alvo.split('|')[0], hora: l.hora || '', codigo: '', criada: Date.now() };
  pautas[alvo] = { ...base, texto, atualizada: Date.now() };
  chrome.storage.local.set({ pautas });
  pintar();
}

async function carregar() {
  const v = await chrome.storage.local.get(['pautas', 'agendaMeet', 'agendaLidaEm', 'agendaDias']);
  if (v && v.agendaLidaEm && v.agendaLidaEm !== lidaEm) lendo = '';
  lidaEm = (v && v.agendaLidaEm) || 0;
  diasLidos = (v && v.agendaDias) || {};
  pautas = (v && v.pautas) || {};
  agenda = Array.isArray(v && v.agendaMeet) ? v.agendaMeet : [];
  pintar();
  if (!alvo) pintarEditor();
}

// um botão só: lê os próximos dias; se o dia escolhido está longe demais, lê a partir dele
function pontoDeLeitura() {
  const limite = diaISO(new Date(Date.now() + (DIAS_A_FRENTE - 1) * 86400000));
  if (diaSel > limite && !diasLidos[diaSel]) return { desde: diaSel, rotulo: `Ler a partir de ${dataDe(diaSel).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}` };
  return { desde: '', rotulo: 'Atualizar agenda' };
}

function pedirLeitura(modo, dias, desde) {
  lendo = modo;
  pintar();
  chrome.runtime.sendMessage({ type: 'atualizar-agenda', dias, ...(desde ? { desde } : {}) }).catch(() => {});
  setTimeout(() => { if (lendo === modo) { lendo = ''; pintar(); } }, 30000 + dias * 12000);
}

for (const b of document.querySelectorAll('.vista')) {
  b.onclick = () => {
    vista = b.dataset.vista;
    for (const o of document.querySelectorAll('.vista')) {
      o.classList.toggle('on', o === b);
      o.setAttribute('aria-selected', String(o === b));
    }
    pintar();
  };
}
for (const b of document.querySelectorAll('.filtro')) {
  b.onclick = () => {
    filtro = b.dataset.filtro;
    for (const o of document.querySelectorAll('.filtro')) {
      o.classList.toggle('on', o === b);
      o.setAttribute('aria-selected', String(o === b));
    }
    pintar();
  };
}
$('mesAnt').onclick = () => { mes = new Date(mes.getFullYear(), mes.getMonth() - 1, 1); pintar(); };
$('mesProx').onclick = () => { mes = new Date(mes.getFullYear(), mes.getMonth() + 1, 1); pintar(); };
$('irHoje').onclick = () => { diaSel = diaISO(); mes = new Date(new Date().getFullYear(), new Date().getMonth(), 1); pintar(); };
$('atualizar').onclick = () => {
  if (lendo) { lendo = ''; pintar(); chrome.runtime.sendMessage({ type: 'cancelar-agenda' }).catch(() => {}); return; }
  pedirLeitura('tudo', DIAS_A_FRENTE, pontoDeLeitura().desde);
};
chrome.storage.onChanged.addListener((c) => { if (c.pautas || c.agendaMeet || c.agendaLidaEm || c.agendaDias) carregar(); });
carregar();
