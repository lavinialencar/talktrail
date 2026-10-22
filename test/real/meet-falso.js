// Um "Meet" falso, servido por HTTPS no computador, pra a extensão (pacote da loja) rodar de verdade no navegador.
// Imita só o que a extensão usa: ícones dos botões, jsname das legendas, bloco de legenda (nome + fala), tela inicial com
// a lista de reuniões do dia por conta (authuser), saguão e tela de "você saiu".
const https = require('https'), fs = require('fs'), os = require('os'), path = require('path');
const { execSync } = require('child_process');

const ROTULOS = {
  pt: { sair: 'Sair da chamada', ligar: 'Ativar legendas (c)', desligar: 'Desativar legendas (c)', regiao: 'Legendas', fim: 'Ir para o fim', entrar: 'Participar agora', saiu: 'Você saiu da reunião' },
  en: { sair: 'Leave call', ligar: 'Turn on captions (c)', desligar: 'Turn off captions (c)', regiao: 'Captions', fim: 'Jump to bottom', entrar: 'Join now', saiu: 'You left the meeting' },
  es: { sair: 'Salir de la llamada', ligar: 'Activar subtítulos (c)', desligar: 'Desactivar subtítulos (c)', regiao: 'Subtítulos', fim: 'Ir al final', entrar: 'Unirse ahora', saiu: 'Has salido de la reunión' },
  ja: { sair: '通話から退出', ligar: '字幕をオンにする (c)', desligar: '字幕をオフにする (c)', regiao: 'xyz', fim: '最後へ', entrar: '今すぐ参加', saiu: '退出しました' },
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function certificado() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-cert-'));
  execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout ${d}/k.pem -out ${d}/c.pem -days 2 -subj "/CN=meet.google.com" 2>/dev/null`);
  return { key: fs.readFileSync(d + '/k.pem'), cert: fs.readFileSync(d + '/c.pem') };
}

function paginaDeChamada(L, { saguao, titulo }) {
  return `<!doctype html><html lang="x"><head><meta charset="utf-8"><title>${esc(titulo)}</title></head><body style="margin:0;font:14px sans-serif;background:#202124;color:#fff">
<div id="topo" style="padding:12px">${esc(titulo)}</div>
${saguao ? `<button id="entrar" style="margin:20px;padding:12px 20px">${L.entrar}</button>` : ''}
<template id="modelo-sala"><div id="sala">
  <div id="barra" style="position:fixed;bottom:0;left:0;right:0;height:72px;background:#303134;display:flex;gap:12px;align-items:center;justify-content:center">
    <button jsname="RrG0hf" id="cc" aria-label="${esc(L.ligar)}"><i class="google-symbols">closed_caption_off</i></button>
    <button id="chatbtn" aria-label="chat"><i class="google-symbols">chat</i></button>
    <button jsname="CQylAd" id="sair" aria-label="${esc(L.sair)}"><i class="google-symbols">call_end</i></button>
  </div>
  <div id="video" style="height:60vh;background:#000"></div>
  <div id="legendas" role="region" aria-label="${esc(L.regiao)}" style="position:fixed;bottom:84px;left:120px;right:120px;max-height:30vh;overflow:auto;display:none">
    <div id="conteudo"><div id="fim"><button jsname="Xke7ne" aria-label="${esc(L.fim)}"><i class="google-symbols">arrow_downward</i><span>${esc(L.fim)}</span></button></div></div>
  </div>
</div></template>
<script>
  let ligado = false;
  function montarSala() {
    document.body.appendChild(document.getElementById('modelo-sala').content.cloneNode(true));
    const cc = document.getElementById('cc'), reg = document.getElementById('legendas');
    cc.addEventListener('click', () => { ligado = !ligado; cc.setAttribute('aria-label', ligado ? ${JSON.stringify(L.desligar)} : ${JSON.stringify(L.ligar)}); cc.querySelector('i').textContent = ligado ? 'closed_caption' : 'closed_caption_off'; reg.style.display = ligado ? 'block' : 'none'; });
  }
  const ent = document.getElementById('entrar');
  if (ent) ent.addEventListener('click', () => { ent.remove(); montarSala(); }); else montarSala();
  // pra o teste: alguém fala (cria ou atualiza o bloco daquela pessoa, como o Meet faz enquanto a frase cresce)
  window.__falar = (nome, texto, novoBloco) => {
    const c = document.getElementById('conteudo'); let b = !novoBloco && [...c.querySelectorAll('.bl')].reverse().find((x) => x.dataset.nome === nome);
    if (!b) { b = document.createElement('div'); b.className = 'bl'; b.dataset.nome = nome; b.innerHTML = '<div class="av"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="24" height="24"><div class="nm"><span></span></div></div><div class="tx"></div>'; c.insertBefore(b, document.getElementById('fim')); }
    b.querySelector('span').textContent = nome; b.querySelector('.tx').textContent = texto;
    c.parentElement.scrollTop = 1e9;
  };
  window.__sairDaChamada = () => { document.body.innerHTML = '<div style="padding:40px;font-size:20px">' + ${JSON.stringify(L.saiu)} + '</div>'; };
  window.__titulo = (t) => { document.title = t; document.getElementById('topo') && (document.getElementById('topo').textContent = t); };
</script></body></html>`;
}

function paginaHome(conta, dia, calendario, carregaMs) {
  const itens = (calendario[conta] && calendario[conta][dia]) || [];
  const li = itens.map((r) => `<li><div><span>${r.hora} – ${r.fim || r.hora}</span></div><div>${esc(r.titulo)}</div><i class="google-symbols">videocam</i></li>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Meet</title></head><body><h1>Google Meet</h1>
<div id="miolo"><div style="padding:20px">Carregando…</div></div>
<script>setTimeout(() => { document.getElementById('miolo').innerHTML = '<h2>Hoje</h2><h2>Próximas</h2><h3>a</h3><h3>b</h3><h3>c</h3><ul>' + ${JSON.stringify(li)} + '</ul>'; }, ${carregaMs});</script></body></html>`;
}

async function iniciar({ porta = 8443, idioma = 'pt' } = {}) {
  const estado = { calendario: { 0: {}, 1: {} }, pedidos: [], idioma, carregaMs: 400, saguao: false, tituloDe: (cod) => `Meet – ${cod}` };
  const srv = https.createServer(certificado(), (req, res) => {
    const u = new URL(req.url, 'https://meet.google.com');
    estado.pedidos.push(req.url);
    const L = ROTULOS[estado.idioma];
    res.setHeader('content-type', 'text/html; charset=utf-8');
    let m;
    if ((m = u.pathname.match(/^\/home(?:\/(\d{4})\/(\d{2})\/(\d{2}))?\/?$/))) {
      const dia = m[1] ? `${m[1]}-${m[2]}-${m[3]}` : (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
      return res.end(paginaHome(u.searchParams.get('authuser') || '0', dia, estado.calendario, estado.carregaMs));
    }
    if ((m = u.pathname.match(/^\/(?:meet\/)?([a-z]{3}-[a-z]{4}-[a-z]{3})\/?$/))) {
      return res.end(paginaDeChamada(L, { saguao: estado.saguao || u.searchParams.has('lobby'), titulo: estado.tituloDe(m[1]) }));
    }
    res.end(`<!doctype html><title>Meet</title><body><h1>Google Meet</h1><p>Videochamadas</p></body>`);
  });
  await new Promise((r) => srv.listen(porta, '127.0.0.1', r));
  estado.porta = porta;
  estado.fechar = () => new Promise((r) => srv.close(r));
  estado.url = (p) => `https://meet.google.com${p}`;
  return estado;
}
module.exports = { iniciar, ROTULOS };
