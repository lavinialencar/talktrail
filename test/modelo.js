// Modelo de pauta: lista numerada + combinados; só o modelo, sem nada escrito, não conta como pauta
const fs = require('fs');
const vm = require('vm');
const path = require('path');
let ok = 0, ruim = 0;
const t = (nome, cond, extra = '') => { cond ? ok++ : ruim++; console.log((cond ? '  ok  ' : ' FALHOU') + ' ' + nome + (extra ? '  ' + extra : '')); };
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../extension/modelo.js'), 'utf8'), ctx);
const M = ctx.MB_MODELO;
console.log('Modelo');
t('o modelo é lista numerada + combinados como tarefa', /^1\. /.test(M.TEXTO) && /- \[ \] /.test(M.TEXTO));
t('o modelo intocado conta como vazio', M.vazia(M.TEXTO) === true && M.vazia('') === true);
t('qualquer texto escrito conta como pauta', M.vazia('1. ponto A') === false && M.vazia(M.TEXTO + 'decidir orçamento') === false);
console.log(`\n${ok} ok, ${ruim} falharam`);
process.exit(ruim ? 1 : 0);
