// Servidor local de verdade (Python) numa porta de teste e pasta descartável, conversando com a extensão (pacote da loja) num
// navegador de verdade e com o Meet falso. NUNCA usa a porta 8787 nem a pasta de ninguém.
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const { abrir, esp, relatorio, RAIZ } = require('./lib');
const { iniciar } = require('./meet-falso');
const R = relatorio('Servidor local de verdade');
const PORTA_MEET = 9300 + Math.floor(Math.random() * 300);
const lerTudo = async (B) => { const sw = await B.sw(); const t = JSON.parse(await sw.ev(`chrome.storage.local.get(null).then((x) => JSON.stringify(x))`)); sw.close(); return t; };
const arvore = (d) => { const r = []; (function v(p) { for (const f of fs.readdirSync(p, { withFileTypes: true })) { const c = path.join(p, f.name); f.isDirectory() ? v(c) : r.push(c); } })(d); return r; };

function subirServidor(porta, out, estado) {
  const p = spawn('python3', [path.join(RAIZ, 'server/talktrail_server.py')], { env: { ...process.env, TALKTRAIL_PORT: String(porta), TALKTRAIL_OUT: out, TALKTRAIL_ESTADO: estado }, stdio: 'ignore' });
  return p;
}
async function esperaServidor(porta) { for (let i = 0; i < 40; i++) { try { const r = await fetch(`http://127.0.0.1:${porta}/health`); if (r.ok) return true; } catch (e) {} await esp(250); } return false; }

async function rodar(idioma) {
  R.sec(`== servidor real, navegador em ${idioma}`);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-out-')), estado = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-estado-'));
  const porta = 40000 + Math.floor(Math.random() * 5000);
  let srv = subirServidor(porta, out, estado);
  R.t('o servidor sobe na porta de teste', await esperaServidor(porta));
  const meet = await iniciar({ porta: PORTA_MEET + (idioma === 'en' ? 1 : 0) });
  const B = await abrir({ idioma, meetPorta: meet.porta, portaServidor: porta });
  try {
    const aba = await B.nova(meet.url('/meet/abc-defg-hij'), { largura: 1200, altura: 800 });
    await aba.espera(`!!document.getElementById('talktrail-host') && !!document.getElementById('talktrail-host').shadowRoot.querySelector('[data-a="g"]')`, 12000);
    await aba.ev(`document.getElementById('talktrail-host').shadowRoot.querySelector('[data-a="g"]').click()`);
    await esp(9000);
    await aba.ev(`__falar('Ana', 'Primeira frase com o servidor ligado.')`); await esp(11000);
    let arqs = arvore(out).filter((f) => f.endsWith('.md') && !/(Pautas|Agendas)/.test(f));
    R.t('durante a chamada o arquivo já está na pasta (ao vivo)', arqs.length === 1 && /Primeira frase/.test(fs.readFileSync(arqs[0], 'utf8')), arqs.join(', '));
    const pj = path.join(estado, 'pareamento.json');
    R.t('a extensão pareou com o servidor', fs.existsSync(pj) && JSON.parse(fs.readFileSync(pj, 'utf8')).origem === `chrome-extension://${B.ID}`);
    // servidor cai no meio da chamada: a gravação segue e nada se perde
    srv.kill('SIGKILL'); await esp(800);
    await aba.ev(`__falar('Carlos', 'Frase falada com o servidor fora do ar.')`); await esp(11000);
    let tudo = await lerTudo(B);
    const rs = Object.values(tudo).filter((v) => v && v.payload);
    R.t('com o servidor fora, a extensão guarda a fala na biblioteca', rs.length === 1 && /servidor fora do ar/.test(JSON.stringify(rs[0].payload.transcript)));
    srv = subirServidor(porta, out, estado); await esperaServidor(porta);
    await aba.ev(`__falar('Ana', 'Frase depois que o servidor voltou.', true)`); await esp(27000); // a extensão espera até 20 s depois de uma queda antes de tentar de novo
    arqs = arvore(out).filter((f) => f.endsWith('.md') && !/(Pautas|Agendas)/.test(f));
    const txt = arqs[0] ? fs.readFileSync(arqs[0], 'utf8') : '';
    R.t('quando o servidor volta, o arquivo tem TUDO (antes, durante a queda e depois)', /Primeira frase/.test(txt) && /servidor fora do ar/.test(txt) && /depois que o servidor voltou/.test(txt), txt.slice(0, 300));
    R.t('continua um arquivo só', arqs.length === 1, arqs.join(', '));
    await aba.ev(`__sairDaChamada()`); await esp(7000);
    arqs = arvore(out).filter((f) => f.endsWith('.md') && !/(Pautas|Agendas)/.test(f));
    const txtFinal = arqs[0] ? fs.readFileSync(arqs[0], 'utf8') : '';
    R.t('depois de sair da chamada o arquivo final tem as três falas', /Primeira frase/.test(txtFinal) && /servidor fora do ar/.test(txtFinal) && /depois que o servidor voltou/.test(txtFinal), txtFinal.replace(/\n+/g, ' / ').slice(-300));
    if (process.env.TT_DEBUG) { const tt = await lerTudo(B); const r0 = Object.values(tt).find((v) => v && v.payload); console.log('--- BIBLIOTECA:', JSON.stringify((r0 ? r0.payload.transcript : []).map((l) => `${l.speaker}: ${l.text}`))); console.log('--- ARQUIVO:\n' + txtFinal.slice(txtFinal.indexOf('## Transcri'))); }
    R.t('o arquivo na pasta está no idioma do navegador', idioma === 'en' ? /## Transcript/.test(fs.readFileSync(arqs[0], 'utf8')) : /## Transcrição/.test(fs.readFileSync(arqs[0], 'utf8')));
    await aba.fecha();

    // pautas: da extensão pra pasta e da pasta pra extensão
    const pasta = idioma === 'en' ? 'Agendas' : 'Pautas';
    const hoje = new Date(); const dia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    const pg = await B.nova(B.url('pautas.html'), { largura: 1000, altura: 800 }); await esp(1500);
    await pg.ev(`chrome.storage.local.set({ pautas: { 'p|1': { titulo: 'Reunião com pauta de teste', data: '${dia}', hora: '15:00', texto: '1. ponto um\\n2. ponto dois', criada: Date.now(), atualizada: Date.now() } } })`);
    await pg.ev(`chrome.runtime.sendMessage({ type: 'sincronizar-pautas' })`); await esp(5000);
    const fp = path.join(out, pasta);
    R.t(`a pauta virou arquivo em ${pasta}/`, fs.existsSync(fp) && fs.readdirSync(fp).some((f) => /pauta-de-teste/.test(f)), fs.existsSync(fp) ? fs.readdirSync(fp).join(',') : '(sem pasta)');
    R.t(`a pasta tem a explicação (${idioma === 'en' ? 'README.md' : 'LEIA-ME.md'})`, fs.existsSync(path.join(fp, idioma === 'en' ? 'README.md' : 'LEIA-ME.md')));
    const arqPauta = fs.existsSync(fp) ? fs.readdirSync(fp).find((f) => /pauta-de-teste/.test(f)) : null;
    if (arqPauta) {
      const antigo = fs.readFileSync(path.join(fp, arqPauta), 'utf8');
      fs.writeFileSync(path.join(fp, arqPauta), antigo.replace('ponto dois', 'ponto dois EDITADO NO ARQUIVO'));
      await pg.ev(`chrome.runtime.sendMessage({ type: 'sincronizar-pautas' })`); await esp(5000);
      tudo = await lerTudo(B);
      R.t('editar o arquivo muda a pauta na extensão', /EDITADO NO ARQUIVO/.test(JSON.stringify(tudo.pautas)), JSON.stringify(tudo.pautas).slice(0, 200));
      // apagar o arquivo: a pauta sai da extensão (e fica na lixeira interna)
      fs.unlinkSync(path.join(fp, arqPauta));
      // de propósito a remoção só vale na SEGUNDA conversa seguida (uma listagem estranha não pode apagar pauta)
      await pg.ev(`chrome.runtime.sendMessage({ type: 'sincronizar-pautas' })`); await esp(4000);
      R.t('na primeira conversa a pauta ainda NÃO some (proteção contra listagem duvidosa)', Object.values((await lerTudo(B)).pautas || {}).some((p) => p.titulo === 'Reunião com pauta de teste'));
      await pg.ev(`chrome.runtime.sendMessage({ type: 'sincronizar-pautas' })`); await esp(5000);
      tudo = await lerTudo(B);
      R.t('apagar o arquivo tira a pauta da extensão, guardando na lixeira', !Object.values(tudo.pautas || {}).some((p) => p.titulo === 'Reunião com pauta de teste') && (tudo.pautasLixeira || []).length >= 1);
    }
    R.t('nenhum erro na página de Pautas', pg.erros.length === 0, pg.erros.join(' | '));
    await pg.fecha();

    // "Parear de novo" na página do servidor: o pareamento some. A extensão tem que se parear sozinha ao sincronizar pautas, sem esperar uma gravação
    fs.unlinkSync(path.join(estado, 'pareamento.json'));
    const pgR = await B.nova(B.url('pautas.html'), { largura: 1000, altura: 800 }); await esp(1500);
    await pgR.ev(`chrome.storage.local.set({ pautas: { 'p|2': { titulo: 'Pauta depois de parear de novo', data: '${dia}', hora: '17:00', texto: '1. um', criada: Date.now(), atualizada: Date.now() } } })`);
    await pgR.ev(`chrome.runtime.sendMessage({ type: 'sincronizar-pautas' })`); await esp(6000);
    const pjR = path.join(estado, 'pareamento.json');
    R.t('depois de "Parear de novo", abrir/sincronizar Pautas pareia sozinho com a extensão certa', fs.existsSync(pjR) && JSON.parse(fs.readFileSync(pjR, 'utf8')).origem === `chrome-extension://${B.ID}`, fs.existsSync(pjR) ? fs.readFileSync(pjR, 'utf8').slice(0, 80) : '(sem arquivo)');
    R.t('e a pauta já vai pra pasta', fs.existsSync(fp) && fs.readdirSync(fp).some((f) => /depois-de-parear/.test(f)), fs.existsSync(fp) ? fs.readdirSync(fp).join(',') : '');
    await pgR.fecha();

    // OUTRA extensão (outro ID) tenta usar o mesmo servidor: tem que ser barrada
    const B2 = await abrir({ idioma, meetPorta: meet.porta, portaServidor: porta });
    try {
      const pg2 = await B2.nova(B2.url('pautas.html'), { largura: 1000, altura: 800 }); await esp(1500);
      await pg2.ev(`chrome.storage.local.set({ pautas: { 'intruso|1': { titulo: 'Pauta de uma extensão intrusa', data: '${dia}', hora: '16:00', texto: 'x', criada: Date.now(), atualizada: Date.now() } } })`);
      await pg2.ev(`chrome.runtime.sendMessage({ type: 'sincronizar-pautas' })`); await esp(5000);
      const todos = arvore(out).map((f) => path.basename(f));
      R.t('uma segunda extensão (outro ID) NÃO consegue escrever na pasta do servidor', !todos.some((f) => /intrusa/.test(f)), todos.join(','));
      R.t('o pareamento continua sendo da primeira extensão', JSON.parse(fs.readFileSync(path.join(estado, 'pareamento.json'), 'utf8')).origem === `chrome-extension://${B.ID}`);
      await pg2.fecha();
    } finally { B2.fechar(); }
  } finally { B.fechar(); await meet.fechar(); srv.kill('SIGKILL'); fs.rmSync(out, { recursive: true, force: true }); fs.rmSync(estado, { recursive: true, force: true }); }
}

(async () => {
  for (const i of (process.env.TT_IDIOMAS || 'pt-BR,en').split(',')) await rodar(i);
  R.fim();
})().catch((e) => { console.error(e); process.exit(2); });
