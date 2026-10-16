// Reunião repetida: reconhecer a série, achar a última pauta e copiar sem o que já foi feito
const fs = require('fs');
const vm = require('vm');
const path = require('path');
let ok = 0, ruim = 0;
const t = (nome, cond, extra = '') => { cond ? ok++ : ruim++; console.log((cond ? '  ok  ' : ' FALHOU') + ' ' + nome + (extra ? '  ' + extra : '')); };
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../extension/serie.js'), 'utf8'), ctx);
const S = ctx.MB_SERIE;

console.log('Série');
t('mesmo nome com data, acento ou caixa diferente é a mesma série', S.chave('Daily 16/10') === S.chave('daily') && S.chave('Reunião Semanal #12') === S.chave('reuniao semanal') && S.chave('Alinhamento (seg)') === S.chave('alinhamento seg'));
t('nomes diferentes não se misturam', S.chave('Daily de produto') !== S.chave('Daily de vendas'));
t('título só de números não vira série', S.chave('2026') === '');
const linhas = [
  { id: '2026-10-06|daily', titulo: 'Daily', data: '2026-10-06', texto: '1. antigo' },
  { id: '2026-10-13|daily 13/10', titulo: 'Daily 13/10', data: '2026-10-13', texto: '1. ponto A\n- [x] feito\n- [ ] falta' },
  { id: '2026-10-14|outra', titulo: 'Outra', data: '2026-10-14', texto: 'x' },
  { id: '2026-10-15|daily', titulo: 'Daily', data: '2026-10-15', texto: '' },
  { id: '2026-10-20|daily', titulo: 'Daily', data: '2026-10-20', texto: '' },
];
const a = S.anterior(linhas, 'Daily', '2026-10-20', '2026-10-20|daily');
t('acha a pauta mais recente da série, ignorando a vazia', a && a.data === '2026-10-13', JSON.stringify(a && a.data));
t('reunião nova (sem passado) não oferece nada', S.anterior(linhas, 'Reunião inédita', '2026-10-20', 'x') === null);
t('não oferece a pauta de uma data futura', S.anterior(linhas, 'Daily', '2026-10-05', 'x') === null);

console.log('Copiar e modelo');
t('copiar tira o que já foi feito e mantém o resto', S.copiar(a.texto) === '1. ponto A\n- [ ] falta');
t('o modelo é lista numerada + combinados como tarefa', /^1\. /.test(S.MODELO) && /- \[ \] /.test(S.MODELO));
t('o modelo intocado conta como vazio', S.vazia(S.MODELO) === true && S.vazia('1. ponto A') === false);

console.log(`\n${ok} ok, ${ruim} falharam`);
process.exit(ruim ? 1 : 0);
