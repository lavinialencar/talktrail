// Bateria em navegador de verdade: cada página da extensão (pacote da loja), em português e em inglês,
// com dados vazios, cheios e hostis, em vários tamanhos de janela. Clica em TUDO o que dá pra clicar e confere,
// depois de cada clique: janela não rolou, nenhuma exceção, nada vazou pra fora da tela, página não ficou em branco.
const { abrir, esp, relatorio } = require('./lib');
const { cenario } = require('./dados');
const R = relatorio('Páginas em navegador real');

const PAGINAS = [
  { arq: 'panel.html', larguras: [320, 436, 700], janelaNaoRola: true },
  { arq: 'pautas.html', larguras: [360, 800, 1280], janelaNaoRola: false },
  { arq: 'biblioteca.html', larguras: [360, 800, 1280], janelaNaoRola: false },
  { arq: 'boas-vindas.html', larguras: [360, 800], janelaNaoRola: false },
];
const SO = process.env.TT_SO ? process.env.TT_SO.split(',') : null; // ex.: TT_SO=panel.html

// roda dentro da página
const MEDIR = `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const W = document.documentElement.clientWidth;
  const estoura = [];
  const rolavel = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return true; } return false; };
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el) || ['SCRIPT', 'STYLE', 'OPTION'].includes(el.tagName)) continue;
    const r = el.getBoundingClientRect();
    if ((r.right > W + 1 || r.left < -1) && !rolavel(el) && getComputedStyle(el).position !== 'fixed') estoura.push(el.tagName + '.' + (el.className || el.id || '') + ' ' + Math.round(r.left) + '→' + Math.round(r.right));
    if (estoura.length >= 4) break;
  }
  // texto visível dentro da tela (detecta painel vazio por rolagem ou CSS)
  let textosNaTela = 0;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode()) && textosNaTela < 50;) {
    if (!n.nodeValue.trim() || !n.parentElement || !vis(n.parentElement)) continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    const r = rg.getBoundingClientRect();
    if (r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth) textosNaTela++;
  }
  return JSON.stringify({ scrollY: Math.round(scrollY), scrollX: Math.round(scrollX), horiz: document.documentElement.scrollWidth - W, estoura, textosNaTela, xss: !!window.__xss, altura: document.body.getBoundingClientRect().height });
})()`;

const CLICAVEIS = `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.pointerEvents !== 'none'; };
  const lista = [...document.querySelectorAll('button, input:not([type=file]), select, summary, [role=button], a[href], label, [onclick], .cartao, .dia, .item')].filter(vis);
  return JSON.stringify(lista.map((el, i) => ({ i, desc: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '') + ' "' + (el.innerText || el.value || el.getAttribute('aria-label') || el.title || '').trim().slice(0, 30).replace(/\\n/g, ' ') + '"' })));
})()`;

// o i-ésimo clicável, já levado pra tela, devolvendo o centro dele
const ALVO = (i) => `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.pointerEvents !== 'none'; };
  const lista = [...document.querySelectorAll('button, input:not([type=file]), select, summary, [role=button], a[href], label, [onclick], .cartao, .dia, .item')].filter(vis);
  const el = lista[${i}]; if (!el) return null;
  el.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = el.getBoundingClientRect();
  return JSON.stringify({ x: r.left + Math.min(r.width / 2, 40), y: r.top + r.height / 2 });
})()`;

const PERIGO = /apagar tudo|delete all|erase all|limpar tudo|clear all|remover tudo|restaurar|reset/i;


// ---- acessibilidade: todo botão/controle precisa de nome; imagem de alt; campo de rótulo
const ACESSIVEL = `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const nome = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText || el.value || '').trim() || [...el.querySelectorAll('img[alt]')].map((i) => i.alt).join('').trim() || (el.id && document.querySelector('label[for="' + el.id + '"]') ? 'rotulo' : '') || (el.closest('label') && el.closest('label').innerText.trim()) || '';
  const sem = [];
  for (const el of document.querySelectorAll('button, [role=button], a[href], select, input:not([type=hidden])')) { if (!vis(el) && !(el.type === 'checkbox' && el.closest('label'))) continue; if (!nome(el)) sem.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '')); }
  const imgs = [...document.querySelectorAll('img')].filter((i) => vis(i) && !i.hasAttribute('alt')).map((i) => i.getAttribute('src'));
  return JSON.stringify({ sem: sem.slice(0, 8), imgs: imgs.slice(0, 4), lang: document.documentElement.lang });
})()`;

// ---- contraste: pior razão entre a cor do texto e o fundo de verdade (sobe até achar um fundo opaco)
const CONTRASTE = `(() => {
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const mistura = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const fundo = (el) => { const pilha = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { pilha.push(c); if (c.a >= 1) break; } } let base = { r: 255, g: 255, b: 255, a: 1 }; if (getComputedStyle(document.documentElement).colorScheme.includes('dark') && !pilha.length) base = { r: 0, g: 0, b: 0, a: 1 }; for (const c of pilha.reverse()) base = mistura(c, base); return base; };
  const ruins = []; let n = 0;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t; (t = w.nextNode());) {
    const el = t.parentElement; if (!el || !t.nodeValue.trim() || ['SCRIPT', 'STYLE', 'OPTION'].includes(el.tagName)) continue;
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (!(r.width > 0 && r.height > 0) || cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    if (el.closest('[disabled], [aria-disabled=true], [hidden]')) continue;
    const fg = parse(cs.color); if (!fg) continue;
    const bg = fundo(el); const f = mistura({ ...fg, a: fg.a * Number(cs.opacity) }, bg);
    const L1 = lum(f), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    n++;
    if (ratio < 3 && parseFloat(cs.fontSize) >= 11) ruins.push(el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '') + ' "' + t.nodeValue.trim().slice(0, 24) + '" ' + ratio.toFixed(1));
  }
  return JSON.stringify({ n, ruins: ruins.slice(0, 6), total: ruins.length });
})()`;

// ---- Ajustes do painel: mouse de verdade em cada interruptor, na ordem, ida e volta
async function interruptoresDosAjustes(B, idioma) {
  const rotulo = `${idioma} · ajustes do painel (436px)`;
  const aba = await B.nova(B.url('panel.html'), { largura: 436, altura: 880 });
  await esp(1500);
  await aba.ev("document.getElementById('engrenagem').click()"); await esp(600);
  await aba.ev("document.querySelectorAll('#ajustes details').forEach((d) => { d.open = true; })"); await esp(300);
  const lista = JSON.parse(await aba.ev(`JSON.stringify([...document.querySelectorAll('#ajustes input[type=checkbox]')].map((c) => c.id))`));
  R.t(`${rotulo}: achou interruptores`, lista.length >= 3, String(lista.length));
  const ruins = [];
  for (const id of lista) {
    for (const volta of [false, true]) {
      // leva o interruptor pro meio da área rolável, como a pessoa faria rolando, e clica no rótulo visível
      await aba.ev(`(() => { const c = document.getElementById(${JSON.stringify(id)}); const a = document.getElementById('ajustes'); a.scrollTop = c.getBoundingClientRect().top + a.scrollTop - 300; })()`);
      await esp(150);
      const pos = JSON.parse(await aba.ev(`(() => { const c = document.getElementById(${JSON.stringify(id)}); const b = (c.closest('label') || c.parentElement).getBoundingClientRect(); return JSON.stringify({ x: b.left + b.width / 2, y: b.top + b.height / 2, antes: c.checked }); })()`));
      await aba.clique(pos.x, pos.y);
      await esp(350);
      const u = JSON.parse(await aba.ev(MEDIR));
      const agora = await aba.ev(`document.getElementById(${JSON.stringify(id)}).checked`);
      if (agora === pos.antes) ruins.push(`#${id}: o clique não mudou o interruptor`);
      if (u.scrollY || u.scrollX) { ruins.push(`#${id}: a janela rolou (${u.scrollY}) e o painel pode ter ficado em branco`); await aba.ev('scrollTo(0,0)'); }
      if (u.textosNaTela < 5) ruins.push(`#${id}: sobrou pouco texto na tela (${u.textosNaTela})`);
    }
  }
  R.t(`${rotulo}: cada interruptor liga e desliga com clique de verdade, sem rolar a janela`, ruins.length === 0, ruins.slice(0, 4).join(' | '));
  // o que foi ligado/desligado fica salvo
  const salvo = JSON.parse(await aba.ev(`chrome.storage.local.get('ajustes').then((x) => JSON.stringify(x.ajustes || {}))`));
  R.t(`${rotulo}: os ajustes foram gravados`, Object.keys(salvo).length > 0, JSON.stringify(salvo).slice(0, 120));
  R.t(`${rotulo}: sem erro na página`, aba.erros.length === 0, aba.erros.join(' | '));
  await aba.fecha();
}

async function auditorias(B, idioma) {
  for (const pg of PAGINAS) {
    if (SO && !SO.includes(pg.arq)) continue;
    for (const esquema of ['light', 'dark']) {
      const rotulo = `${idioma} · ${pg.arq} · tema ${esquema}`;
      const aba = await B.nova(B.url(pg.arq), { largura: pg.larguras[1], altura: 880 });
      await aba.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: esquema }] });
      await esp(1500);
      const m = JSON.parse(await aba.ev(MEDIR));
      R.t(`${rotulo}: tem texto na tela`, m.textosNaTela >= 2, String(m.textosNaTela));
      const c = JSON.parse(await aba.ev(CONTRASTE));
      R.t(`${rotulo}: nenhum texto com contraste abaixo de 3:1`, c.total === 0, `${c.total} de ${c.n}: ${c.ruins.join('; ')}`);
      if (esquema === 'light') {
        const a = JSON.parse(await aba.ev(ACESSIVEL));
        R.t(`${rotulo}: todo controle tem nome acessível`, a.sem.length === 0, a.sem.join(', '));
        R.t(`${rotulo}: toda imagem tem alt`, a.imgs.length === 0, a.imgs.join(', '));
        R.t(`${rotulo}: <html lang> definido`, !!a.lang, a.lang);
      }
      await aba.fecha();
    }
  }
}

// responde rápido com muitos dados (150 reuniões, uma com 4000 falas)
async function desempenho(B, idioma) {
  const abaSeed = await B.nova(B.url('boas-vindas.html'));
  await abaSeed.ev(`chrome.storage.local.clear().then(() => chrome.storage.local.set(${JSON.stringify(cenario('hostil'))}))`);
  await abaSeed.fecha();
  for (const arq of ['panel.html', 'pautas.html', 'biblioteca.html']) {
    const t0 = Date.now();
    const aba = await B.nova(B.url(arq), { largura: 900, altura: 800 });
    const livre = await aba.ev(`new Promise((res) => { const t = performance.now(); requestAnimationFrame(() => requestAnimationFrame(() => res(Math.round(performance.now() - t)))); })`);
    await aba.espera(`document.body.innerText.length > 100`, 15000);
    const total = Date.now() - t0;
    const mem = await aba.ev(`performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : 0`);
    R.t(`${idioma} · ${arq} com 150 reuniões (uma de 4000 falas): aparece em menos de 6 s`, total < 6000, `${total} ms`);
    R.t(`${idioma} · ${arq} com muitos dados: a página volta a responder em menos de 1,5 s`, livre < 1500, `${livre} ms`);
    R.t(`${idioma} · ${arq} com muitos dados: memória abaixo de 250 MB`, mem < 250, `${mem} MB`);
    await aba.fecha();
  }
}

async function testar(B, idioma, nomeCenario) {
  const abaSeed = await B.nova(B.url('boas-vindas.html'));
  await abaSeed.ev(`chrome.storage.local.clear().then(() => chrome.storage.local.set(${JSON.stringify(cenario(nomeCenario))}))`);
  await abaSeed.fecha();
  for (const pg of PAGINAS) {
    if (SO && !SO.includes(pg.arq)) continue;
    for (const largura of pg.larguras) {
      const rotulo = `${idioma} · ${nomeCenario} · ${pg.arq} · ${largura}px`;
      const aba = await B.nova(B.url(pg.arq), { largura, altura: 880 });
      aba.aceitaDialogo = false;
      await aba.send('Page.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});
      await esp(nomeCenario === 'hostil' ? 2500 : 1200);
      let m = JSON.parse(await aba.ev(MEDIR));
      R.t(`${rotulo}: carrega sem exceção`, aba.erros.length === 0, aba.erros.slice(0, 2).join(' | '));
      R.t(`${rotulo}: tem texto na tela`, m.textosNaTela >= 2, 'textos=' + m.textosNaTela);
      R.t(`${rotulo}: nada estoura pro lado`, m.horiz <= 1 && m.estoura.length === 0, `horiz=${m.horiz} ${m.estoura.join('; ')}`);
      R.t(`${rotulo}: nenhum HTML/script de título executou`, !m.xss);
      if (pg.janelaNaoRola) R.t(`${rotulo}: janela parada no topo`, m.scrollY === 0 && m.scrollX === 0, `y=${m.scrollY} x=${m.scrollX}`);

      // clica em tudo, um por vez, conferindo depois de cada clique
      const alvos = JSON.parse(await aba.ev(CLICAVEIS));
      const quebras = []; const abertas = new Set();
      const limite = Math.min(alvos.length, nomeCenario === 'vazio' ? 60 : 45);
      for (let i = 0; i < limite; i++) {
        const desc = alvos[i].desc;
        if (PERIGO.test(desc)) continue;
        let alvo; try { alvo = JSON.parse(await aba.ev(ALVO(i)) || 'null'); } catch (e) { continue; }
        if (!alvo) continue;
        const antes = aba.erros.length;
        await aba.clique(alvo.x, alvo.y);
        await esp(120);
        // abas novas que o clique abriu: anota o destino e fecha
        for (const t of await B.abas()) if (t.id !== aba.id && t.url !== 'about:blank') { abertas.add(t.url.replace(/[?#].*/, '').slice(0, 70)); fetch(`http://127.0.0.1:${B.porta}/json/close/${t.id}`).catch(() => {}); }
        let u; try { u = JSON.parse(await aba.ev(MEDIR)); } catch (e) { quebras.push(`${desc}: a página parou de responder (${e.message.slice(0, 60)})`); break; }
        const novos = aba.erros.slice(antes);
        if (novos.length) quebras.push(`${desc}: ${novos[0]}`);
        if (pg.janelaNaoRola && (u.scrollY || u.scrollX)) { quebras.push(`${desc}: a janela rolou (y=${u.scrollY})`); await aba.ev('scrollTo(0,0)'); }
        if (u.horiz > 1 && m.horiz <= 1) quebras.push(`${desc}: passou a estourar pro lado (${u.horiz}px)`);
        if (u.textosNaTela < 2) quebras.push(`${desc}: a tela ficou sem texto (painel em branco?)`);
        if (u.xss) quebras.push(`${desc}: script do título executou`);
        const url = await aba.ev('location.pathname').catch(() => '');
        if (!url.endsWith(pg.arq)) { if (!/^\/(panel|pautas|biblioteca|boas-vindas)\.html$/.test(url)) quebras.push(`${desc}: a página navegou pra ${url}`); await aba.ev(`location.href=${JSON.stringify(B.url(pg.arq))}`); await esp(700); }
      }
      R.t(`${rotulo}: clicou em ${limite} controles sem quebrar nada`, quebras.length === 0, quebras.slice(0, 3).join(' || '));
      const estranhas = [...abertas].filter((u) => !/^(chrome-extension:|chrome:\/\/extensions\/shortcuts|https:\/\/(meet\.google\.com|github\.com|buymeacoffee\.com|chromewebstore\.google\.com))/.test(u));
      R.t(`${rotulo}: só abriu destinos conhecidos`, estranhas.length === 0, estranhas.join(' '));

      // Tab pelo teclado: a janela também não pode rolar
      if (pg.janelaNaoRola) {
        let ruim = '';
        for (let k = 0; k < 40 && !ruim; k++) {
          await aba.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
          await aba.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
          const u = JSON.parse(await aba.ev(MEDIR));
          if (u.scrollY || u.scrollX) ruim = `Tab ${k}: janela rolou y=${u.scrollY}`;
        }
        R.t(`${rotulo}: percorrer com Tab não rola a janela`, !ruim, ruim);
      }
      await aba.fecha();
    }
  }
}

(async () => {
  const idiomas = process.env.TT_IDIOMAS ? process.env.TT_IDIOMAS.split(',') : ['pt-BR', 'en'];
  const cenarios = process.env.TT_CENARIOS ? process.env.TT_CENARIOS.split(',') : ['vazio', 'cheio', 'hostil'];
  for (const idioma of idiomas) {
    const B = await abrir({ idioma, isolarGoogle: true });
    try {
      for (const c of cenarios) { R.sec(`== ${idioma} · dados ${c}`); await testar(B, idioma, c); }
      if (!SO || SO.includes('panel.html')) { R.sec(`== ${idioma} · interruptores dos Ajustes`); const sw = await B.nova(B.url('boas-vindas.html')); await sw.ev(`chrome.storage.local.clear().then(() => chrome.storage.local.set(${JSON.stringify(cenario('cheio'))}))`); await sw.fecha(); await interruptoresDosAjustes(B, idioma); }
      R.sec(`== ${idioma} · claro/escuro, contraste, acessibilidade`); { const sw = await B.nova(B.url('boas-vindas.html')); await sw.ev(`chrome.storage.local.clear().then(() => chrome.storage.local.set(${JSON.stringify(cenario('cheio'))}))`); await sw.fecha(); }
      await auditorias(B, idioma);
      R.sec(`== ${idioma} · desempenho com muitos dados`); await desempenho(B, idioma);
    } finally { B.fechar(); }
  }
  R.fim();
})().catch((e) => { console.error(e); process.exit(2); });
