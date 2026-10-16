// Cópia de segurança: exporta só o que é da pessoa, importa juntando sem apagar nada
const fs = require('fs');
const vm = require('vm');
const path = require('path');
let ok = 0, ruim = 0;
const t = (nome, cond, extra = '') => { cond ? ok++ : ruim++; console.log((cond ? '  ok  ' : ' FALHOU') + ' ' + nome + (extra ? '  ' + extra : '')); };
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../extension/backup.js'), 'utf8'), ctx);
const B = ctx.MB_BACKUP;
const j = (x) => JSON.parse(JSON.stringify(x));

console.log('Exportar');
const tudo = { 'reuniao:1': { payload: { titulo: 'A' } }, pautas: { 'd|a': { titulo: 'A', texto: 'x', atualizada: 5 } }, tagsSalvas: ['x'], ajustes: { a: 1 }, 'cola:_': 'texto', pareamento: 'SEGREDO', agendaMeet: [{ titulo: 'z' }], agendaDias: { d: 1 }, pastaPendente: true };
const e = B.exportar(tudo, new Date(2026, 9, 16));
const arq = JSON.parse(e.texto);
t('o nome do arquivo leva a data', e.nome === 'talktrail-copia-2026-10-16.json', e.nome);
t('leva reuniões, pautas, tags, ajustes e a pauta por tag', ['reuniao:1', 'pautas', 'tagsSalvas', 'ajustes', 'cola:_'].every((k) => k in arq.dados));
t('NUNCA leva a chave de pareamento', !('pareamento' in arq.dados) && !/SEGREDO/.test(e.texto));
t('não leva a agenda lida nem estados internos', !('agendaMeet' in arq.dados) && !('agendaDias' in arq.dados) && !('pastaPendente' in arq.dados));

console.log('Ler');
t('arquivo qualquer é recusado com mensagem clara', /não é uma cópia/.test(B.ler('{"a":1}').erro) && /não é uma cópia/.test(B.ler('isso não é json').erro));
t('a cópia do próprio Talktrail é aceita', !!B.ler(e.texto).dados);

console.log('Importar (juntar)');
const atual = { 'reuniao:1': { payload: { titulo: 'MINHA' } }, pautas: { 'd|a': { texto: 'novo', atualizada: 9 }, 'd|b': { texto: 'b', criada: 1 } }, tagsSalvas: ['x', 'y'], ajustes: { a: 2 }, pareamento: 'MEU' };
const arquivo = { 'reuniao:1': { payload: { titulo: 'DO ARQUIVO' } }, 'reuniao:2': { payload: { titulo: 'B' } }, pautas: { 'd|a': { texto: 'antigo', atualizada: 5 }, 'd|c': { texto: 'c', criada: 3 } }, tagsSalvas: ['y', 'z'], ajustes: { a: 99 }, pareamento: 'INVASOR', agendaMeet: [1] };
const r = B.mesclar(j(atual), j(arquivo));
t('reunião que já existe não é trocada; a nova entra', !('reuniao:1' in r.grava) && r.grava['reuniao:2'].payload.titulo === 'B' && r.n.reunioes === 1);
t('pauta mais recente ganha; pauta nova entra; a mais antiga do arquivo não sobrescreve', r.grava.pautas['d|a'].texto === 'novo' && r.grava.pautas['d|c'].texto === 'c' && r.grava.pautas['d|b'].texto === 'b' && r.n.pautas === 1);
t('pauta do arquivo mais recente vence a atual', B.mesclar({ pautas: { 'd|a': { texto: 'velho', atualizada: 1 } } }, { pautas: { 'd|a': { texto: 'recente', atualizada: 8 } } }).grava.pautas['d|a'].texto === 'recente');
t('tags são unidas, sem repetir', JSON.stringify(r.grava.tagsSalvas) === JSON.stringify(['x', 'y', 'z']) && r.n.tags === 1);
t('ajustes atuais não são trocados', !('ajustes' in r.grava));
t('chave de pareamento e agenda do arquivo são ignoradas', !('pareamento' in r.grava) && !('agendaMeet' in r.grava));
t('importar o mesmo arquivo de novo não muda nada', Object.keys(B.mesclar({ ...j(atual), ...j(r.grava) }, j(arquivo)).grava).length === 0);
t('o resumo conta o que entrou', B.resumo(r.n) === 'Importado: 1 reunião, 1 pauta, 1 tag.' && /Nada novo/.test(B.resumo({ reunioes: 0, pautas: 0, tags: 0 })));
t('lixo dentro do arquivo não quebra', Object.keys(B.mesclar({}, { pautas: 'x', tagsSalvas: 5, 'reuniao:9': 1, 'cola:_': 4 }).grava).length === 0);

console.log('Painel');
const html = fs.readFileSync(path.join(__dirname, '../extension/panel.html'), 'utf8');
t('os Ajustes têm o grupo Cópia de segurança com Exportar e Importar', /<h3>Cópia de segurança<\/h3>/.test(html) && /id="ajExportar"/.test(html) && /id="ajImportar"/.test(html) && /<script src="backup\.js">/.test(html));

t('Ajustes explicam que as pautas também ficam em arquivos (Pautas/) editáveis por IA', /id="ajPautasArq"/.test(html) && /Pautas\//.test(fs.readFileSync(path.join(__dirname, '../extension/panel.js'), 'utf8')));
console.log(`\n${ok} ok, ${ruim} falharam`);
process.exit(ruim ? 1 : 0);
