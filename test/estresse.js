// Estresse: sequências aleatórias (mas repetíveis, com semente) de tudo que uma pessoa pode fazer numa chamada,
// em ritmos de 0,1 s a 15 s: botão redondo, parar, começar, painel abrir e fechar, marcar, notas, falas, tela cheia,
// fechar aviso, sair e voltar. Depois de cada passo confere as regras que nunca podem quebrar.
const { mundo } = require('./_mundo');
let ok = 0, ruim = 0;
const t = (nome, cond, extra = '') => { cond ? ok++ : ruim++; console.log((cond ? '  ok  ' : ' FALHOU') + ' ' + nome + (extra ? '  ' + extra : '')); };

const rng = (semente) => () => {
  semente = (semente + 0x6d2b79f5) | 0;
  let x = Math.imul(semente ^ (semente >>> 15), 1 | semente);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};

async function rodada(semente, passos) {
  const rand = rng(semente);
  const escolhe = (xs) => xs[Math.floor(rand() * xs.length)];
  const m = await mundo({});
  let relogio = 0; // tempo simulado
  let saiuEm = 0;
  const tickReal = m.tick;
  m.tick = async (ms) => { relogio += ms; return tickReal(ms); };
  const erros = [];
  const quebras = [];
  let naChamada = true;
  let chamadas = 1;
  let chamadasComInicio = 0;
  let iniciouNestaChamada = false;
  let portas = [];
  let telaCheia = null;
  let falaN = 0;

  const conferir = async (depois) => {
    const est = await m.cmdPainel('estado').catch(() => null);
    const fase = est && est.fase;
    const cartoes = [...m.raiz().querySelectorAll('#slot > .card')].filter((c) => !c.style.position);
    if (cartoes.length > 1) quebras.push(`${depois}: ${cartoes.length} avisos ao mesmo tempo`);
    const fab = m.fab();
    if (naChamada) {
      if (fab.hidden) quebras.push(`${depois}: botão redondo sumiu dentro da chamada`);
      if (!fab.hidden && fab.classList.contains('rec') !== (fase === 'gravando')) quebras.push(`${depois}: botão redondo ${fab.classList.contains('rec') ? 'vermelho' : 'cinza'} mas fase=${fase}`);
      if (m.painel.habilitado === false) quebras.push(`${depois}: painel desligado dentro da chamada`);
    } else {
      if (!fab.hidden) quebras.push(`${depois}: botão redondo na tela fora da chamada`);
      // sem a tela de fim do Meet, a transcrição espera 12 s (mais até 4 s de ciclo) pra ter certeza que a pessoa saiu, de propósito
      if (fase === 'gravando' && relogio - saiuEm > 17000) quebras.push(`${depois}: ainda transcrevendo fora da chamada há ${Math.round((relogio - saiuEm) / 1000)} s`);
    }
  };

  const ops = {
    fab: async () => { if (naChamada) { const fase = (await m.cmdPainel('estado')).fase; if (fase !== 'gravando') { iniciouNestaChamada = true; } m.fab().click(); } },
    start: async () => { if (naChamada) { iniciouNestaChamada = true; await m.cmdPainel('start'); } },
    stop: async () => { await m.cmdPainel('stop'); },
    mark: async () => { await m.cmdPainel('mark'); },
    notes: async () => { await m.cmdPainel('notes', { text: 'nota ' + falaN }); },
    fala: async () => { m.fala('frase numero ' + falaN++); },
    painel: async () => { if (naChamada) { await m.comando('alternar-painel'); if (!portas.length || rand() < 0.5) portas.push(m.conectarPainel()); } },
    atalhoRec: async () => { if (naChamada) { if ((await m.cmdPainel('estado')).fase !== 'gravando') iniciouNestaChamada = true; await m.comando('transcrever-ou-parar'); } },
    telaCheia: async () => {
      const doc = m.w.document;
      telaCheia = telaCheia ? null : doc.body.appendChild(doc.createElement('div'));
      Object.defineProperty(doc, 'fullscreenElement', { value: telaCheia, configurable: true });
      doc.dispatchEvent(new m.w.Event('fullscreenchange'));
    },
    fechaAviso: async () => { const x = m.raiz().querySelector('.fechar'); if (x) x.click(); },
    sair: async () => {
      if (!naChamada) return;
      m.sairDaChamada(rand() < 0.6);
      naChamada = false;
      saiuEm = relogio;
    },
    voltar: async () => {
      if (naChamada) return;
      m.voltarPraChamada();
      naChamada = true;
      chamadas++;
      iniciouNestaChamada = false;
    },
  };
  // pesos: mais ações de transcrição do que de sair/voltar
  const roleta = ['fab', 'fab', 'start', 'stop', 'stop', 'mark', 'notes', 'fala', 'fala', 'fala', 'painel', 'painel', 'atalhoRec', 'telaCheia', 'fechaAviso', 'sair', 'voltar', 'voltar'];
  let chamadaIdAnterior = 0;
  for (let i = 0; i < passos; i++) {
    const nome = escolhe(roleta);
    const antesNaChamada = naChamada;
    try {
      await ops[nome]();
      await m.tick(escolhe([100, 200, 400, 1000, 1000, 3000, 8000, 15000]));
      if (!antesNaChamada && naChamada) {
        await m.tick(2500); // voltar pra chamada: dá o tempo normal de o painel e o botão aparecerem
      }
      if (antesNaChamada && !naChamada) await m.tick(400);
      if (iniciouNestaChamada && !chamadaIdAnterior) { /* contado ao sair */ }
      await conferir(`passo ${i} (${nome})`);
      if (process.env.DEPURAR && Number(process.env.DEPURAR) === semente && i >= Number(process.env.DE || 0) && i <= Number(process.env.ATE || 9999)) {
        const e = await m.cmdPainel('estado').catch(() => ({}));
        console.log(`  [${i}] ${nome.padEnd(10)} naChamada=${naChamada} fase=${e.fase} dispensado=? painelHabilitado=${m.painel.habilitado} fab.hidden=${m.fab().hidden} relogio=${Math.round(relogio / 1000)}s`);
      }
    } catch (e) {
      erros.push(`passo ${i} (${nome}): ${e && e.message}`);
    }
    if (naChamada === false && nome === 'sair' && iniciouNestaChamada) { chamadasComInicio++; iniciouNestaChamada = false; }
  }
  // fecha tudo: garante que estava na chamada, para e sai
  if (naChamada && iniciouNestaChamada) chamadasComInicio++;
  if (naChamada) { await m.cmdPainel('stop'); m.sairDaChamada(true); naChamada = false; saiuEm = relogio; }
  await m.tick(25000);
  await conferir('fim');
  const reus = m.reunioes();
  const ids = new Set(reus.map((r) => r.id));
  return { m, erros, quebras, reus, ids, chamadas, chamadasComInicio };
}

(async () => {
  let totalPassos = 0;
  const quantas = Number(process.env.SEMENTES || 40); // SEMENTES=500 node test/estresse.js roda uma bateria bem maior
  for (let semente = 1; semente <= quantas; semente++) {
    const passos = 150;
    const r = await rodada(semente, passos);
    totalPassos += passos;
    t(`semente ${semente}: nenhum erro de execução em ${passos} passos`, r.erros.length === 0, r.erros.slice(0, 2).join(' | '));
    t(`semente ${semente}: nenhuma regra quebrada`, r.quebras.length === 0, r.quebras.slice(0, 3).join(' | '));
    t(`semente ${semente}: no fim, tudo que foi gravado tem fim (endedAt)`, r.reus.every((x) => !!x.endedAt), String(r.reus.filter((x) => !x.endedAt).length));
    const fora = r.reus.filter((x) => (x.transcript || []).some((l, k, a) => k > 0 && l.t < a[k - 1].t - 0.01)).length;
    t(`semente ${semente}: as horas das falas nunca voltam pra trás`, fora === 0, `${fora} arquivos fora de ordem`);
    t(`semente ${semente}: um arquivo por chamada (no máximo um por chamada em que transcreveu)`, r.reus.length <= r.chamadasComInicio + 0 || r.reus.length === r.ids.size, `${r.reus.length} arquivos, ${r.chamadasComInicio} chamadas`);
  }
  console.log(`\n${totalPassos} passos aleatórios no total`);
  console.log(`${ok} ok, ${ruim} falharam`);
  process.exit(ruim ? 1 : 0);
})();
