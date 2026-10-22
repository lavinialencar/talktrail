// Extensão (pacote da loja) num navegador de verdade, conversando com um Meet falso por HTTPS.
// Cobre: reconhecer a sala em todos os formatos de endereço, saguão, oferta, ligar legendas, transcrever (inclusive frase que
// cresce no mesmo bloco), cada idioma do Meet, sair da chamada, F5 no meio, arquivo .md baixado, e a agenda
// (ler ao abrir o painel, remarcação, cancelamento, duas contas).
const fs = require('fs'), path = require('path');
const { abrir, esp, relatorio } = require('./lib');
const { iniciar } = require('./meet-falso');
const R = relatorio('Meet falso em navegador real');
const PORTA = 8443 + Math.floor(Math.random() * 400);
const ISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const SO = process.env.TT_SO ? process.env.TT_SO.split(',') : null;
const quer = (n) => !SO || SO.includes(n);

const temOferta = (aba) => aba.ev(`(() => { const h = document.getElementById('talktrail-host'); const f = h && h.shadowRoot && h.shadowRoot.querySelector('.fab'); return !!f && !f.hidden && h.getBoundingClientRect().height > 0; })()`);
const clicarOferta = async (aba) => { await aba.espera(`!!document.getElementById('talktrail-host').shadowRoot.querySelector('[data-a="g"]')`, 12000); return aba.ev(`(() => { const b = document.getElementById('talktrail-host').shadowRoot.querySelector('[data-a="g"]'); if (!b) return false; b.click(); return true; })()`); };
const reunioes = async (B) => { const sw = await B.sw(); const tudo = JSON.parse(await sw.ev(`chrome.storage.local.get(null).then((x) => JSON.stringify(x))`)); sw.close(); return tudo; };
const lista = (tudo) => Object.entries(tudo).filter(([k]) => k.startsWith('reuniao:')).map(([, v]) => v);

async function endereços(B, meet) {
  R.sec('== reconhecer a sala pelo endereço');
  const casos = [
    ['/abc-defg-hij', true], ['/meet/abc-defg-hij', true], ['/abc-defg-hij?authuser=1', true], ['/abc-defg-hij?pli=1&authuser=2#x', true], ['/meet/abc-defg-hij?pli=1', true], ['/abc-defg-hij/', true],
    ['/', false], ['/home', false], ['/landing', false], ['/new', false], ['/abc-defg', false], ['/lookup/abc-defg-hij', false], ['/abcd-efgh-ijk', false], ['/ab-cdef-ghi', false],
  ];
  for (const [p, esperado] of casos) {
    const aba = await B.nova(meet.url(p), { largura: 1200, altura: 800 });
    await esp(2600);
    const tem = await temOferta(aba);
    R.t(`endereço ${p} ${esperado ? 'oferece transcrever' : 'não oferece nada'}`, tem === esperado, `oferta=${tem} erros=${aba.erros.join('|').slice(0, 120)}`);
    await aba.fecha();
  }
}

async function saguao(B, meet) {
  R.sec('== saguão: só oferece depois de entrar');
  const aba = await B.nova(meet.url('/abc-defg-hij?lobby=1'), { largura: 1200, altura: 800 });
  await esp(2500);
  R.t('no saguão (antes de entrar) a oferta não aparece', !(await temOferta(aba)));
  await aba.ev(`document.getElementById('entrar').click()`);
  await esp(2500);
  R.t('depois de entrar na chamada a oferta aparece', await temOferta(aba));
  await aba.fecha();
}

async function transcrever(B, meet, idioma) {
  R.sec(`== transcrever com o Meet em ${idioma}`);
  meet.idioma = idioma;
  const aba = await B.nova(meet.url('/meet/abc-defg-hij'), { largura: 1200, altura: 800 });
  await esp(2500);
  R.t(`[${idioma}] a oferta aparece`, await temOferta(aba));
  await clicarOferta(aba);
  await esp(9000); // a extensão liga as legendas sozinha
  const ligou = await aba.ev(`document.querySelector('#cc i').textContent`);
  R.t(`[${idioma}] ligou as legendas sozinha`, ligou === 'closed_caption', ligou);
  // Ana fala; a frase CRESCE no mesmo bloco (como o Meet faz), depois Carlos entra
  await aba.ev(`__falar('Ana', 'Bom dia')`); await esp(1800);
  await aba.ev(`__falar('Ana', 'Bom dia pessoal, vamos começar')`); await esp(1800);
  await aba.ev(`__falar('Ana', 'Bom dia pessoal, vamos começar a reunião de hoje.')`); await esp(2200);
  await aba.ev(`__falar('Carlos', 'Tudo bem, eu comecei pelo item um.')`); await esp(2500);
  await aba.ev(`__falar('Ana', 'Perfeito, anotado.', true)`); await esp(10000);
  let tudo = await reunioes(B);
  let rs = lista(tudo);
  R.t(`[${idioma}] uma reunião na biblioteca`, rs.length === 1, String(rs.length));
  const linhas = rs[0] ? rs[0].payload.transcript : [];
  const falas = linhas.filter((l) => l.speaker !== 'Talktrail');
  R.t(`[${idioma}] a frase que cresceu virou UMA linha, completa, sem repetir pedaços`, falas.filter((l) => l.speaker === 'Ana' && /vamos começar a reunião de hoje/.test(l.text)).length === 1 && !falas.some((l) => l.text === 'Bom dia'), JSON.stringify(falas));
  R.t(`[${idioma}] Carlos e a segunda fala da Ana entraram`, falas.some((l) => l.speaker === 'Carlos') && falas.some((l) => /Perfeito/.test(l.text)), JSON.stringify(falas.map((l) => l.speaker + ':' + l.text.slice(0, 20))));
  R.t(`[${idioma}] o botão "ir para o fim" não virou fala`, !linhas.some((l) => /Ir para o fim|Jump to bottom|Ir al final|最後へ/.test(l.text + l.speaker)));
  // F5 no meio da chamada: não pode criar uma segunda reunião nem perder o que já tinha
  await aba.send('Page.reload'); await esp(3500);
  R.t(`[${idioma}] depois do F5 a oferta volta`, await temOferta(aba));
  tudo = await reunioes(B); rs = lista(tudo);
  R.t(`[${idioma}] F5 não apaga a transcrição que já estava salva`, rs.length >= 1 && rs.some((r) => (r.payload.transcript || []).some((l) => /vamos começar/.test(l.text))), `reunioes=${rs.length}`);
  // sai da chamada
  await aba.ev(`__sairDaChamada()`); await esp(7000);
  tudo = await reunioes(B); rs = lista(tudo);
  const fechada = rs.filter((r) => r.payload.endedAt).length;
  R.t(`[${idioma}] ao sair da chamada a reunião é encerrada (tem endedAt)`, fechada >= 1, `encerradas=${fechada}/${rs.length}`);
  R.t(`[${idioma}] sem erro na página durante tudo isso`, aba.erros.length === 0, aba.erros.slice(0, 3).join(' | '));
  const md = (function () { try { const d = []; (function varre(p) { for (const f of fs.readdirSync(p, { withFileTypes: true })) f.isDirectory() ? varre(path.join(p, f.name)) : f.name.endsWith('.md') && d.push(path.join(p, f.name)); })(B.baixados); return d; } catch (e) { return []; } })();
  R.t(`[${idioma}] o arquivo .md foi baixado em Talktrail/AAAA-MM/`, md.length >= 1 && /Talktrail[\\/]\d{4}-\d{2}[\\/]/.test(md[0] || ''), md.join(', ') || '(nenhum)');
  if (md[0]) {
    const txt = fs.readFileSync(md[0], 'utf8');
    R.t(`[${idioma}] o .md tem as falas e quem falou`, /Ana/.test(txt) && /Carlos/.test(txt) && /vamos começar a reunião de hoje/.test(txt), txt.slice(0, 200));
    R.t(`[${idioma}] o .md não tem pedaços repetidos da frase que cresceu`, (txt.match(/Bom dia pessoal/g) || []).length === 1, String((txt.match(/Bom dia pessoal/g) || []).length));
  }
  await aba.fecha();
  // limpa pra o próximo idioma
  const sw = await B.sw(); await sw.ev(`chrome.storage.local.clear()`); sw.close();
  for (const f of fs.readdirSync(B.baixados)) fs.rmSync(path.join(B.baixados, f), { recursive: true, force: true });
}

// espera a leitura da agenda terminar: começou (abriu aba do Meet) e todas as abas de leitura fecharam
async function aguardarLeitura(B, max = 180000) {
  const ini = Date.now(); let viu = false;
  while (Date.now() - ini < max) {
    const meets = (await B.abas()).filter((t) => /meet\.google\.com/.test(t.url)).length;
    if (meets) viu = true;
    if (viu && !meets) { await esp(1500); return Date.now() - ini; }
    if (!viu && Date.now() - ini > 15000) return -1; // nunca começou
    await esp(1000);
  }
  return -2;
}
async function agenda(B, meet) {
  R.sec('== agenda: ler ao abrir, remarcação, cancelamento, duas contas');
  meet.idioma = 'pt';
  const hoje = ISO(new Date()), amanha = ISO(new Date(Date.now() + 86400000));
  meet.calendario[0][hoje] = [{ hora: '23:00', fim: '23:30', titulo: 'Reunião A' }, { hora: '23:40', fim: '23:55', titulo: 'Reunião B' }];
  meet.calendario[1][hoje] = [{ hora: '22:00', fim: '22:30', titulo: 'Da outra conta' }];
  meet.calendario[0][amanha] = [{ hora: '09:00', fim: '09:30', titulo: 'Amanhã cedo' }];
  const sw0 = await B.sw(); await sw0.ev(`chrome.storage.local.clear()`); sw0.close();
  const painel = await B.nova(B.url('panel.html'), { largura: 436, altura: 880 });
  const dur1 = await aguardarLeitura(B);
  R.t('abrir o painel começa a leitura sozinho e ela termina', dur1 > 0, `${dur1} ms`);
  let tudo = await reunioes(B);
  let ag = tudo.agendaMeet || [];
  const titulos = () => (ag || []).map((x) => `${x.data}|${x.hora}|${x.titulo}|c${x.conta}`);
  R.t('abrir o painel leu a agenda sozinho (sem tocar em nada)', ag.length >= 3, titulos().join('; '));
  R.t('as duas contas entraram', ag.some((x) => x.titulo === 'Da outra conta' && x.conta === '1') && ag.some((x) => x.titulo === 'Reunião A' && x.conta === '0'), titulos().join('; '));
  R.t('o dia seguinte também foi lido', ag.some((x) => x.titulo === 'Amanhã cedo'), titulos().join('; '));
  const abas1 = await B.abas();
  R.t('as abas de leitura fecharam sozinhas', abas1.filter((t) => /meet\.google\.com/.test(t.url)).length === 0, abas1.map((t) => t.url).join(', '));
  const texto = await painel.ev(`document.body.innerText`);
  R.t('o painel mostra as reuniões lidas', /Reunião A/.test(texto) && /Reunião B/.test(texto), texto.slice(0, 300).replace(/\n/g, ' | '));

  // mudou no Google Agenda: A remarcada, B cancelada, entrou C
  meet.calendario[0][hoje] = [{ hora: '23:15', fim: '23:45', titulo: 'Reunião A' }, { hora: '23:50', fim: '23:59', titulo: 'Reunião C' }];
  const sw = await B.sw(); await sw.ev(`chrome.storage.local.set({ agendaLidaEm: ${Date.now() - 20 * 60 * 1000} })`); sw.close(); // a lista ficou velha
  await painel.fecha();
  const painel2 = await B.nova(B.url('panel.html'), { largura: 436, altura: 880 });
  R.t('lista velha: abrir o painel de novo lê outra vez', (await aguardarLeitura(B)) > 0);
  tudo = await reunioes(B); ag = tudo.agendaMeet || [];
  R.t('reunião remarcada aparece só no horário novo', ag.filter((x) => x.titulo === 'Reunião A' && x.conta === '0').length === 1 && ag.some((x) => x.titulo === 'Reunião A' && x.hora === '23:15'), titulos().join('; '));
  R.t('reunião cancelada sumiu da lista', !ag.some((x) => x.titulo === 'Reunião B'), titulos().join('; '));
  R.t('reunião nova apareceu', ag.some((x) => x.titulo === 'Reunião C'), titulos().join('; '));
  R.t('a outra conta continua lá', ag.some((x) => x.titulo === 'Da outra conta'), titulos().join('; '));
  // dia ficou vazio
  meet.calendario[0][amanha] = [];
  const sw2 = await B.sw(); await sw2.ev(`chrome.storage.local.set({ agendaLidaEm: ${Date.now() - 20 * 60 * 1000} })`); sw2.close();
  await painel2.fecha();
  const painel3 = await B.nova(B.url('pautas.html'), { largura: 1000, altura: 800 });
  R.t('abrir a página de Pautas também lê', (await aguardarLeitura(B)) > 0);
  tudo = await reunioes(B); ag = tudo.agendaMeet || [];
  R.t('dia que ficou sem reunião esvazia (abrindo pela página de Pautas)', !ag.some((x) => x.titulo === 'Amanhã cedo'), titulos().join('; '));
  await painel3.fecha();
  // lista recente não é lida de novo (não fica abrindo aba toa)
  const pedidosAntes = meet.pedidos.length;
  const painel4 = await B.nova(B.url('panel.html'), { largura: 436, altura: 880 });
  await esp(6000);
  R.t('lista lida há pouco tempo não abre abas do Meet de novo', meet.pedidos.length === pedidosAntes, `pedidos novos=${meet.pedidos.length - pedidosAntes}`);
  await painel4.fecha();
}

(async () => {
  const meet = await iniciar({ porta: PORTA });
  const B = await abrir({ idioma: 'pt-BR', meetPorta: PORTA });
  try {
    if (quer('enderecos')) await endereços(B, meet);
    if (quer('saguao')) await saguao(B, meet);
    if (quer('transcrever')) for (const i of (process.env.TT_MEET_IDIOMAS || 'pt,en,es,ja').split(',')) await transcrever(B, meet, i);
    if (quer('agenda')) await agenda(B, meet);
  } finally { B.fechar(); await meet.fechar(); }
  R.fim();
})().catch((e) => { console.error(e); process.exit(2); });
