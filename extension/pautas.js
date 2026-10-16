// Página de pautas: a agenda do Meet (lida pela extensão) e a pauta de cada reunião, em tela cheia.
// Os dados são os mesmos do painel: `pautas` (o que a pessoa escreveu) e `agendaMeet` (o que a extensão leu). Tudo local.
const $ = (id) => document.getElementById(id);
const normT = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const diaISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const minutosDe = (hora) => { const m = /^(\d{1,2}):(\d{2})$/.exec(hora || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const ROTULO = /^(agora|now|hoje|today|amanh[ãa]|em andamento|ao vivo|live|participar|join|entrar)$/i;
const DIAS_A_FRENTE = 14;

let pautas = {};
let agenda = [];
let lidaEm = 0;
let alvo = '';
let filtro = 'todas';
let confirmaApagar = '';
let atualizando = false;
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

function tituloDoDia(data) {
  if (data === diaISO()) return 'Hoje';
  if (data === diaISO(new Date(Date.now() + 86400000))) return 'Amanhã';
  return new Date(`${data}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long' });
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

function pintar() {
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
      nome.textContent = tituloDoDia(l.data);
      const curta = document.createElement('span');
      curta.textContent = new Date(`${l.data}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      h.append(nome, curta);
      els.push(h);
    }
    els.push(item(l));
  }
  $('lista').replaceChildren(...els);
  $('vazio').hidden = mostrar.length > 0;
  if (!mostrar.length && futuras.length) {
    $('vazio').firstElementChild.textContent = filtro === 'sem' ? 'Todas as reuniões já têm pauta.' : 'Nenhuma reunião com pauta ainda.';
    $('vazio').lastChild.textContent = '';
  }
  const versao = (chrome.runtime.getManifest && chrome.runtime.getManifest().version) || '';
  const hora = lidaEm ? new Date(lidaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
  $('status').textContent = atualizando ? 'Lendo a agenda do Meet: abas do Meet podem abrir por alguns minutos.' : hora ? `Atualizado às ${hora}.${versao ? ` Talktrail ${versao}.` : ''}` : 'A agenda ainda não foi lida.';
  $('buscar').disabled = atualizando;
}

function pintarEditor() {
  const e = alvo ? linhas().find((l) => l.id === alvo) : null;
  $('edVazio').hidden = !!e;
  $('edCorpo').hidden = !e;
  if (!e) return;
  $('edTitulo').textContent = e.titulo;
  $('edQuando').textContent = `${tituloDoDia(e.data)}, ${new Date(`${e.data}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}${e.hora ? ` · ${e.hora}${e.fim ? ` às ${e.fim}` : ''}` : ''}`;
  ed.setValue(e.texto || '');
}

function escolher(id) {
  alvo = id;
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
  const v = await chrome.storage.local.get(['pautas', 'agendaMeet', 'agendaLidaEm']);
  if (v && v.agendaLidaEm && v.agendaLidaEm !== lidaEm) atualizando = false;
  lidaEm = (v && v.agendaLidaEm) || 0;
  pautas = (v && v.pautas) || {};
  agenda = Array.isArray(v && v.agendaMeet) ? v.agendaMeet : [];
  pintar();
  if (!alvo) pintarEditor();
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
$('buscar').onclick = () => {
  atualizando = true;
  pintar();
  chrome.runtime.sendMessage({ type: 'atualizar-agenda', dias: DIAS_A_FRENTE }).catch(() => {});
  setTimeout(() => { atualizando = false; pintar(); }, 30000 + DIAS_A_FRENTE * 12000);
};
chrome.storage.onChanged.addListener((c) => { if (c.pautas || c.agendaMeet || c.agendaLidaEm) carregar(); });
carregar();
