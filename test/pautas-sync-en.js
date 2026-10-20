// Sincronização das pautas com o navegador em inglês: a pasta nova é Agendas/ (README.md, chaves em inglês),
// e uma pasta Pautas/ que já existia continua sendo usada, em português, mesmo com o navegador em inglês.
process.env.TT_IDIOMA = 'en-US';
const vm = require('vm');
const { mundo } = require('./_mundo');
let ok = 0, ruim = 0;
const t = (nome, cond, extra = '') => { cond ? ok++ : ruim++; console.log((cond ? '  ok  ' : ' FALHOU') + ' ' + nome + (extra ? '  ' + extra : '')); };
const p2 = (n) => String(n).padStart(2, '0');
const dia = (n) => { const d = new Date(Date.now() + n * 86400000); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };

async function cenario(pastaExistente) {
  const m = await mundo();
  const arquivos = new Map();
  let pasta = pastaExistente; // o servidor de verdade usa a que existe; senão a do idioma de quem pede
  m.bgCtx.fetch = async (url, op) => {
    const corpo = op && op.body ? JSON.parse(op.body) : {};
    if (url.endsWith('/pautas/listar')) { pasta = pasta || (corpo.idioma === 'en' ? 'Agendas' : 'Pautas'); return { ok: true, json: async () => ({ ok: true, pasta, arquivos: [...arquivos].map(([nome, a]) => ({ nome, ...a })) }) }; }
    if (url.endsWith('/pautas/gravar')) { arquivos.set(corpo.nome, { mtime: Date.now(), conteudo: corpo.conteudo }); return { ok: true, json: async () => ({ ok: true }) }; }
    if (url.endsWith('/pautas/apagar')) { arquivos.delete(corpo.nome); return { ok: true, json: async () => ({ ok: true }) }; }
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  const bg = (js) => vm.runInContext(js, m.bgCtx);
  await bg('sincronizarPautas()');
  const id = `${dia(2)}|quarter planning`;
  await bg(`chrome.storage.local.set({ pareamento: 'tk', pautas: { '${id}': { titulo: 'Quarter planning', data: '${dia(2)}', hora: '15:00', texto: '1. Goals', criada: 1, atualizada: ${Date.now() - 5000} } } })`);
  await bg('sincronizarPautas()');
  await new Promise((r) => setTimeout(r, 1700));
  const guardado = await bg('chrome.storage.local.get(null)');
  return { arquivos, pasta, guardado, nome: `${dia(2)}_15h00_quarter-planning.md` };
}

(async () => {
  console.log('Navegador em inglês, pasta nova');
  let c = await cenario(null);
  t('a pasta nova é Agendas/', c.pasta === 'Agendas' && c.guardado.pautasSync && c.guardado.pautasSync.pasta === 'Agendas', JSON.stringify(c.guardado.pautasSync));
  t('a explicação é o README.md (e não o LEIA-ME.md), em inglês', c.arquivos.has('README.md') && !c.arquivos.has('LEIA-ME.md') && /Talktrail agendas/.test(c.arquivos.get('README.md').conteudo), [...c.arquivos.keys()].join(','));
  const f = c.arquivos.get(c.nome);
  t('a pauta vira arquivo com title, date e time', !!f && /^---\ntitle: "Quarter planning"\ndate: \d{4}-\d{2}-\d{2}\ntime: 15:00\n---/.test(f.conteudo), f && f.conteudo.slice(0, 80));

  console.log('Navegador em inglês, mas a pasta Pautas/ já existia');
  c = await cenario('Pautas');
  t('continua em Pautas/ com LEIA-ME.md e chaves em português', c.pasta === 'Pautas' && c.arquivos.has('LEIA-ME.md') && !c.arquivos.has('README.md') && /^---\ntitulo: "Quarter planning"/.test((c.arquivos.get(c.nome) || {}).conteudo || ''), [...c.arquivos.keys()].join(','));

  console.log(`\n${ok} ok, ${ruim} falharam`);
  process.exit(ruim ? 1 : 0);
})();
