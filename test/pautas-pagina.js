// Página de pautas (tela cheia): calendário do mês, reuniões do dia, lista com filtros, editor, apagar e leitura de dias no Meet.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
let ok = 0, ruim = 0;
const t = (nome, cond, extra = '') => { cond ? ok++ : ruim++; console.log((cond ? '  ok  ' : ' FALHOU') + ' ' + nome + (extra ? '  ' + extra : '')); };
const esp = (ms) => new Promise((r) => setTimeout(r, ms));
const dia = (n) => { const d = new Date(Date.now() + n * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

(async () => {
  const html = fs.readFileSync(path.join(__dirname, '../extension/pautas.html'), 'utf8').replace(/<script[^>]*><\/script>/g, '');
  const src = fs.readFileSync(path.join(__dirname, '../extension/pautas.js'), 'utf8');
  const dom = new JSDOM(html, { url: 'chrome-extension://abc/pautas.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const loja = {
    agendaLidaEm: Date.now() - 60000,
    agendaDias: { [dia(0)]: Date.now(), [dia(1)]: Date.now() }, // hoje e amanhã já lidos (amanhã sem reunião)
    agendaMeet: [
      { titulo: 'Alinhamento com o cliente', data: dia(0), hora: '23:00', fim: '23:30' },
      { titulo: 'Apresentação do case', data: dia(0), hora: '23:40', fim: '23:55' },
      { titulo: 'Agora', data: dia(0), hora: '23:40', fim: '23:55' },
      { titulo: 'Planejamento do mês', data: dia(5), hora: '10:00', fim: '11:00' },
    ],
    pautas: { [`${dia(0)}|apresentacao do case`]: { titulo: 'Apresentação do case', data: dia(0), hora: '23:40', texto: '- abrir com o contexto', criada: 1 } },
  };
  const enviadas = [];
  const editores = {};
  w.chrome = {
    runtime: { sendMessage: (m) => { enviadas.push(m); return Promise.resolve(); }, getManifest: () => ({ version: '9.9.9' }) },
    storage: { onChanged: { addListener() {} }, local: {
      get: (k) => Promise.resolve(Object.fromEntries([].concat(k).filter((x) => x in loja).map((x) => [x, JSON.parse(JSON.stringify(loja[x]))]))),
      set: (o) => { Object.assign(loja, JSON.parse(JSON.stringify(o))); return Promise.resolve(); } } },
  };
  w.MBEditor = { create: (el, o) => (editores[el.id] = { v: '', setValue(x) { this.v = x; }, getValue() { return this.v; }, hasFocus: () => false, digitar(x) { this.v = x; o.onChange(x); } }) };
  w.eval(src);
  await esp(150);
  const $ = (id) => w.document.getElementById(id);
  const itens = () => [...w.document.querySelectorAll('#vCal .pauta-item, #vLista .pauta-item')].filter((x) => x.offsetParent !== null || true);
  const diasDaTela = () => [...$('calGrade').querySelectorAll('.dia')];
  const celula = (iso) => $('calGrade').querySelector(`[data-dia="${iso}"]`);

  console.log('Calendário');
  t('mostra o mês e o dia de hoje já escolhido', /\d{4}/.test($('mesNome').textContent) && celula(dia(0)).classList.contains('hoje') && celula(dia(0)).classList.contains('sel'));
  t('o cabeçalho do dia diz "Hoje" e quantas reuniões', /^Hoje,/.test($('diaNome').textContent) && $('diaN').textContent === '2 reuniões');
  t('o rótulo "Agora" do Meet não vira reunião', $('diaLista').children.length === 2);
  t('a hora é o destaque de cada linha, em negrito', $('diaLista').children[0].querySelector('.hora b').textContent === '23:00');
  t('dia com reunião sem pauta mostra a bolinha vazada ("falta pauta")', !!celula(dia(0)).querySelector('.ponto.sem'));
  t('dia sem nada não mostra bolinha', !celula(dia(1)).querySelector('.ponto'));
  t('os dias do mês estão todos na grade', diasDaTela().length >= 28 && diasDaTela().length <= 31);
  t('o status mostra a versão', /9\.9\.9/.test($('status').textContent));

  console.log('Dia lido e dia ainda não lido');
  celula(dia(1)).click();
  await esp(20);
  t('dia já lido e sem reunião: diz que não há, sem botão de ler', /Nenhuma reunião do Meet/.test($('diaVazioTxt').textContent) && $('lerDia').hidden === true);
  const alem = dia(40);
  for (let i = 0; i < 4 && !celula(alem); i++) $('mesProx').click(); // navega pelo calendário até o mês daquele dia
  celula(alem).click();
  await esp(20);
  t('dia que ainda não foi lido: avisa e oferece ler no Meet', /Ainda não li/.test($('diaVazioTxt').textContent) && $('lerDia').hidden === false);
  $('lerDia').click();
  await esp(20);
  t('ler o dia pede ao fundo só aquele dia, a partir dele', enviadas.some((m) => m.type === 'atualizar-agenda' && m.dias === 1 && m.desde === alem), JSON.stringify(enviadas));
  t('enquanto lê, o botão trava e avisa', $('lerDia').disabled === true && /Lendo/.test($('lerDia').textContent));
  loja.agendaDias[alem] = Date.now();
  await w.eval('carregar()');
  t('depois de lido (sem reunião), o aviso muda', /Nenhuma reunião do Meet/.test($('diaVazioTxt').textContent));

  console.log('Mês');
  const antes = $('mesNome').textContent;
  $('mesProx').click();
  t('o botão › vai para o mês seguinte', $('mesNome').textContent !== antes);
  $('irHoje').click();
  t('"Hoje" volta para o mês e o dia de hoje', celula(dia(0)) && celula(dia(0)).classList.contains('sel'));

  console.log('Escrever a pauta');
  t('antes de escolher, o editor mostra a orientação', $('edCorpo').hidden === true && $('edVazio').hidden === false);
  celula(dia(5)).click();
  await esp(20);
  $('diaLista').querySelector('.abrir').click();
  await esp(30);
  t('escolher a reunião abre o editor com título e horário', $('edCorpo').hidden === false && $('edTitulo').textContent === 'Planejamento do mês' && /10:00 às 11:00/.test($('edQuando').textContent));
  editores.edTxt.digitar('- revisar metas\n- decidir orçamento');
  await esp(450);
  const chave = `${dia(5)}|planejamento do mes`;
  t('digitar grava a pauta daquela reunião (com dia e hora)', loja.pautas[chave] && loja.pautas[chave].texto === '- revisar metas\n- decidir orçamento' && loja.pautas[chave].hora === '10:00' && loja.pautas[chave].data === dia(5));
  t('a linha passa a "Pauta pronta" e a bolinha do dia fica cheia', /Pauta pronta/.test($('diaLista').textContent) && !!celula(dia(5)).querySelector('.ponto.tem'));

  console.log('Lista e filtros');
  w.document.querySelector('[data-vista="lista"]').click();
  t('a lista mostra todas as próximas reuniões', $('lista').querySelectorAll('.pauta-item').length === 3 && $('nTodas').textContent === '3');
  t('contadores: 1 sem pauta, 2 com pauta', $('nSem').textContent === '1' && $('nCom').textContent === '2');
  w.document.querySelector('[data-filtro="sem"]').click();
  t('"Sem pauta" mostra só as que faltam', $('lista').querySelectorAll('.pauta-item').length === 1 && /Adicionar pauta/.test($('lista').textContent));
  w.document.querySelector('[data-filtro="com"]').click();
  t('"Com pauta" mostra só as prontas', $('lista').querySelectorAll('.pauta-item').length === 2);
  w.document.querySelector('[data-vista="calendario"]').click();

  console.log('Apagar e atualizar');
  w.document.querySelector('[data-vista="lista"]').click();
  w.document.querySelector('[data-filtro="todas"]').click();
  const apagar = $('lista').querySelectorAll('.apagar')[0];
  apagar.click();
  await esp(20);
  t('apagar: o primeiro clique só pede confirmação', Object.keys(loja.pautas).length === 2);
  [...$('lista').querySelectorAll('.apagar')].find((b) => /Apagar\?/.test(b.textContent)).click();
  await esp(30);
  t('apagar: o segundo clique apaga só a pauta; a reunião continua na agenda', Object.keys(loja.pautas).length === 1 && $('lista').querySelectorAll('.pauta-item').length === 3);
  $('atualizar').click();
  await esp(20);
  t('"Atualizar os próximos 14 dias" pede 14 dias ao fundo e avisa que abas vão abrir', enviadas.some((m) => m.type === 'atualizar-agenda' && m.dias === 14 && !m.desde) && /abas de fundo/.test($('status').textContent) && $('atualizar').disabled === true && $('parar').hidden === false);
  $('parar').click();
  await esp(20);
  t('"Parar a leitura" cancela e o botão some', enviadas.some((m) => m.type === 'cancelar-agenda') && $('parar').hidden === true && /lidas até/.test($('status').textContent));

  console.log(`\n${ok} ok, ${ruim} falharam`);
  process.exit(ruim ? 1 : 0);
})();
