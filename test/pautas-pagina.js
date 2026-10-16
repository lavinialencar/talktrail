// Página de pautas (tela cheia): agenda por dia, filtros, editar a pauta de cada reunião, apagar e buscar mais dias.
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
  const itens = () => [...$('lista').querySelectorAll('.pauta-item')];

  console.log('Agenda');
  t('mostra as reuniões por dia, com o título do dia', [...$('lista').querySelectorAll('.pauta-dia b')].map((x) => x.textContent).join('|') === 'Hoje|' + new Date(`${dia(5)}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long' }));
  t('o rótulo "Agora" do Meet não vira reunião', itens().length === 3 && !itens().some((x) => /^Agora/.test(x.querySelector('.tit').textContent)));
  t('a hora é o destaque, antes do título', itens()[0].querySelector('.hora b').textContent === '23:00' && /Alinhamento/.test(itens()[0].querySelector('.tit').textContent));
  t('os contadores dos filtros batem (3 / 2 sem / 1 com)', $('nTodas').textContent === '3' && $('nSem').textContent === '2' && $('nCom').textContent === '1');
  t('o status diz a versão', /9\.9\.9/.test($('status').textContent));

  console.log('Filtros');
  w.document.querySelector('[data-filtro="sem"]').click();
  t('"Sem pauta" mostra só as reuniões sem pauta', itens().length === 2 && itens().every((x) => /Adicionar pauta/.test(x.textContent)));
  w.document.querySelector('[data-filtro="com"]').click();
  t('"Com pauta" mostra só as com pauta', itens().length === 1 && /Pauta pronta/.test(itens()[0].textContent));
  w.document.querySelector('[data-filtro="todas"]').click();

  console.log('Escrever a pauta');
  t('antes de escolher, o editor está recolhido', $('edCorpo').hidden === true && $('edVazio').hidden === false);
  itens()[2].querySelector('.abrir').click();
  await esp(30);
  t('escolher uma reunião abre o editor com o título e o horário', $('edCorpo').hidden === false && $('edTitulo').textContent === 'Planejamento do mês' && /10:00 às 11:00/.test($('edQuando').textContent));
  editores.edTxt.digitar('- revisar metas\n- decidir orçamento');
  await esp(450);
  const chave = `${dia(5)}|planejamento do mes`;
  t('digitar grava a pauta daquela reunião (com dia e hora)', loja.pautas[chave] && loja.pautas[chave].texto === '- revisar metas\n- decidir orçamento' && loja.pautas[chave].hora === '10:00' && loja.pautas[chave].data === dia(5), JSON.stringify(Object.keys(loja.pautas)));
  t('a linha passa a "Pauta pronta" e os contadores se ajustam', /Pauta pronta/.test(itens()[2].textContent) && $('nCom').textContent === '2' && $('nSem').textContent === '1');
  itens()[0].querySelector('.abrir').click();
  await esp(30);
  t('trocar de reunião troca o texto do editor', editores.edTxt.v === '' && $('edTitulo').textContent === 'Alinhamento com o cliente');

  console.log('Apagar e buscar');
  const apagar = itens()[1].querySelector('.apagar');
  apagar.click();
  await esp(20);
  t('apagar: o primeiro clique só pede confirmação', !!loja.pautas[`${dia(0)}|apresentacao do case`]);
  [...$('lista').querySelectorAll('.apagar')].find((b) => /Apagar\?/.test(b.textContent)).click();
  await esp(30);
  t('apagar: o segundo clique apaga só a pauta (a reunião continua na agenda)', !loja.pautas[`${dia(0)}|apresentacao do case`] && itens().length === 3);
  $('buscar').click();
  await esp(20);
  t('"Buscar os próximos 14 dias" pede ao fundo para ler 14 dias', enviadas.some((m) => m.type === 'atualizar-agenda' && m.dias === 14), JSON.stringify(enviadas));
  t('enquanto lê, avisa que abas do Meet podem abrir e trava o botão', /Meet podem abrir/.test($('status').textContent) && $('buscar').disabled === true);

  console.log(`\n${ok} ok, ${ruim} falharam`);
  process.exit(ruim ? 1 : 0);
})();
