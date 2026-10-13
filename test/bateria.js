// Bateria: abrir, fechar, parar e ligar a transcrição na MESMA chamada, em ritmos diferentes, com o script da página
// (jsdom) e o fundo da extensão (vm) conversando de verdade. Confere: um arquivo só por chamada, aviso de pausa,
// painel sempre disponível dentro da chamada, botão redondo certo e sumindo logo quando a chamada acaba.
const { mundo } = require('./_mundo');
let ok = 0, ruim = 0;
const t = (nome, cond, extra = '') => { cond ? ok++ : ruim++; console.log((cond ? '  ok  ' : ' FALHOU') + ' ' + nome + (extra ? '  ' + extra : '')); };

(async () => {
  console.log('Parar e voltar 10 vezes, a cada 1 segundo');
  let m = await mundo();
  m.fab().click();
  await m.tick(1000);
  for (let i = 0; i < 10; i++) {
    m.fala('frase numero ' + i);
    await m.tick(1000);
    await m.cmdPainel('stop');
    await m.tick(1000);
    await m.cmdPainel('start');
    await m.tick(200);
  }
  await m.tick(1000);
  await m.cmdPainel('stop');
  await m.tick(2000);
  let reus = m.reunioes();
  t('um arquivo só (uma reunião na biblioteca)', reus.length === 1, String(reus.length));
  const linhasPausa = reus[0] ? reus[0].transcript.filter((l) => l.speaker === 'Talktrail' && /pausada/.test(l.text)) : [];
  t('pausas de 1 segundo (cliques seguidos) não enchem o arquivo de avisos', linhasPausa.length === 0, String(linhasPausa.length));
  t('o painel nunca foi desligado durante a chamada', m.painel.desabilitacoes === 0 && m.painel.habilitado !== false, String(m.painel.desabilitacoes));
  t('nenhuma mensagem de "fim" mandada (a chamada seguia aberta)', !m.msgsParaBg.some((x) => x.type === 'fim'));
  t('o arquivo termina quando ela parou (tem endedAt)', reus[0] && !!reus[0].endedAt);
  t('as frases de antes e de depois das pausas estão todas no mesmo arquivo', reus[0] && /frase numero 0/.test(JSON.stringify(reus[0].transcript)) && /frase numero 9/.test(JSON.stringify(reus[0].transcript)));
  t('todos os envios foram da mesma sessão', new Set(m.salvos.map((s) => s.id)).size === 1, String(new Set(m.salvos.map((s) => s.id)).size));

  console.log('Parar e voltar a cada 10 segundos, com notas no meio');
  m = await mundo();
  await m.cmdPainel('start');
  await m.tick(10000);
  await m.cmdPainel('stop');
  await m.cmdPainel('notes', { text: 'decisão tomada na pausa' });
  await m.tick(10000);
  await m.cmdPainel('start');
  await m.tick(10000);
  await m.cmdPainel('stop');
  await m.tick(3000);
  reus = m.reunioes();
  t('um arquivo só', reus.length === 1, String(reus.length));
  t('a nota escrita na pausa está no arquivo', reus[0] && /decisão tomada na pausa/.test(reus[0].notes));
  const pausa = reus[0] ? reus[0].transcript.find((l) => /pausada/.test(l.text)) : null;
  t('o aviso é curto e diz quanto durou: "pausada por 10 s e retomada"', pausa && /^\(transcrição pausada por 10 s e retomada\)$/.test(pausa.text), pausa && pausa.text);

  console.log('Pausa longa (3 minutos) e curta (20 segundos) na mesma chamada');
  m = await mundo();
  await m.cmdPainel('start');
  m.fala('primeira frase da reunião');
  await m.tick(5000);
  await m.cmdPainel('stop');
  await m.tick(180000);
  await m.cmdPainel('start');
  await m.tick(5000);
  await m.cmdPainel('stop');
  await m.tick(20000);
  await m.cmdPainel('start');
  await m.tick(3000);
  await m.cmdPainel('stop');
  await m.tick(3000);
  const avisos = (m.reunioes()[0] ? m.reunioes()[0].transcript : []).filter((l) => /pausada/.test(l.text)).map((l) => l.text);
  t('dois avisos, um em minutos e outro em segundos', avisos.length === 2 && /3 min/.test(avisos[0]) && /20 s/.test(avisos[1]), JSON.stringify(avisos));
  t('ainda um arquivo só', m.reunioes().length === 1);

  console.log('Botão redondo apertado em sequência');
  m = await mundo();
  for (let i = 0; i < 6; i++) { m.fab().click(); await m.tick(1000); }
  t('depois de 6 cliques (começa, para, ...) está parado', !m.fab().classList.contains('rec'));
  t('abriu o painel nas 3 vezes que começou', m.painel.aberturas === 3, String(m.painel.aberturas));
  m.fab().click();
  await m.tick(500);
  t('o botão vira vermelho ao transcrever', m.fab().classList.contains('rec') && /Parar/.test(m.fab().title));
  t('...e o painel está disponível', m.painel.habilitado !== false);
  m = await mundo({ ajustes: { fabAbrePainel: false } });
  m.fab().click();
  await m.tick(1000);
  t('com a opção desligada, o botão redondo não abre o painel', m.painel.aberturas === 0, String(m.painel.aberturas));

  console.log('Fechar e abrir o painel durante a transcrição');
  m = await mundo();
  m.fab().click();
  await m.tick(2000);
  const porta = m.conectarPainel();
  await m.comando('alternar-painel');
  t('o atalho fecha o painel que está aberto', porta.recebidas.some((x) => x.fechar === true));
  await m.tick(3000);
  t('com o painel fechado, a transcrição continua', m.fab().classList.contains('rec'));
  t('...e o botão redondo continua vermelho (garantia de que está transcrevendo)', m.fab().classList.contains('rec') && !m.fab().hidden);
  const antes = m.painel.aberturas;
  await m.comando('alternar-painel');
  t('o atalho abre o painel de novo (instantâneo)', m.painel.aberturas === antes || m.painel.aberturas === antes + 1);
  for (let i = 0; i < 8; i++) { await m.comando('alternar-painel'); await m.tick(1000); }
  t('depois de abrir e fechar várias vezes, ainda transcreve e o painel segue disponível', m.fab().classList.contains('rec') && m.painel.habilitado !== false);

  console.log('Encerrar a chamada na marra (transcrevendo)');
  m = await mundo();
  m.fab().click();
  await m.tick(3000);
  m.fala('última frase antes de sair');
  await m.tick(1000);
  m.sairDaChamada(true);
  await m.tick(400);
  t('o botão redondo some em menos de meio segundo', m.fab().hidden === true);
  await m.tick(1500);
  reus = m.reunioes();
  t('a transcrição parou sozinha e o arquivo fechou (endedAt)', reus.length === 1 && !!reus[0].endedAt);
  const avisoSalvo = m.raiz().querySelector('.card .t');
  t('aparece o aviso "Reunião salva" ao sair da chamada', !!avisoSalvo && avisoSalvo.textContent === 'Reunião salva', avisoSalvo && avisoSalvo.textContent);
  t('...com o nome da reunião e o botão Mostrar na pasta', !!m.raiz().querySelector('[data-a="m"]') && !m.raiz().querySelector('[data-a="m"]').hidden);
  t('a última frase foi guardada', reus[0] && reus[0].transcript.some((l) => /última frase/.test(l.text)));
  t('o painel foi fechado (fim da reunião)', m.painel.habilitado === false);

  console.log('Encerrar a chamada sem a tela de fim (só some o botão de sair)');
  m = await mundo();
  m.fab().click();
  m.fala('frase antes de sair sem tela de fim');
  await m.tick(3000);
  m.sairDaChamada(false);
  await m.tick(400);
  t('o botão redondo some em menos de meio segundo', m.fab().hidden === true);
  await m.tick(14000);
  t('a transcrição para sozinha em até uns 12 s', m.reunioes().length === 1 && !!m.reunioes()[0].endedAt);
  t('e o aviso "Reunião salva" aparece', (m.raiz().querySelector('.card .t') || {}).textContent === 'Reunião salva');

  console.log('Sair da chamada com a transcrição pausada');
  m = await mundo();
  await m.cmdPainel('start');
  m.fala('uma frase antes de pausar');
  await m.tick(3000);
  await m.cmdPainel('stop');
  await m.tick(25000);
  t('pausada e na chamada: o botão redondo segue lá', m.fab().hidden === false && !m.fab().classList.contains('rec'));
  m.sairDaChamada(true);
  await m.tick(400);
  t('ao sair, o botão some em menos de meio segundo', m.fab().hidden === true);
  await m.tick(3000);
  t('...e o painel fecha', m.painel.habilitado === false);

  console.log('Outra chamada na mesma aba: reunião nova');
  const primeiro = m.reunioes()[0] && m.reunioes()[0].id;
  m.voltarPraChamada();
  await m.tick(3000);
  t('de volta à chamada: o botão redondo aparece e o painel liga', m.fab().hidden === false && m.painel.habilitado === true);
  await m.cmdPainel('start');
  m.fala('segunda chamada, outra frase');
  await m.tick(2000);
  await m.cmdPainel('stop');
  await m.tick(2000);
  const ids = new Set(m.reunioes().map((r) => r.id));
  t('virou outro arquivo (outro id)', ids.size === 2 && primeiro && ids.has(primeiro), String(ids.size));

  console.log('Reunião vazia não vira arquivo');
  m = await mundo();
  await m.cmdPainel('start');
  await m.tick(3000);
  await m.cmdPainel('stop');
  await m.tick(2000);
  t('começar e parar sem falar: nada na biblioteca', m.reunioes().length === 0, String(m.reunioes().length));
  t('...e o aviso diz que nada foi falado, sem botão de pasta', (m.raiz().querySelector('.card .t') || {}).textContent === 'Nada foi falado' && (!m.raiz().querySelector('[data-a="m"]') || m.raiz().querySelector('[data-a="m"]').hidden));
  m = await mundo();
  await m.cmdPainel('start');
  await m.tick(2000);
  await m.cmdPainel('notes', { text: 'só uma nota' });
  await m.tick(1000);
  await m.cmdPainel('stop');
  await m.tick(3000);
  t('só com uma nota já vale guardar', m.reunioes().length === 1 && /só uma nota/.test(m.reunioes()[0].notes));

  console.log(`\n${ok} ok, ${ruim} falharam`);
  process.exit(ruim ? 1 : 0);
})();
