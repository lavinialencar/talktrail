// Pauta por reunião: lista no painel (agenda do Meet + as que a pessoa adiciona), edição de reunião futura,
// carga automática na sala (título + dia ou código) e leitura da agenda da tela inicial do Meet.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { mundo } = require('./_mundo');
let ok = 0, ruim = 0;
const t = (nome, cond, extra = '') => { cond ? ok++ : ruim++; console.log((cond ? '  ok  ' : ' FALHOU') + ' ' + nome + (extra ? '  ' + extra : '')); };
const esp = (ms) => new Promise((r) => setTimeout(r, ms));
const dia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoje = dia(new Date());
const amanha = dia(new Date(Date.now() + 86400000));

(async () => {
  // ---------------- painel ----------------
  console.log('Painel: lista de reuniões e pauta de cada uma');
  const html = fs.readFileSync(path.join(__dirname, '../extension/panel.html'), 'utf8').replace(/<script[^>]*><\/script>/g, '');
  const src = fs.readFileSync(path.join(__dirname, '../extension/panel.js'), 'utf8');
  const dom = new JSDOM(html, { url: 'chrome-extension://abc/panel.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const loja = { agendaMeet: [{ titulo: 'Apresentação <img src=x onerror=alert(1)>', data: amanha, hora: '16:00' }], pautas: {} };
  const estado = { fase: 'oculto', titulo: '', tags: [], segundos: 0, notes: '', cola: 'da tag', linhas: [], marcas: [], pautaId: '', sala: '' };
  const editores = {};
  w.chrome = {
    commands: { getAll: () => Promise.resolve([]) },
    runtime: { onMessage: { addListener() {} }, sendMessage: () => Promise.resolve(), getURL: (p) => p, getManifest: () => ({ version: '1.0.0' }) },
    tabs: { query: () => Promise.resolve([{ id: 1 }]), sendMessage: () => Promise.resolve(estado), create() {} },
    storage: { onChanged: { addListener() {} }, local: {
      get: (k) => Promise.resolve(Object.fromEntries([].concat(k).filter((x) => x in loja).map((x) => [x, JSON.parse(JSON.stringify(loja[x]))]))),
      set: (o) => { Object.assign(loja, JSON.parse(JSON.stringify(o))); return Promise.resolve(); } } },
  };
  w.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  w.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  w.MBEditor = { create: (el, o) => (editores[el.id] = { v: '', setValue(x) { this.v = x; }, getValue() { return this.v; }, hasFocus: () => false, digitar(x) { this.v = x; o.onChange(x); } }) };
  w.eval(src);
  await esp(250);
  const $ = (id) => w.document.getElementById(id);

  t('a agenda do Meet vira item da lista', $('pautasLista').children.length === 1);
  t('o contador mostra 1', $('pautasN').textContent === '1');
  t('título com HTML aparece como texto, sem criar elemento', !$('pautasLista').querySelector('img') && /<img/.test($('pautasLista').textContent));
  t('mostra "amanhã" e a hora', /amanhã · 16:00/.test($('pautasLista').textContent));

  $('pautasLista').querySelector('.abrir').click();
  await esp(50);
  const id = `${amanha}|${'apresentacao <img src=x onerror=alert(1)>'}`;
  t('escolher a reunião troca o rótulo do editor', /^Pauta: Apresentação/.test($('pautaRot').textContent));
  t('aparece o botão de voltar', $('pautaVoltar').hidden === false);
  t('o editor mostra a pauta da reunião, não a da tag', editores.colaTxt.v === '');

  editores.colaTxt.digitar('- ponto A\n- ponto B');
  await esp(450);
  const salva = loja.pautas[id];
  t('digitar grava a pauta daquela reunião', !!salva && salva.texto === '- ponto A\n- ponto B', JSON.stringify(Object.keys(loja.pautas)));
  t('guarda título, dia e hora da agenda', salva && salva.data === amanha && salva.hora === '16:00' && /Apresentação/.test(salva.titulo));
  t('o item passa a mostrar "com pauta"', /com pauta/.test($('pautasLista').textContent));

  $('pautaVoltar').click();
  await esp(50);
  t('voltar devolve a pauta da reunião atual (da tag)', editores.colaTxt.v === 'da tag' && $('pautaVoltar').hidden === true);

  $('pautaTitulo').value = 'Retro do time';
  $('pautaLink').value = 'https://meet.google.com/abc-defg-hij?authuser=0';
  $('pautaForm').dispatchEvent(new w.Event('submit', { cancelable: true }));
  await esp(50);
  const nova = Object.values(loja.pautas).find((e) => e.titulo === 'Retro do time');
  t('adicionar à mão cria a reunião com o código da sala', !!nova && nova.codigo === 'abc-defg-hij' && nova.data === hoje);
  t('a nova reunião já abre no editor', /^Pauta: Retro do time/.test($('pautaRot').textContent));

  $('pautaTitulo').value = '';
  $('pautaLink').value = 'sem codigo';
  const antes = Object.keys(loja.pautas).length;
  $('pautaForm').dispatchEvent(new w.Event('submit', { cancelable: true }));
  await esp(30);
  t('sem nome e sem código não cria nada', Object.keys(loja.pautas).length === antes);

  const apagar = [...$('pautasLista').querySelectorAll('.apagar')].pop();
  apagar.click();
  await esp(20);
  t('o primeiro clique só pede confirmação', Object.keys(loja.pautas).length === antes && /Apagar\?/.test($('pautasLista').textContent));
  [...$('pautasLista').querySelectorAll('.apagar')].find((b) => /Apagar\?/.test(b.textContent)).click();
  await esp(30);
  t('o segundo clique apaga', Object.keys(loja.pautas).length === antes - 1);

  // ---------------- script da página ----------------
  console.log('Script da página: sala, título e agenda da tela inicial');
  const idSala = `${hoje}|apresentacao case`;
  const m = await mundo({ loja: { pautas: { [idSala]: { titulo: 'Apresentação case', data: hoje, hora: '16:00', texto: '- abrir com o contexto\n- pedir feedback', criada: 1 } } } });
  m.w.document.title = 'Meet: Apresentação case';
  await m.tick(3200);
  const e1 = await m.estado();
  t('ao entrar na sala a pauta da reunião carrega sozinha (título + dia)', e1 && e1.cola === '- abrir com o contexto\n- pedir feedback', JSON.stringify(e1 && e1.cola));
  t('o painel recebe o id da pauta e o código da sala', e1 && e1.pautaId === idSala && e1.sala === 'abc-defg-hij');
  t('o código da sala fica gravado na pauta', m.loja.pautas[idSala].codigo === 'abc-defg-hij');

  await m.cmdPainel('cola', { text: '- só um ponto' });
  await m.tick(300);
  t('editar na sala atualiza a pauta da reunião', m.loja.pautas[idSala].texto === '- só um ponto');

  const m2 = await mundo({ loja: { pautas: { 'qualquer|outro': { titulo: 'Outro nome', data: '2026-01-01', codigo: 'abc-defg-hij', texto: 'por código', criada: 1, atualizada: 5 } } } });
  m2.w.document.title = 'Meet: Nome diferente do agendado';
  await m2.tick(3200);
  const e2 = await m2.estado();
  t('sem casar o título, casa pelo código da sala', e2 && e2.cola === 'por código' && e2.pautaId === 'qualquer|outro');

  const m3 = await mundo();
  m3.w.history.pushState({}, '', '/home/2026/10/20');
  m3.w.document.body.insertAdjacentHTML('beforeend', '<button aria-label="Planejamento semanal"><span>10:00 – 11:00</span></button><button aria-label="Quinta-feira, 15 de outubro">15</button>');
  await m3.tick(3200);
  const ag = m3.loja.agendaMeet || [];
  t('lê título e hora das reuniões da tela inicial', ag.length === 1 && ag[0].titulo === 'Planejamento semanal' && ag[0].hora === '10:00' && ag[0].data === '2026-10-20', JSON.stringify(ag));
  t('botões sem horário (tira de dias) não entram', !ag.some((x) => /feira/i.test(x.titulo)));

  console.log(`\n${ok} ok, ${ruim} falharam`);
  process.exit(ruim ? 1 : 0);
})();
