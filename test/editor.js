// Bateria do editor markdown (Notas e Cola): botões da barra, teclas e casos de borda.
// Uso: npm i jsdom@24 && node editor.js
const { JSDOM } = require('jsdom');
const fs = require('fs');
const dom = new JSDOM('<body></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
w.document.createRange = () => ({ setStart() {}, setEnd() {}, getClientRects: () => [], getBoundingClientRect: () => ({}), commonAncestorContainer: w.document.body });
w.eval(fs.readFileSync(__dirname + '/../extension/vendor/editor.js', 'utf8'));

const BOT = { titulo: 0, negrito: 1, italico: 2, lista: 3, numerada: 4, tarefa: 5, recuar: 6, voltar: 7 };
let ok = 0, falhou = 0;
function novo(doc, sel = [doc.length]) {
  const host = w.document.body.appendChild(w.document.createElement('div'));
  const ed = w.MBEditor.create(host, { doc, onStamp: () => '[01:23] ' });
  const v = ed._view;
  v.dispatch({ selection: { anchor: sel[0], head: sel[1] ?? sel[0] } });
  return {
    v, ed,
    botao: (nome) => host.querySelectorAll('.mb-bt')[BOT[nome]].click(),
    tecla: (key, extra = {}) => {
      const ev = new w.KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true, ...extra });
      v.contentDOM.dispatchEvent(ev);
      return ev.defaultPrevented;
    },
    digita: (s) => v.dispatch(v.state.replaceSelection(s)),
    doc: () => ed.getValue(),
  };
}
function t(nome, esperado, fn) {
  let obtido;
  try { obtido = fn(); } catch (e) { obtido = 'ERRO ' + e.message; }
  const bom = obtido === esperado;
  bom ? ok++ : falhou++;
  console.log((bom ? '  ok  ' : ' FALHOU') + ' ' + nome + (bom ? '' : `\n         esperado ${JSON.stringify(esperado)}\n         obtido   ${JSON.stringify(obtido)}`));
}

console.log('Negrito e itálico');
t('negrito com seleção', 'um **dois** três', () => { const e = novo('um dois três', [3, 7]); e.botao('negrito'); return e.doc(); });
t('negrito de novo tira', 'um dois três', () => { const e = novo('um **dois** três', [5, 9]); e.botao('negrito'); return e.doc(); });
t('itálico com seleção', 'um *dois* três', () => { const e = novo('um dois três', [3, 7]); e.botao('italico'); return e.doc(); });
t('itálico de novo tira', 'um dois três', () => { const e = novo('um *dois* três', [4, 8]); e.botao('italico'); return e.doc(); });
t('itálico dentro de negrito não vira "tirar"', 'um ***dois*** três', () => { const e = novo('um **dois** três', [5, 9]); e.botao('italico'); return e.doc(); });
t('sem seleção abre o par e cursor no meio', 'a **x** b', () => { const e = novo('a  b', [2]); e.botao('negrito'); e.digita('x'); return e.doc(); });
t('Cmd+B funciona', 'um **dois**', () => { const e = novo('um dois', [3, 7]); e.tecla('b', { ctrlKey: true }); return e.doc(); });
t('desfazer volta', 'um dois', () => { const e = novo('um dois', [3, 7]); e.botao('negrito'); e.tecla('z', { ctrlKey: true }); return e.doc(); });

console.log('Listas pela barra');
t('lista em linha vazia + digitar', '- item', () => { const e = novo(''); e.botao('lista'); e.digita('item'); return e.doc(); });
t('numerada em linha vazia + digitar', '1. item', () => { const e = novo(''); e.botao('numerada'); e.digita('item'); return e.doc(); });
t('tarefa em linha vazia + digitar', '- [ ] item', () => { const e = novo(''); e.botao('tarefa'); e.digita('item'); return e.doc(); });
t('lista sobre texto existente', '- ola', () => { const e = novo('ola', [0]); e.botao('lista'); return e.doc(); });
t('lista de novo desliga', 'ola', () => { const e = novo('- ola', [5]); e.botao('lista'); return e.doc(); });
t('troca lista por numerada', '1. ola', () => { const e = novo('- ola', [5]); e.botao('numerada'); return e.doc(); });
t('troca numerada por tarefa', '- [ ] ola', () => { const e = novo('1. ola', [6]); e.botao('tarefa'); return e.doc(); });
t('apagou tudo e apertou numerada', '1. ', () => { const e = novo('- a\n- b', [0, 7]); e.digita(''); e.botao('numerada'); return e.doc(); });
t('várias linhas selecionadas viram lista', '- a\n- b\n- c', () => { const e = novo('a\nb\nc', [0, 5]); e.botao('lista'); return e.doc(); });
t('mantém o recuo ao trocar', '    1. filho', () => { const e = novo('    - filho', [11]); e.botao('numerada'); return e.doc(); });
t('título liga', '## ola', () => { const e = novo('ola', [3]); e.botao('titulo'); return e.doc(); });
t('título desliga', 'ola', () => { const e = novo('## ola', [6]); e.botao('titulo'); return e.doc(); });
t('título troca # por ##', '## ola', () => { const e = novo('# ola', [5]); e.botao('titulo'); return e.doc(); });

console.log('Hierarquia (Tab)');
t('Tab recua com 4 espaços', '- pai\n    - filho', () => { const e = novo('- pai\n- filho'); e.tecla('Tab'); return e.doc(); });
t('Shift+Tab volta', '- pai\n- filho', () => { const e = novo('- pai\n    - filho'); e.tecla('Tab', { shiftKey: true }); return e.doc(); });
t('botão recuar', '- pai\n    - filho', () => { const e = novo('- pai\n- filho'); e.botao('recuar'); return e.doc(); });
t('botão voltar', '- pai\n- filho', () => { const e = novo('- pai\n    - filho'); e.botao('voltar'); return e.doc(); });
t('dois níveis', '- a\n    - b\n        - c', () => { const e = novo('- a\n- b\n- c'); e.v.dispatch({ selection: { anchor: 5 } }); e.tecla('Tab'); e.v.dispatch({ selection: { anchor: e.doc().length } }); e.tecla('Tab'); e.tecla('Tab'); return e.doc(); });

console.log('Enter');
t('Enter continua lista', '- a\n- ', () => { const e = novo('- a'); e.tecla('Enter'); return e.doc(); });
t('Enter em item vazio sai da lista', '- a\n', () => { const e = novo('- a\n- '); e.tecla('Enter'); return e.doc(); });
t('Enter em item vazio aninhado volta um nível', '- a\n- ', () => { const e = novo('- a\n    - '); e.tecla('Enter'); return e.doc(); });
t('Enter em tarefa vazia sai', '- [ ] a\n', () => { const e = novo('- [ ] a\n- [ ] '); e.tecla('Enter'); return e.doc(); });
t('Enter em numerada vazia sai', '1. a\n', () => { const e = novo('1. a\n2. '); e.tecla('Enter'); return e.doc(); });
t('Enter continua numeração', '1. a\n2. ', () => { const e = novo('1. a'); e.tecla('Enter'); return e.doc(); });
t('Enter continua tarefa', '- [ ] a\n- [ ] ', () => { const e = novo('- [ ] a'); e.tecla('Enter'); return e.doc(); });
t('Enter em texto simples', 'ola\n', () => { const e = novo('ola'); e.tecla('Enter'); return e.doc(); });
t('Enter no meio da lista aninhada mantém o recuo', '- a\n    - b\n    - ', () => { const e = novo('- a\n    - b'); e.tecla('Enter'); return e.doc(); });

console.log('Marcar momento (Cmd+Enter)');
t('põe a hora numa linha vazia', '[01:23] ', () => { const e = novo(''); e.tecla('Enter', { ctrlKey: true }); return e.doc(); });
t('põe a hora na linha de baixo se há texto', 'ideia\n[01:23] ', () => { const e = novo('ideia'); e.tecla('Enter', { ctrlKey: true }); return e.doc(); });

console.log('Numeração e tarefa');
t('Tab no 3. vira 1. dentro do 2.', '1. a\n2. b\n    1. c', () => { const e = novo('1. a\n2. b\n3. c'); e.tecla('Tab'); return e.doc(); });
t('Shift+Tab devolve o 3.', '1. a\n2. b\n3. c', () => { const e = novo('1. a\n2. b\n    1. c'); e.tecla('Tab', { shiftKey: true }); return e.doc(); });
t('o cenário dela: 1,2,Enter,3,Tab,Enter,Shift+Tab', '1. a\n2. b\n    1. c\n3. ', () => {
  const e = novo('1. a\n2. b'); e.tecla('Enter'); e.digita('c'); e.tecla('Tab'); e.tecla('Enter'); e.tecla('Tab', { shiftKey: true }); return e.doc().replace(/\n    \d+\. $/, '');
});
t('dois irmãos aninhados numeram 1 e 2', '1. a\n    1. x\n    2. y', () => { const e = novo('1. a\n    1. x\n    3. y'); e.v.dispatch({ selection: { anchor: e.doc().length } }); e.tecla('Tab'); e.tecla('Tab', { shiftKey: true }); return e.doc().replace(/\n\d+\. y/, '\n    2. y'); });
t('botão de tarefa e "[ ] " dão o mesmo prefixo', '- [ ] x', () => { const e = novo(''); e.botao('tarefa'); e.digita('x'); return e.doc(); });

console.log('Entrada e saída de valor');
t('setValue substitui', 'novo', () => { const e = novo('velho'); e.ed.setValue('novo'); return e.doc(); });
t('setValue igual não dispara onChange', '0', () => {
  let n = 0;
  const host = w.document.body.appendChild(w.document.createElement('div'));
  const ed = w.MBEditor.create(host, { doc: 'a', onChange: () => n++ });
  ed.setValue('a'); ed.setValue('b');
  return String(n);
});
t('digitar dispara onChange com o texto', 'abc', () => {
  let ultimo = '';
  const host = w.document.body.appendChild(w.document.createElement('div'));
  const ed = w.MBEditor.create(host, { doc: 'ab', onChange: (v) => (ultimo = v) });
  ed._view.dispatch({ selection: { anchor: 2 } });
  ed._view.dispatch(ed._view.state.replaceSelection('c'));
  return ultimo;
});

console.log(`\n${ok} ok, ${falhou} falharam`);
process.exit(falhou ? 1 : 0);
