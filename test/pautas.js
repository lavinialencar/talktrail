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
  const loja = { agendaMeet: [{ titulo: 'Apresentação <img src=x onerror=alert(1)>', data: hoje, hora: '23:59' }, { titulo: 'Daqui a um mês', data: amanha, hora: '09:00' }], pautas: {}, agendaLidaEm: Date.now() };
  const enviadas = [];
  const estado = { fase: 'oculto', titulo: '', projeto: '', tags: [], segundos: 0, notes: '', cola: 'da tag', linhas: [], marcas: [], pautaId: '', sala: '', esconderLegendas: false, legendas: true, legendasMotivo: '', modoSalvar: 'extensao', salvoEm: 0, avisoChat: '', info: '', erro: '' };
  const editores = {};
  let foraDoMeet = false;
  w.chrome = {
    commands: { getAll: () => Promise.resolve([]) },
    runtime: { onMessage: { addListener() {} }, sendMessage: (m) => { enviadas.push(m); return Promise.resolve(); }, getURL: (p) => p, getManifest: () => ({ version: '1.0.0' }) },
    tabs: { query: () => Promise.resolve([{ id: 1 }]), sendMessage: () => (foraDoMeet ? Promise.reject(new Error('sem receptor')) : Promise.resolve(estado)), create() {} },
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

  const falhou = w.eval(`(() => { try { aplicar(${JSON.stringify(estado)}); return ''; } catch (e) { return e.message; } })()`);
  t('aplicar() com um estado normal não lança erro (nenhuma variável nova esconde outra)', falhou === '', falhou);
  t('a reunião de hoje vira item da lista', $('pautasLista').children.length === 1);
  t('o contador mostra só as de hoje', $('pautasN').textContent === '1');
  t('título com HTML aparece como texto, sem criar elemento', !$('pautasLista').querySelector('img') && /<img/.test($('pautasLista').textContent));
  t('mostra "hoje" e a hora', /hoje · 23:59/.test($('pautasLista').textContent));
  t('reunião de outro dia fica em "Próximos dias", não na lista de hoje', $('pautasProxLista').children.length === 1 && !/um mês/.test($('pautasLista').textContent) && $('pautasProximos').hidden === false);
  t('a próxima de hoje aparece em destaque, com quanto falta', $('proxima').hidden === false && /Apresentação/.test($('proximaTit').textContent) && /23:59 · em/.test($('proximaQuando').textContent));
  t('com a agenda recente, não pede atualização ao abrir', !enviadas.some((m) => m.type === 'atualizar-agenda'));

  $('pautasLista').querySelector('.abrir').click();
  await esp(50);
  const id = `${hoje}|${'apresentacao <img src=x onerror=alert(1)>'}`;
  t('escolher a reunião troca o rótulo do editor', /^Pauta: Apresentação/.test($('pautaRot').textContent));
  t('aparece o botão de voltar', $('pautaVoltar').hidden === false);
  t('o editor mostra a pauta da reunião, não a da tag', editores.colaTxt.v === '');

  editores.colaTxt.digitar('- ponto A\n- ponto B');
  await esp(450);
  const salva = loja.pautas[id];
  t('digitar grava a pauta daquela reunião', !!salva && salva.texto === '- ponto A\n- ponto B', JSON.stringify(Object.keys(loja.pautas)));
  t('guarda título, dia e hora da agenda', salva && salva.data === hoje && salva.hora === '23:59' && /Apresentação/.test(salva.titulo));
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

  console.log('Aviso de extensão não autorizada');
  const criadas = [];
  w.chrome.tabs.create = (o) => criadas.push(o.url);
  w.eval(`aplicar(${JSON.stringify({ ...estado, fase: 'gravando', erro: 'Esta extensão não está autorizada no servidor da pasta. A reunião continua guardada na extensão. Abra http://127.0.0.1:8787/ e clique em "Parear de novo".' })})`);
  t('o aviso mostra o botão de abrir a página de pareamento', $('ligar').hidden === false && /pareamento/i.test($('ligar').textContent));
  $('ligar').click();
  t('o botão abre a página do servidor local', criadas.includes('http://127.0.0.1:8787/'), JSON.stringify(criadas));
  w.eval(`aplicar(${JSON.stringify(estado)})`);

  console.log('Painel fora do Meet');
  foraDoMeet = true;
  loja.agendaLidaEm = Date.now() - 3 * 3600 * 1000; // agenda velha
  w.document.getElementById('abaNotas').click();
  await w.eval('carregarPautas()'); // pega a agenda velha
  await w.eval("cmd('estado')");
  await esp(150);
  t('sem Meet na aba, o painel entra no modo "fora"', w.document.body.classList.contains('fora'));
  t('abre direto na aba Pauta, com a lista de reuniões aberta', $('cola').hidden === false && $('pautasPainel').hidden === false);
  await esp(80);
  t('com agenda velha, pede pro fundo atualizar pelo Meet', enviadas.some((m) => m.type === 'atualizar-agenda'));

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
  // a estrutura real da tela inicial do Meet: <li> com horário e título em texto, sem botão nem aria-label
  m3.w.document.body.insertAdjacentHTML('beforeend', '<ul><li><div><span>10:00 – 11:00</span></div><div>Planejamento semanal</div></li><li><span>videocam</span></li></ul><button aria-label="Quinta-feira, 15 de outubro">15</button>');
  await m3.tick(3200);
  let ag = m3.loja.agendaMeet || [];
  t('lê título e hora das reuniões da tela inicial (estrutura real: li com texto)', ag.length === 1 && ag[0].titulo === 'Planejamento semanal' && ag[0].hora === '10:00' && ag[0].data === '2026-10-20', JSON.stringify(ag));
  t('item sem horário (ícone, tira de dias) não entra', !ag.some((x) => /feira|videocam/i.test(x.titulo)));
  t('guarda a hora da última leitura', typeof m3.loja.agendaLidaEm === 'number');

  // segunda conta do Meet (outra lista no mesmo dia): junta, não apaga a primeira
  m3.w.document.body.innerHTML = '<ul><li><div>15:00 – 15:30</div><div>1:1 Brisas</div></li></ul>';
  await m3.tick(3200);
  ag = m3.loja.agendaMeet || [];
  t('a leitura da segunda conta se junta à da primeira', ag.length === 2 && ag.some((x) => x.titulo === '1:1 Brisas') && ag.some((x) => x.titulo === 'Planejamento semanal'), JSON.stringify(ag));

  // atualizar pelo Meet: uma aba de fundo por conta, e cada uma fecha quando a leitura termina
  const m5 = await mundo();
  await m5.w.chrome.runtime.sendMessage({ type: 'atualizar-agenda' });
  await m5.tick(200);
  t('atualizar abre a tela inicial das duas contas, em aba de fundo', m5.criadas.length === 2 && /authuser=0/.test(m5.criadas[0]) && /authuser=1/.test(m5.criadas[1]), JSON.stringify(m5.criadas));
  require('vm').runInContext('fecharAbaAtualizacao(101)', m5.bgCtx);
  t('quando uma conta termina de ler, só a aba dela fecha', m5.removidas.length === 1 && m5.removidas[0] === 101, JSON.stringify(m5.removidas));
  require('vm').runInContext('fecharAbaAtualizacao()', m5.bgCtx);
  t('o limite de tempo fecha as que sobraram', m5.removidas.length === 2 && m5.removidas.includes(102), JSON.stringify(m5.removidas));

  console.log('Fundo: contagem no ícone');
  const bg = m.bgCtx;
  const dia0 = new Date(2026, 9, 14, 15, 0); // 14/10/2026, 15:00
  const agenda = [{ titulo: 'Passou', data: '2026-10-14', hora: '14:00' }, { titulo: 'Daqui a 50', data: '2026-10-14', hora: '15:50' },
    { titulo: 'Mais tarde', data: '2026-10-14', hora: '17:20' }, { titulo: 'Outro dia', data: '2026-10-15', hora: '15:10' }];
  const f = (a, d) => require('vm').runInContext('proximaDeHoje', bg)(a, d);
  const p1 = f(agenda, dia0);
  t('mostra quanto falta pra próxima de hoje (50m)', p1 && p1.texto === '50m' && p1.titulo === 'Daqui a 50', JSON.stringify(p1));
  t('uma hora e pouco vira "1h20"', f([{ titulo: 'x', data: '2026-10-14', hora: '16:20' }], dia0).texto === '1h20');
  t('hora cheia vira "2h"', f([{ titulo: 'x', data: '2026-10-14', hora: '17:00' }], dia0).texto === '2h');
  t('reunião só de outro dia não aparece', f([{ titulo: 'x', data: '2026-10-15', hora: '15:10' }], dia0) === null);
  t('reunião já passada não aparece', f([{ titulo: 'x', data: '2026-10-14', hora: '14:00' }], dia0) === null);
  t('muito longe (mais de 8 h) não cutuca', f([{ titulo: 'x', data: '2026-10-14', hora: '23:30' }], dia0) === null);
  t('sem agenda não quebra', f(undefined, dia0) === null && f([], dia0) === null);
  const m4 = await mundo();
  await m4.tick(1000);
  m4.sairDaChamada();
  await m4.tick(2500);
  t('ao sair da chamada o painel é fechado (close), não desligado de vez', (m4.painel.fechamentos || 0) >= 1, String(m4.painel.fechamentos));

  console.log(`\n${ok} ok, ${ruim} falharam`);
  process.exit(ruim ? 1 : 0);
})();
