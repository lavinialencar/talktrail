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
  const criadasAbas = [];
  let fechou = false;
  let painelFechado = null;
  w.chrome = {
    commands: { getAll: () => Promise.resolve([]) },
    runtime: { onMessage: { addListener() {} }, sendMessage: (m) => { enviadas.push(m); return Promise.resolve(); }, getURL: (p) => p, getManifest: () => ({ version: '1.0.0' }) },
    tabs: { create: (o) => { criadasAbas.push(o.url); return Promise.resolve(); }, query: () => Promise.resolve([{ id: 1, windowId: 7 }]), sendMessage: () => (foraDoMeet ? Promise.reject(new Error('sem receptor')) : Promise.resolve(estado)) },
    sidePanel: { close: (o) => { painelFechado = o; return Promise.resolve(); } },
    storage: { onChanged: { addListener() {} }, local: {
      get: (k) => Promise.resolve(Object.fromEntries([].concat(k).filter((x) => x in loja).map((x) => [x, JSON.parse(JSON.stringify(loja[x]))]))),
      set: (o) => { Object.assign(loja, JSON.parse(JSON.stringify(o))); return Promise.resolve(); } } },
  };
  w.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  w.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  w.MBEditor = { create: (el, o) => (editores[el.id] = { v: '', setValue(x) { this.v = x; }, getValue() { return this.v; }, hasFocus: () => false, digitar(x) { this.v = x; o.onChange(x); } }) };
  w.close = () => { fechou = true; };
  w.eval(src);
  await esp(250);
  const $ = (id) => w.document.getElementById(id);

  const falhou = w.eval(`(() => { try { aplicar(${JSON.stringify(estado)}); return ''; } catch (e) { return e.message; } })()`);
  t('aplicar() com um estado normal não lança erro (nenhuma variável nova esconde outra)', falhou === '', falhou);
  const document_body_sem_alvo = () => w.document.body.classList.contains('sem-alvo');
  const itens = () => [...$('pautasLista').querySelectorAll('.pauta-item')];
  t('a agenda mostra as reuniões de hoje e de amanhã', itens().length === 2);
  t('cada dia tem o seu título (Hoje, Amanhã)', [...$('pautasLista').querySelectorAll('.pauta-dia b')].map((x) => x.textContent).join('|') === 'Hoje|Amanhã');
  t('o contador mostra todas as próximas', $('pautasN').textContent === '2');
  t('a ordem é por dia e hora, hoje primeiro', /23:59/.test(itens()[0].textContent) && /um mês/.test(itens()[1].textContent));
  t('título com HTML aparece como texto, sem criar elemento', !$('pautasLista').querySelector('img') && /<img/.test($('pautasLista').textContent));
  t('não existe mais "adicionar reunião" (nem formulário, nem pedir link)', !$('pautaForm') && !$('pautaNovo') && !$('pautaLink'));
  t('a hora é o destaque de cada linha, em negrito, antes do título', itens()[0].querySelector('.hora b').textContent === '23:59' && /^Apresentação/.test(itens()[0].querySelector('.tit').textContent) && itens()[1].querySelector('.hora b').textContent === '09:00');
  t('sem pauta, a linha convida: "Adicionar pauta"', /Adicionar pauta/.test(itens()[0].textContent));
  t('a próxima de hoje aparece em destaque, com quanto falta', $('proxima').hidden === false && /Apresentação/.test($('proximaTit').textContent) && /23:59 · em/.test($('proximaQuando').textContent));
  t('com a agenda recente, não pede atualização ao abrir', !enviadas.some((m) => m.type === 'atualizar-agenda'));

  $('pautasLista').querySelector('.abrir').click();
  await esp(50);
  const id = `${hoje}|${'apresentacao <img src=x onerror=alert(1)>'}`;
  t('não repete o nome da reunião nem tem botão de voltar (a linha escolhida já aparece destacada)', !$('pautaRot') && !$('pautaVoltar') && !!itens()[0].classList.contains('on'));
  t('escolhida a reunião, o editor aparece e a frase de orientação some', $('pautaEscolha').hidden === true && !document_body_sem_alvo());
  t('o editor mostra a pauta da reunião, não a da tag', editores.colaTxt.v === '');

  editores.colaTxt.digitar('- ponto A\n- ponto B');
  await esp(450);
  const salva = loja.pautas[id];
  t('digitar grava a pauta daquela reunião', !!salva && salva.texto === '- ponto A\n- ponto B', JSON.stringify(Object.keys(loja.pautas)));
  t('guarda título, dia e hora da agenda', salva && salva.data === hoje && salva.hora === '23:59' && /Apresentação/.test(salva.titulo));
  t('depois de escrever, a linha mostra "Pauta pronta"', /Pauta pronta/.test($('pautasLista').textContent));

  const colunaHora = w.document.querySelector('.pauta-item .hora');
  t('o horário fica centralizado na coluna (CSS: itens centralizados, sem padding assimétrico)', /align-items:\s*center/.test(require('fs').readFileSync(path.join(__dirname, '../extension/panel.css'), 'utf8').match(/\.pauta-item \.hora \{[^}]*\}/)[0]) && !/padding:\s*12px 8px 12px 14px/.test(require('fs').readFileSync(path.join(__dirname, '../extension/panel.css'), 'utf8')));
  $('pautasFrente').click();
  await esp(30);
  t('"Ver reuniões para frente" abre a página de Pautas e fecha o painel', criadasAbas.includes('pautas.html') && !!painelFechado && painelFechado.windowId === 7);
  // voltar para a reunião atual é só tocar na linha dela; sem botão extra

  const apagar = [...$('pautasLista').querySelectorAll('.apagar')][0];
  const antes = Object.keys(loja.pautas).length;
  apagar.click();
  await esp(20);
  t('apagar uma pauta: o primeiro clique só pede confirmação', Object.keys(loja.pautas).length === antes && /Apagar\?/.test($('pautasLista').textContent));
  [...$('pautasLista').querySelectorAll('.apagar')].find((b) => /Apagar\?/.test(b.textContent)).click();
  await esp(30);
  t('apagar uma pauta: o segundo clique apaga', Object.keys(loja.pautas).length === antes - 1);
  t('a reunião continua na agenda, só sem pauta', itens().length === 2 && !/Pauta pronta/.test($('pautasLista').textContent));

  // reunião que termina depois da meia-noite não aparece como "já acabou"
  const noite = w.eval(`(() => { const l = { id: 'x', titulo: 'Plantão', data: '${hoje}', hora: '23:45', fim: '00:15', texto: '', salva: false }; return itemDePauta(l).className; })()`);
  t('reunião que cruza a meia-noite não fica apagada antes da hora', !/passou/.test(noite) || new Date().getHours() === 23, noite);

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
  t('abre direto na aba Pauta, com a agenda aberta', $('cola').hidden === false && $('pautasPainel').hidden === false);
  await esp(80);
  t('com agenda velha, NÃO abre o Meet sozinho; só avisa que pode estar desatualizada', !enviadas.some((m) => m.type === 'atualizar-agenda') && /desatualizada/.test($('pautasLidaEm').textContent));
  $('pautasAtualizar').click();
  await esp(30);
  t('mas abre quando a pessoa toca em "Atualizar pelo Meet"', enviadas.some((m) => m.type === 'atualizar-agenda'));
  t('enquanto atualiza, o botão gira e fica desligado', $('pautasAtualizar').classList.contains('girando') && $('pautasAtualizar').disabled === true);
  t('a frase de orientação está no topo, antes do botão de atualizar', $('pautaEscolha').hidden === false && $('pautaEscolha').compareDocumentPosition($('pautasAtualizar')) & 4);
  $('pautasLista').querySelector('.abrir').click();
  await esp(50);
  t('escolhida a reunião, a lista recolhe e sobra só a escolhida', [...$('pautasLista').querySelectorAll('.pauta-item')].length === 1 && $('pautasMostrar').hidden === false && $('pautasFrente').hidden === true && $('proxima').hidden === true);
  $('pautasMostrar').click();
  await esp(30);
  t('"Mostrar todas as reuniões" reabre a lista inteira', [...$('pautasLista').querySelectorAll('.pauta-item')].length === 2 && $('pautasMostrar').hidden === true && $('pautasFrente').hidden === false);

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

  // o Meet marca a reunião em andamento com o rótulo "Agora": isso não é título
  m3.w.document.body.innerHTML = '<ul><li>15:30 – 16:00\nAgora\n1:1 Marinaldo</li></ul>'; // no navegador de verdade cada bloco vira uma linha de innerText
  await m3.tick(3200);
  ag = m3.loja.agendaMeet || [];
  t('o rótulo "Agora" do Meet não vira título', !ag.some((x) => /^agora$/i.test(x.titulo)) && ag.some((x) => x.titulo === '1:1 Marinaldo' && x.hora === '15:30' && x.fim === '16:00'), JSON.stringify(ag.filter((x) => x.hora === '15:30')));

  // segunda conta do Meet (outra lista no mesmo dia): junta, não apaga a primeira
  m3.w.document.body.innerHTML = '<ul><li><div>15:00 – 15:30</div><div>1:1 Brisas</div></li></ul>';
  await m3.tick(3200);
  ag = m3.loja.agendaMeet || [];
  t('a leitura da segunda conta se junta à da primeira', ag.some((x) => x.titulo === '1:1 Brisas') && ag.some((x) => x.titulo === 'Planejamento semanal'), JSON.stringify(ag));

  // atualizar pelo Meet: uma aba de fundo por conta, e cada uma fecha quando a leitura termina
  const m4b = await mundo();
  await m4b.w.chrome.runtime.sendMessage({ type: 'atualizar-agenda' });
  await m4b.tick(200);
  t('sem pedir nada, a leitura cobre uma semana (6 dias na fila depois de hoje)', require('vm').runInContext('filaDias.get(101).length', m4b.bgCtx) === 6, String(require('vm').runInContext('filaDias.get(101).length', m4b.bgCtx)));
  const m5 = await mundo();
  await m5.w.chrome.runtime.sendMessage({ type: 'atualizar-agenda', dias: 3 });
  await m5.tick(200);
  t('atualizar abre a tela inicial das duas contas, em aba de fundo', m5.criadas.length === 2 && /authuser=0/.test(m5.criadas[0]) && /authuser=1/.test(m5.criadas[1]), JSON.stringify(m5.criadas));
  // a página de Pautas pede mais dias: a fila de cada aba cresce
  const m7 = await mundo();
  await m7.w.chrome.runtime.sendMessage({ type: 'atualizar-agenda', dias: 14 });
  await m7.tick(200);
  t('pedindo 14 dias, cada conta ganha 13 dias na fila depois de hoje', require('vm').runInContext('filaDias.get(101).length', m7.bgCtx) === 13, String(require('vm').runInContext('filaDias.get(101).length', m7.bgCtx)));
  const m8 = await mundo();
  await m8.w.chrome.runtime.sendMessage({ type: 'atualizar-agenda', dias: 999 });
  await m8.tick(200);
  t('o pedido é limitado a 21 dias', require('vm').runInContext('filaDias.get(101).length', m8.bgCtx) === 20);

  // cada conta lê hoje, amanhã e depois de amanhã, na mesma aba, e só então fecha
  m5.bgMensagem({ type: 'agenda-lida' }, 101);
  await m5.tick(50);
  t('terminou de ler hoje: a mesma aba vai para amanhã', m5.atualizadas.some((x) => x.id === 101 && /\/home\/\d{4}\/\d{2}\/\d{2}\?authuser=0/.test(x.url)) && !m5.removidas.includes(101), JSON.stringify(m5.atualizadas));
  m5.bgMensagem({ type: 'agenda-lida' }, 101);
  await m5.tick(50);
  t('lê o terceiro dia', m5.atualizadas.filter((x) => x.id === 101).length === 2);
  m5.bgMensagem({ type: 'agenda-lida' }, 101);
  await m5.tick(50);
  t('lidos os três dias, a aba daquela conta fecha', m5.removidas.includes(101) && !m5.removidas.includes(102), JSON.stringify(m5.removidas));
  m5.removidas.length = 0;
  require('vm').runInContext('abasAtualizacao.add(101); filaDias.set(101, [])', m5.bgCtx);
  require('vm').runInContext('fecharAbaAtualizacao(101)', m5.bgCtx);
  t('quando uma conta termina de ler, só a aba dela fecha', m5.removidas.length === 1 && m5.removidas[0] === 101, JSON.stringify(m5.removidas));
  require('vm').runInContext('fecharAbaAtualizacao()', m5.bgCtx);
  t('o limite de tempo fecha as que sobraram', m5.removidas.length === 2 && m5.removidas.includes(102), JSON.stringify(m5.removidas));

  // aba escondida e lista vazia: pede pra ser trazida pra frente (o Meet pode não montar a lista escondido)
  const m6 = await mundo();
  Object.defineProperty(m6.w.document, 'visibilityState', { get: () => 'hidden', configurable: true });
  m6.w.history.pushState({}, '', '/home');
  m6.w.document.body.innerHTML = '<p>carregando</p>';
  await m6.tick(7000);
  t('aba escondida e sem lista: NÃO pede pra vir pra frente (o Meet nunca abre sozinho na frente)', !m6.msgsParaBg.some((x) => x.type === 'preciso-visivel'));
  t('nenhuma aba é trazida pra frente em toda a leitura', !m6.atualizadas.some((x) => x.active) && !m5.atualizadas.some((x) => x.active) && m5.criadasOpts.length > 0 && m5.criadasOpts.every((x) => x.active === false));
  await m6.tick(16000);
  t('depois de esperar bastante, guarda o diagnóstico da leitura (0 reuniões, aba escondida)', m6.loja.agendaDiag && m6.loja.agendaDiag.achados === 0 && m6.loja.agendaDiag.vis === 'hidden', JSON.stringify(m6.loja.agendaDiag));

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
