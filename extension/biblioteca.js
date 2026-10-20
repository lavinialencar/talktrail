// Biblioteca das reuniões guardadas na extensão (modo simples). Usa o mesmo gerador de .md do servidor.
const $ = (id) => document.getElementById(id);
const dois = (n) => String(n).padStart(2, '0');
let TODAS = [];

// mesma cor por nome de tag que o painel usa
const PALETA = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'];
const corDe = (tag, cores) => {
  if (cores && cores[tag]) return cores[tag];
  let h = 0;
  for (const ch of tag) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
};
let CORES = {};

async function carregar() {
  const tudo = await chrome.storage.local.get(null);
  CORES = tudo.tagCores || {};
  TODAS = Object.entries(tudo)
    .filter(([k, v]) => k.startsWith('reuniao:') && v && v.payload)
    .map(([k, v]) => ({ chave: k, ...v }))
    .sort((a, b) => String(b.payload.startedAt).localeCompare(String(a.payload.startedAt)));
  desenhar();
}

function resumo(reg) {
  const p = reg.payload;
  let md = '';
  try {
    md = MB_MD.render(p).texto;
  } catch (e) {
    md = '';
  }
  const d = new Date(p.startedAt);
  const quando = Number.isNaN(d.getTime()) ? '' : MB_IDIOMA.en ? `${dois(d.getMonth() + 1)}/${dois(d.getDate())}/${d.getFullYear()} at ${dois(d.getHours())}:${dois(d.getMinutes())}` : `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} às ${dois(d.getHours())}h${dois(d.getMinutes())}`;
  const falas = (Array.isArray(p.transcript) ? p.transcript : []).filter((l) => l && l.text && l.speaker !== 'Talktrail');
  return {
    md,
    titulo: MB_MD.linhaUnica(p.titulo, 200) || trad('Reunião sem título'),
    quando,
    duracao: p.endedAt ? Math.max(1, Math.round((new Date(p.endedAt) - d) / 60000)) + ' min' : trad('em andamento'),
    tags: MB_MD.tagsLimpas(p.tags),
    primeira: falas.length ? { quem: MB_MD.linhaUnica(falas[0].speaker, 40) || '', texto: MB_MD.linhaUnica(falas[0].text, 220) } : null,
    busca: (MB_MD.linhaUnica(p.titulo, 200) + ' ' + MB_MD.tagsLimpas(p.tags).join(' ') + ' ' + falas.map((l) => l.text).join(' ') + ' ' + (p.notes || '')).toLowerCase(),
  };
}

function baixar(reg, md) {
  const url = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(md);
  const nome = reg.arquivo || `${MB_MD.pasta(reg.payload)}/${MB_MD.nomeArquivo(reg.payload)}`;
  chrome.downloads.download({ url, filename: 'Talktrail/' + nome, conflictAction: 'uniquify', saveAs: false });
}

// Prévia legível do .md (sem HTML cru): seção em destaque, hora e nome de quem falou
function previa(md) {
  const box = document.createElement('div');
  box.className = 'previa';
  const corpo = md.replace(/^---[\s\S]*?\n---\n/, '');
  let lista = null;
  const el = (tag, cls, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined) e.textContent = txt;
    return e;
  };
  for (const linha of corpo.split('\n')) {
    if (!linha.trim()) {
      lista = null;
      continue;
    }
    let m;
    if (/^# /.test(linha)) continue; // o título já está no cartão
    if ((m = /^## (.*)/.exec(linha))) {
      lista = null;
      box.appendChild(el('h3', '', m[1]));
    } else if ((m = /^\*\*\[(\d\d:\d\d)\] (.*?):\*\* ?(.*)/.exec(linha))) {
      lista = null;
      const f = el('div', 'fala');
      f.append(el('span', 'hora', m[1]), el('span', 'quem', m[2]), document.createTextNode(m[3]));
      box.appendChild(f);
    } else if ((m = /^\s*(?:[-*+]|\d+[.)]) (.*)/.exec(linha))) {
      if (!lista) {
        lista = el('ul');
        box.appendChild(lista);
      }
      lista.appendChild(el('li', '', m[1]));
    } else if (/^_\(.*\)_$/.test(linha)) {
      lista = null;
      box.appendChild(el('p', 'vazio', linha.slice(2, -2)));
    } else {
      lista = null;
      box.appendChild(el('p', '', linha));
    }
  }
  return box;
}

function desenhar() {
  const q = $('busca').value.trim().toLowerCase();
  const ul = $('lista');
  ul.innerHTML = '';
  const itens = TODAS.map((reg) => ({ reg, r: resumo(reg) })).filter((x) => !q || x.r.busca.includes(q));
  $('vazio').hidden = TODAS.length > 0 && itens.length > 0;
  $('vazio').textContent = TODAS.length && !itens.length ? trad('Nada encontrado para essa busca.') : trad('Nenhuma reunião ainda. Entre numa chamada do Meet e clique em Transcrever.');
  for (const { reg, r } of itens) {
    const li = document.createElement('li');
    li.className = 'reuniao';
    li.innerHTML = '<h2></h2><div class="meta"><span class="q"></span><i class="sep"></i><span class="d"></span></div><p class="trecho"></p><div class="chips"></div><div class="acoes"></div>';
    li.querySelector('h2').textContent = r.titulo;
    li.querySelector('.q').textContent = r.quando;
    li.querySelector('.d').textContent = r.duracao;
    const tr = li.querySelector('.trecho');
    tr.hidden = !r.primeira;
    if (r.primeira) {
      if (r.primeira.quem) {
        const b = document.createElement('b');
        b.textContent = r.primeira.quem + ':';
        tr.appendChild(b);
      }
      tr.appendChild(document.createTextNode(r.primeira.texto));
    }
    const chips = li.querySelector('.chips');
    chips.hidden = !r.tags.length;
    for (const tg of r.tags) {
      const c = document.createElement('span');
      c.className = 'chip on';
      c.style.setProperty('--c', corDe(tg, CORES));
      c.innerHTML = '<span class="cor"></span><span class="n"></span>';
      c.querySelector('.n').textContent = tg;
      chips.appendChild(c);
    }
    const ac = li.querySelector('.acoes');
    const bt = (rotulo, fn, cls = '') => {
      const b = document.createElement('button');
      b.className = 'btn ' + cls;
      b.type = 'button';
      b.textContent = rotulo;
      b.onclick = () => fn(b);
      ac.appendChild(b);
      return b;
    };
    let aberta = null;
    bt(trad('Ver'), (b) => {
      if (aberta) {
        aberta.remove();
        aberta = null;
        b.textContent = trad('Ver');
        return;
      }
      aberta = previa(r.md);
      li.appendChild(aberta);
      b.textContent = trad('Fechar');
    });
    bt(trad('Copiar'), async (b) => {
      try {
        await navigator.clipboard.writeText(r.md);
        b.textContent = trad('Copiado');
        setTimeout(() => (b.textContent = trad('Copiar')), 1500);
      } catch (e) {}
    });
    bt(trad('Baixar .md'), () => baixar(reg, r.md), 'primario');
    let tApagar = null;
    bt(trad('Apagar'), async (b) => {
      if (!b.classList.contains('confirma')) {
        b.classList.add('confirma');
        b.textContent = trad('Apagar mesmo?');
        tApagar = setTimeout(() => {
          b.classList.remove('confirma');
          b.textContent = trad('Apagar');
        }, 4000);
        return;
      }
      clearTimeout(tApagar);
      await chrome.storage.local.remove(reg.chave);
      carregar();
    }, 'perigo');
    ul.appendChild(li);
  }
}

$('busca').addEventListener('input', desenhar);
chrome.storage.onChanged.addListener((c) => {
  if (Object.keys(c).some((k) => k.startsWith('reuniao:') || k === 'tagCores')) carregar();
});
carregar();
