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
  w.eval(require('fs').readFileSync(path.join(__dirname, '../extension/modelo.js'), 'utf8'));
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
  t('o editor mostra o modelo (lista numerada + combinados), não a pauta da tag', editores.colaTxt.v === '1. \n2. \n3. \n\nCombinados\n- [ ] ');
  t('só abrir a reunião não grava nada: o modelo não vira pauta sozinho', Object.keys(loja.pautas).length === 0);

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

  t('o painel não tem mais o bloco "Anteriores"', !w.document.getElementById('pautasAnteriores') && !/Anteriores/.test(w.document.body.textContent));
  console.log('Painel na tela inicial do Meet');
  {
    const antes = foraDoMeet;
    w.eval(`aplicar(${JSON.stringify({ ...estado, semSala: true })})`);
    t('estado "semSala" (tela inicial do Meet): o painel vira agenda, sem editor da sala anterior', w.document.body.classList.contains('fora') && w.document.body.classList.contains('sem-alvo'));
    w.eval(`aplicar(${JSON.stringify({ ...estado, semSala: false })})`);
    t('entrou numa sala: volta ao painel normal', !w.document.body.classList.contains('fora'));
    foraDoMeet = antes;
  }
  {
    w.eval(`aplicar(${JSON.stringify({ ...estado, semSala: false, fase: 'oferta' })})`);
    w.eval(`aplicar(${JSON.stringify({ ...estado, semSala: true, fase: 'oferta' })})`);
    t('tela inicial do Meet com a oferta da sala anterior ainda no ar: o painel vira agenda mesmo assim', w.document.body.classList.contains('fora'));
    w.eval(`aplicar(${JSON.stringify({ ...estado, semSala: false })})`);
  }
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
  t('com agenda velha, NÃO abre o Meet sozinho; só marca o botão (bolinha e dica) como possivelmente desatualizado', !enviadas.some((m) => m.type === 'atualizar-agenda') && /desatualizada/.test($('pautasAtualizar').title) && $('pautasAtualizar').classList.contains('velha') && !w.document.getElementById('pautasLidaEm'));
  $('pautasAtualizar').click();
  await esp(30);
  t('mas abre quando a pessoa toca em "Atualizar pelo Meet"', enviadas.some((m) => m.type === 'atualizar-agenda'));
  t('enquanto atualiza, o botão gira e fica desligado', $('pautasAtualizar').classList.contains('girando') && $('pautasAtualizar').disabled === true);
  t('a frase de orientação está no topo, antes do botão de atualizar', $('pautaEscolha').hidden === false && $('pautaEscolha').compareDocumentPosition($('pautasAtualizar')) & 4);
  t('ao abrir fora do Meet só tem a lista: sem reunião escolhida, sem editor, sem linha marcada', w.document.body.classList.contains('sem-alvo') && !$('pautasLista').querySelector('.pauta-item.on') && /\.fora\.sem-alvo #colaTxt \{ display: none; \}/.test(require('fs').readFileSync(path.join(__dirname, '../extension/panel.css'), 'utf8')));
  $('pautasLista').querySelector('.abrir').click();
  await esp(50);
  t('tocar numa reunião recolhe a lista nela e abre o editor', !w.document.body.classList.contains('sem-alvo') && $('pautasLista').querySelectorAll('.pauta-item').length === 1 && $('pautasMostrar').hidden === false && $('pautasFrente').hidden === true);
  t('o editor mostra o modelo da pauta', editores.colaTxt.v === '1. \n2. \n3. \n\nCombinados\n- [ ] ');
  $('pautasMostrar').click();
  await esp(40);
  t('"Mostrar todas as reuniões" volta à lista inteira, sem editor', w.document.body.classList.contains('sem-alvo') && $('pautasLista').querySelectorAll('.pauta-item').length === 2 && $('pautasMostrar').hidden === true && !$('pautasLista').querySelector('.pauta-item.on'));
  $('pautasLista').querySelectorAll('.abrir')[1].click();
  await esp(40);
  t('dá pra escolher outra reunião em seguida', !w.document.body.classList.contains('sem-alvo') && /um mês/.test($('pautasLista').textContent));
  w.eval(`aplicar(${JSON.stringify({ ...estado, semSala: false, sala: 'abc-defg-hij', pautaId: 'x|y' })})`);
  await esp(40);
  t('entrar numa sala descarta a reunião escolhida na agenda: vale a pauta da sala', !w.document.body.classList.contains('fora') && w.document.body.classList.contains('sem-alvo'));
  w.eval(`aplicar(${JSON.stringify({ ...estado, semSala: true, sala: '' })})`);
  await esp(40);

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

  // sala de espera de reunião agendada: sem título na tela, "Programada para <dia> <hora>" acha a pauta
  const futuro = new Date(Date.now() + 3 * 86400000);
  const isoF = `${futuro.getFullYear()}-${String(futuro.getMonth() + 1).padStart(2, '0')}-${String(futuro.getDate()).padStart(2, '0')}`;
  const mesesPt = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const idH = `${isoF}|alinhamento sem titulo no meet`;
  const mH = await mundo({ loja: { agendaMeet: [{ titulo: 'Alinhamento sem título no Meet', data: isoF, hora: '10:00', fim: '10:30' }], pautas: { [idH]: { titulo: 'Alinhamento sem título no Meet', data: isoF, hora: '10:00', texto: '1. pauta achada pelo horário', criada: 1, atualizada: 2 } } } });
  mH.w.document.title = 'Reunião';
  mH.w.document.body.insertAdjacentHTML('beforeend', `<div>Programada para</div><div>seg., ${futuro.getDate()} de ${mesesPt[futuro.getMonth()]}. 10:00</div>`);
  await mH.tick(3200);
  const eH = await mH.estado();
  t('na sala de espera sem título, o dia e a hora ("Programada para ...") acham a pauta', eH && eH.cola === '1. pauta achada pelo horário' && eH.pautaId === idH, JSON.stringify(eH && [eH.cola, eH.pautaId]));
  t('e a sala fica guardada na pauta, pra próxima vez casar pelo código', mH.loja.pautas[idH].codigo === 'abc-defg-hij');

  // a pauta chega depois de a sala abrir (arquivo editado, importação): liga sozinha
  const mT = await mundo();
  mT.w.document.title = 'Reunião';
  await mT.tick(3200);
  t('sala sem pauta nenhuma: nada carregado', ((await mT.estado()) || {}).cola === '');
  mT.loja.pautas = { 'qualquer|outra': { titulo: 'Reunião da IA', data: '2026-01-01', codigo: 'abc-defg-hij', texto: 'chegou pelo arquivo', criada: 1, atualizada: 3 } };
  mT.mudouLoja({ pautas: { newValue: mT.loja.pautas } });
  await mT.tick(300);
  t('a pauta que chega depois (código da sala no arquivo) carrega sozinha', ((await mT.estado()) || {}).cola === 'chegou pelo arquivo');

  // troca de sala sem recarregar (tela inicial do Meet, outra sala de espera): a pauta acompanha
  const mS = await mundo({ loja: { pautas: {
    'qualquer|a': { titulo: 'Reunião A', data: '2026-01-01', codigo: 'abc-defg-hij', texto: 'pauta da sala A', criada: 1, atualizada: 2 },
    'qualquer|b': { titulo: 'Reunião B', data: '2026-01-01', codigo: 'xyz-wxyz-xyz', texto: 'pauta da sala B', criada: 1, atualizada: 2 } } } });
  mS.w.document.title = 'Reunião';
  await mS.tick(3200);
  t('sala A: carrega a pauta A', ((await mS.estado()) || {}).cola === 'pauta da sala A');
  mS.w.history.pushState({}, '', '/home');
  await mS.tick(3200);
  const eHome = await mS.estado();
  t('foi pra tela inicial: a pauta da sala anterior sai e o painel entra em modo agenda', eHome && eHome.cola === '' && eHome.semSala === true && eHome.pautaId === '', JSON.stringify(eHome && [eHome.cola, eHome.semSala]));
  mS.w.history.pushState({}, '', '/xyz-wxyz-xyz');
  await mS.tick(3200);
  const eB = await mS.estado();
  t('abriu outra sala: carrega a pauta B, não a A', eB && eB.cola === 'pauta da sala B' && eB.semSala === false, JSON.stringify(eB && eB.cola));
  mS.w.history.pushState({}, '', '/qqq-qqqq-qqq');
  await mS.tick(3200);
  t('sala sem pauta nenhuma: fica vazia, sem a da sala anterior', ((await mS.estado()) || {}).cola === '');
  // rapidez: a troca de sala chega no painel em menos de meio segundo
  mS.w.history.pushState({}, '', '/abc-defg-hij');
  const antesN = mS.msgsParaBg.length;
  await mS.tick(500);
  const envios = mS.msgsParaBg.slice(antesN).filter((x) => x.type === 'state');
  t('a troca de sala chega no painel em até 0,5 s, já com a pauta nova', envios.length > 0 && envios[envios.length - 1].state.cola === 'pauta da sala A', JSON.stringify(envios.map((x) => x.state.cola)));

  const m3 = await mundo();
  const dataLida = new Date(Date.now() + 86400000), p2m = (n) => String(n).padStart(2, '0');
  const diaLido = `${dataLida.getFullYear()}-${p2m(dataLida.getMonth() + 1)}-${p2m(dataLida.getDate())}`; // um dia de amanhã: a data fixa do teste virava passado
  m3.w.history.pushState({}, '', '/home/' + diaLido.replace(/-/g, '/'));
  // a estrutura real da tela inicial do Meet: <li> com horário e título em texto, sem botão nem aria-label
  m3.w.document.body.insertAdjacentHTML('beforeend', '<ul><li><div><span>10:00 – 11:00</span></div><div>Planejamento semanal</div></li><li><span>videocam</span></li></ul><button aria-label="Quinta-feira, 15 de outubro">15</button>');
  await m3.tick(3200);
  let ag = m3.loja.agendaMeet || [];
  t('lê título e hora das reuniões da tela inicial (estrutura real: li com texto)', ag.length === 1 && ag[0].titulo === 'Planejamento semanal' && ag[0].hora === '10:00' && ag[0].data === diaLido, JSON.stringify(ag));
  t('item sem horário (ícone, tira de dias) não entra', !ag.some((x) => /feira|videocam/i.test(x.titulo)));
  t('guarda a hora da última leitura', typeof m3.loja.agendaLidaEm === 'number');

  // o Meet marca a reunião em andamento com o rótulo "Agora": isso não é título
  m3.w.document.body.innerHTML = '<ul><li>15:30 – 16:00\nAgora\n1:1 Marinaldo</li></ul>'; // no navegador de verdade cada bloco vira uma linha de innerText
  await m3.tick(3200);
  ag = m3.loja.agendaMeet || [];
  t('o rótulo "Agora" do Meet não vira título', !ag.some((x) => /^agora$/i.test(x.titulo)) && ag.some((x) => x.titulo === '1:1 Marinaldo' && x.hora === '15:30' && x.fim === '16:00'), JSON.stringify(ag.filter((x) => x.hora === '15:30')));

  // segunda conta do Meet (outra lista no mesmo dia): junta, não apaga a primeira
  const caminhoDia = '/home/' + diaLido.replace(/-/g, '/');
  m3.w.history.pushState({}, '', caminhoDia + '?authuser=1');
  m3.w.document.body.innerHTML = '<ul><li><div>15:00 – 15:30</div><div>1:1 Brisas</div></li></ul>';
  await m3.tick(3200);
  ag = m3.loja.agendaMeet || [];
  t('a leitura da segunda conta se junta à da primeira', ag.some((x) => x.titulo === '1:1 Brisas' && x.conta === '1') && ag.some((x) => x.titulo === '1:1 Marinaldo' && x.conta === '0'), JSON.stringify(ag));

  // a mesma conta lê de novo e a reunião foi remarcada no Google Agenda: a lista acompanha, sem sobrar o horário velho
  m3.w.document.body.innerHTML = '<ul><li><div>16:00 – 16:30</div><div>1:1 Brisas</div></li></ul>';
  await m3.tick(3200);
  ag = m3.loja.agendaMeet || [];
  t('reunião remarcada: fica só o horário novo', ag.filter((x) => x.titulo === '1:1 Brisas').length === 1 && ag.some((x) => x.titulo === '1:1 Brisas' && x.hora === '16:00'), JSON.stringify(ag));
  t('remarcar numa conta não mexe nas reuniões da outra', ag.some((x) => x.titulo === '1:1 Marinaldo' && x.conta === '0'));

  // a mesma conta lê de novo e uma reunião sumiu (cancelada): sai da lista
  m3.w.document.body.innerHTML = '<ul><li><div>17:00 – 17:30</div><div>Outra coisa</div></li></ul>';
  await m3.tick(3200);
  ag = m3.loja.agendaMeet || [];
  t('reunião cancelada sai da lista', !ag.some((x) => x.titulo === '1:1 Brisas') && ag.some((x) => x.titulo === 'Outra coisa'), JSON.stringify(ag));

  // dia que ficou sem nenhuma reunião, com a lista já carregada: esvazia o dia (só dessa conta)
  const mV = await mundo({ loja: { agendaMeet: [{ titulo: 'Velha A', data: diaLido, hora: '09:00', conta: '0' }, { titulo: 'Velha B', data: diaLido, hora: '10:00', conta: '1' }, { titulo: 'Velha sem conta', data: diaLido, hora: '11:00' }] } });
  mV.w.history.pushState({}, '', caminhoDia);
  mV.w.document.body.innerHTML = '<h1>Meet</h1><h2>a</h2><h2>b</h2><h2>c</h2><h2>d</h2><h2>e</h2>';
  await mV.tick(6500);
  ag = mV.loja.agendaMeet || [];
  t('dia vazio com a lista carregada: some o que era da conta e o que veio sem conta', !ag.some((x) => x.titulo === 'Velha A' || x.titulo === 'Velha sem conta'), JSON.stringify(ag));
  t('dia vazio numa conta não apaga a outra conta', ag.some((x) => x.titulo === 'Velha B'), JSON.stringify(ag));
  // página que não terminou de carregar (sem cabeçalhos) não pode apagar a lista só porque o tempo passou
  const mW = await mundo({ loja: { agendaMeet: [{ titulo: 'Fica', data: diaLido, hora: '09:00', conta: '0' }] } });
  mW.w.history.pushState({}, '', caminhoDia);
  mW.w.document.body.innerHTML = '';
  await mW.tick(9000);
  t('página ainda carregando (sem cabeçalhos) não esvazia o dia', (mW.loja.agendaMeet || []).some((x) => x.titulo === 'Fica'), JSON.stringify(mW.loja.agendaMeet));

  // atualizar pelo Meet: uma aba de fundo por conta, e cada uma fecha quando a leitura termina
  const m4b = await mundo();
  await m4b.w.chrome.runtime.sendMessage({ type: 'atualizar-agenda' });
  await m4b.tick(200);
  t('sem pedir nada, a leitura cobre uma semana (6 dias na fila depois de hoje)', require('vm').runInContext('filaDias.get(101).length', m4b.bgCtx) === 6, String(require('vm').runInContext('filaDias.get(101).length', m4b.bgCtx)));
  const m5 = await mundo();
  await m5.w.chrome.runtime.sendMessage({ type: 'atualizar-agenda', dias: 3 });
  await m5.tick(200);
  t('atualizar abre a tela inicial das duas contas, em aba de fundo', m5.criadas.length === 2 && /authuser=0/.test(m5.criadas[0]) && /authuser=1/.test(m5.criadas[1]), JSON.stringify(m5.criadas));
  // abrir o painel (ou a página de Pautas) lê a agenda sozinho quando a lista está velha
  const vmRun = (cod, ctx) => require('vm').runInContext(cod, ctx);
  const mA = await mundo();
  await mA.w.chrome.runtime.sendMessage({ type: 'agenda-ao-abrir' });
  await mA.tick(300);
  t('abrir o painel sem nunca ter lido: lê a agenda sozinho (duas contas)', mA.criadas.length === 2, JSON.stringify(mA.criadas));
  await mA.w.chrome.runtime.sendMessage({ type: 'agenda-ao-abrir' });
  await mA.w.chrome.runtime.sendMessage({ type: 'agenda-ao-abrir' });
  await mA.tick(300);
  t('painel e Pautas abrindo juntos não abrem as abas duas vezes', mA.criadas.length === 2, String(mA.criadas.length));
  const mB = await mundo();
  await vmRun(`chrome.storage.local.set({ agendaLidaEm: ${Date.now() - 60 * 1000} })`, mB.bgCtx);
  await mB.w.chrome.runtime.sendMessage({ type: 'agenda-ao-abrir' });
  await mB.tick(300);
  t('lista lida há 1 minuto: não lê de novo', mB.criadas.length === 0, JSON.stringify(mB.criadas));
  const mC = await mundo();
  await vmRun(`chrome.storage.local.set({ agendaLidaEm: ${Date.now() - 20 * 60 * 1000} })`, mC.bgCtx);
  await mC.w.chrome.runtime.sendMessage({ type: 'agenda-ao-abrir' });
  await mC.tick(300);
  t('lista lida há 20 minutos: lê de novo ao abrir', mC.criadas.length === 2, JSON.stringify(mC.criadas));

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

  const mI = await mundo();
  await mI.instalar({ reason: 'update' });
  await mI.tick(20);
  t('atualizar ou recarregar a extensão NÃO abre as boas-vindas', !mI.criadas.some((u) => /boas-vindas/.test(u)));
  await mI.instalar({ reason: 'install' });
  await mI.tick(20);
  t('instalar pela primeira vez abre as boas-vindas', mI.criadas.some((u) => /boas-vindas\.html$/.test(u)) && mI.criadasOpts.length === 1, JSON.stringify(mI.criadas));

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
