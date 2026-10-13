// Entrada absurda do lado da extensão: títulos esquisitos, textos enormes, desempenho.
// Uso: npm i jsdom@24 && node extensao.js
const { JSDOM } = require('jsdom');
const fs = require('fs');
const c = require('../extension/content.js');

let ok = 0, ruim = 0;
const t = (nome, cond, extra = '') => { cond ? ok++ : ruim++; console.log((cond ? '  ok  ' : ' FALHOU') + ' ' + nome + (extra ? '  ' + extra : '')); };
const tempo = (f) => { const a = process.hrtime.bigint(); const r = f(); return [r, Number(process.hrtime.bigint() - a) / 1e6]; };

console.log('Título da aba do Meet');
for (const [nome, tit] of Object.entries({
  vazio: '', emoji: 'Meet – 🚀🔥 Kickoff', árabe: 'Meet – اجتماع الفريق', 'html': 'Meet – <img src=x onerror=alert(1)>',
  'nulo': null, 'indefinido': undefined, 'só código': 'abc-defg-hij', 'gigante': 'A'.repeat(100000), 'quebra': 'a\nb\n## c',
})) {
  const [r, ms] = tempo(() => c.tituloPadrao(tit));
  t(`tituloPadrao(${nome})`, typeof r === 'string' && r.length > 0 && r.length <= 200 && !/[\n\r]/.test(r) && ms < 50, `→ ${JSON.stringify(String(r).slice(0, 40))} ${r.length} letras, ${ms.toFixed(1)} ms`);
}

console.log('Tags pelo nome da reunião');
{
  const lista = ['Produto', 'Design', 'Café', 'Ünïcödé', '日本語', 'Ab', '😀😀😀', 'x'.repeat(5000)];
  const [r, ms] = tempo(() => c.inferirTags('Kickoff de produto, design e CAFE com 日本語 e unicode 😀😀😀', lista));
  t('acha sem acento, sem caixa, em outros alfabetos', r.includes('Produto') && r.includes('Design') && r.includes('Café') && r.includes('日本語'), JSON.stringify(r));
  t('não casa tag curta demais', !r.includes('Ab'));
  const grande = Array.from({ length: 5000 }, (_, i) => 'tag' + i);
  const [, ms2] = tempo(() => c.inferirTags('Reunião tag4999 tag1', grande));
  t('5 mil tags salvas em menos de 100 ms', ms2 < 100, `${ms2.toFixed(1)} ms`);
}

console.log('Texto repetido, entrada enorme');
{
  const frase = 'Isso aqui é uma frase de teste com bastante palavra pra repetir. ';
  const [r1, ms1] = tempo(() => c.limparRepeticoes(frase.repeat(20000))); // ~1,3 MB
  t('limparRepeticoes em 1,3 MB repetido', r1.length < 200 && ms1 < 3000, `${ms1.toFixed(0)} ms, ficou ${r1.length} letras`);
  const unico = Array.from({ length: 20000 }, (_, i) => `Frase número ${i} com palavra${i} diferente${i * 7}.`).join(' ');
  const [r2, ms2] = tempo(() => c.limparRepeticoes(unico));
  t('limparRepeticoes em 20 mil frases diferentes', r2.length > unico.length * 0.9 && ms2 < 8000, `${ms2.toFixed(0)} ms`);
  const [r3, ms3] = tempo(() => c.limparRepeticoes('a'.repeat(1_000_000)));
  t('um milhão de letras sem pontuação', r3.length === 1_000_000 && ms3 < 1500, `${ms3.toFixed(0)} ms`);
  const [r4, ms4] = tempo(() => c.fundir('abc '.repeat(30000), 'abc '.repeat(30000) + 'fim'));
  t('fundir texto de 120 mil letras', ms4 < 1500, `${ms4.toFixed(0)} ms`);
  const [r5, ms5] = tempo(() => c.fundir('x'.repeat(80000), 'y'.repeat(80000)));
  t('fundir dois textos sem nada em comum (pior caso)', ms5 < 3000, `${ms5.toFixed(0)} ms`);
}

console.log('Editor: colar texto gigante');
{
  const dom = new JSDOM('<body></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.document.createRange = () => ({ setStart() {}, setEnd() {}, getClientRects: () => [], getBoundingClientRect: () => ({}), commonAncestorContainer: w.document.body });
  w.eval(fs.readFileSync(__dirname + '/../extension/vendor/editor.js', 'utf8'));
  const host = w.document.body.appendChild(w.document.createElement('div'));
  const ed = w.MBEditor.create(host, {});
  const v = ed._view;
  const grande = Array.from({ length: 20000 }, (_, i) => `${i % 3 ? '1. ' : '- '}linha ${i} com **negrito** e [01:23] texto`).join('\n');
  const [, msSet] = tempo(() => ed.setValue(grande));
  t('colar 20 mil linhas (~1 MB)', msSet < 4000 && ed.getValue().length === grande.length, `${msSet.toFixed(0)} ms`);
  const [, msTab] = tempo(() => {
    v.dispatch({ selection: { anchor: 0, head: v.state.doc.length } });
    const ev = new w.KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true, cancelable: true });
    v.contentDOM.dispatchEvent(ev);
  });
  t('Tab em 20 mil linhas selecionadas (recuo + renumeração)', msTab < 6000, `${msTab.toFixed(0)} ms`);
  const [, msUma] = tempo(() => ed.setValue('x'.repeat(1_000_000)));
  t('uma linha de 1 milhão de letras', msUma < 4000, `${msUma.toFixed(0)} ms`);
  ed.setValue('😀👨‍👩‍👧‍👦اجتماع日本語‮abc');
  t('emoji, RTL e CJK entram e saem iguais', ed.getValue() === '😀👨‍👩‍👧‍👦اجتماع日本語‮abc');
}

console.log(`\n${ok} ok, ${ruim} falharam`);
process.exit(ruim ? 1 : 0);
