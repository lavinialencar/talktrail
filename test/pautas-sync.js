// Sincronização das pautas com a pasta Pautas/ (servidor local simulado): criar, editar por fora, criar por fora, apagar
const vm = require('vm');
const { mundo } = require('./_mundo');
let ok = 0, ruim = 0;
const t = (nome, cond, extra = '') => { cond ? ok++ : ruim++; console.log((cond ? '  ok  ' : ' FALHOU') + ' ' + nome + (extra ? '  ' + extra : '')); };
const p2 = (n) => String(n).padStart(2, '0');
const dia = (n) => { const d = new Date(Date.now() + n * 86400000); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };

(async () => {
  const m = await mundo();
  const arquivos = new Map(); // nome -> { mtime, conteudo }
  const chamadas = [];
  m.bgCtx.fetch = async (url, op) => {
    const corpo = op && op.body ? JSON.parse(op.body) : {};
    chamadas.push(url.replace('http://127.0.0.1:8787', ''));
    if (url.endsWith('/pautas/listar')) return { ok: true, json: async () => ({ ok: true, arquivos: [...arquivos].map(([nome, a]) => ({ nome, ...a })) }) };
    if (url.endsWith('/pautas/gravar')) { arquivos.set(corpo.nome, { mtime: Date.now(), conteudo: corpo.conteudo }); return { ok: true, json: async () => ({ ok: true }) }; }
    if (url.endsWith('/pautas/apagar')) { arquivos.delete(corpo.nome); return { ok: true, json: async () => ({ ok: true }) }; }
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  const bg = (js) => vm.runInContext(js, m.bgCtx);
  const store = async () => bg("chrome.storage.local.get(null)");
  await bg('sincronizarPautas()'); // termina a rodada de partida antes de montar o cenário
  const id = `${dia(2)}|daily de produto`;
  await bg(`chrome.storage.local.set({ pareamento: 'tk', pautas: { '${id}': { titulo: 'Daily de produto', data: '${dia(2)}', hora: '10:00', texto: '1. do navegador', criada: 1, atualizada: ${Date.now() - 5000} } } })`);

  console.log('Sincronização');
  await bg('sincronizarPautas()');
  const nomes = [...arquivos.keys()];
  t('a pauta do navegador vira arquivo em Pautas/ e a pasta ganha o LEIA-ME', nomes.includes(`${dia(2)}_10h00_daily-de-produto.md`) && nomes.includes('LEIA-ME.md'), JSON.stringify(nomes));
  t('o arquivo tem o cabeçalho certo', /titulo: "Daily de produto"/.test(arquivos.get(`${dia(2)}_10h00_daily-de-produto.md`).conteudo));
  const n0 = chamadas.length;
  await bg('sincronizarPautas()');
  t('rodar de novo sem mudança não grava nada (sem laço)', !chamadas.slice(n0).some((c) => /gravar|apagar/.test(c)));

  // a IA edita o arquivo
  const nome = `${dia(2)}_10h00_daily-de-produto.md`;
  arquivos.set(nome, { mtime: Date.now(), conteudo: `---\ntitulo: "Daily de produto"\ndata: ${dia(2)}\nhora: 10:00\n---\n\n1. editado pela IA\n- [ ] confirmar prazo\n` });
  await bg('sincronizarPautas()');
  let v = await store();
  t('a edição da IA no arquivo chega na pauta do navegador', v.pautas[id].texto === '1. editado pela IA\n- [ ] confirmar prazo', JSON.stringify(v.pautas[id]));

  // a IA cria uma reunião nova
  arquivos.set(`${dia(3)}_planejamento.md`, { mtime: Date.now(), conteudo: `---\ntitulo: Planejamento semanal\ndata: ${dia(3)}\n---\n1. metas do mês` });
  await new Promise((r) => setTimeout(r, 15));
  await bg('sincronizarPautas()');
  v = await store();
  t('arquivo novo criado pela IA vira pauta', v.pautas[`${dia(3)}|planejamento semanal`] && v.pautas[`${dia(3)}|planejamento semanal`].texto === '1. metas do mês');

  // a IA apaga um arquivo: a pauta sai
  arquivos.delete(`${dia(3)}_planejamento.md`);
  await new Promise((r) => setTimeout(r, 20));
  await bg('sincronizarPautas()');
  v = await store();
  t('arquivo apagado: a pauta sai do navegador', !v.pautas[`${dia(3)}|planejamento semanal`] && !!v.pautas[id]);

  // pauta apagada no navegador (tombstone): o arquivo sai
  await bg(`chrome.storage.local.set({ pautas: {}, pautasApagadas: { '${id}': ${Date.now() + 100} } })`);
  await bg('sincronizarPautas()');
  t('pauta apagada no navegador: o arquivo é apagado e não volta', !arquivos.has(nome));

  // sem servidor nem pasta: não faz nada e não quebra
  const m2 = await mundo();
  m2.bgCtx.fetch = async () => { throw new Error('fora'); };
  await vm.runInContext("chrome.storage.local.set({ pareamento: 'tk' })", m2.bgCtx);
  let erro = '';
  try { await vm.runInContext('sincronizarPautas()', m2.bgCtx); } catch (e) { erro = e.message; }
  const v2 = await vm.runInContext('chrome.storage.local.get(null)', m2.bgCtx);
  t('servidor fora e sem pasta: não quebra e marca como desligado', erro === '' && v2.pautasSync && v2.pautasSync.modo === '');

  console.log(`\n${ok} ok, ${ruim} falharam`);
  process.exit(ruim ? 1 : 0);
})();
