// O modo simples gera o .md no navegador (extension/md.js); o servidor gera em Python (server/talktrail_server.py).
// Os dois têm que produzir texto IDÊNTICO pra qualquer entrada. Uso: node md.js
const { spawnSync } = require('child_process');
const os = require('os');
const path = require('path');
const MD = require('../extension/md.js');

const base = { id: 'sessao-1', startedAt: '2026-10-11T22:00:00Z', endedAt: '2026-10-11T22:42:30Z', titulo: 'Reunião', transcript: [], marcas: [] };
const falas = [
  { t: 3, speaker: 'Eu', text: 'Então a ideia hoje é fechar quem a gente vai ouvir. Eu preciso de trinta minutos com cada pessoa. Pode ser?' },
  { t: 21, speaker: 'Ana', text: 'Beleza. Eu te mando os contatos hoje ainda. O Carlos não participa das entrevistas. ' + 'Frase longa de teste. '.repeat(30) },
  { t: 99.7, speaker: 'Zé 😀', text: '## Resumo\n---\n- item' },
];
const casos = [
  base,
  { ...base, titulo: 'Kickoff 🚀 do projeto', tags: ['Produto', 'revisão', ',,,l', 'a, b; c'], notes: '# Decisões\nprazo\n- [x] feito\n- [ ] falta\n[01:23] ligar\n> citação', cola: 'Quem decide?\n1. um\n2. dois', transcript: falas, marcas: [{ t: 40, texto: 'Ana: eu te mando' }, { t: 41, texto: '' }] },
  { ...base, titulo: '週次ミーティング 会議', transcript: falas },
  { ...base, titulo: 'اجتماع الفريق', transcript: falas },
  { ...base, titulo: 'Еженедельная встреча', tags: ['командa'], transcript: falas },
  { ...base, titulo: 'x\n## Resumo\n---', transcript: falas },
  { ...base, titulo: '', projeto: '  Projeto X  ' },
  { ...base, titulo: 'A'.repeat(500) },
  { ...base, endedAt: undefined },
  { ...base, endedAt: '2026-10-11T22:00:30Z' },
  { ...base, endedAt: '2026-10-11T22:01:30Z' },
  { ...base, endedAt: 'lixo' },
  { ...base, notes: '```js\ncodigo aberto', cola: '~~~\nx' },
  { ...base, notes: 'x'.repeat(2000), cola: '\t- aninhado\n\t\t- mais' },
  { ...base, notes: ['a'], cola: { a: 1 }, transcript: 'texto', marcas: 'x', tags: 'x', chat: 'x' },
  { ...base, transcript: [null, 1, 'x', { t: 'a', speaker: null, text: 5 }, { t: -3, speaker: '**ousado**', text: 'oi' }] },
  { ...base, marcas: [{ t: 'abc', texto: 'a\n## Resumo' }, { t: -5, texto: null }, { t: 1e12, texto: 'x' }, 'solto', null] },
  { ...base, transcript: [{ t: 3, speaker: 'Ana', text: 'oi' }, { t: 9, speaker: 'Talktrail', text: '(transcrição pausada por 9 s e retomada)' }] },
  { ...base, chat: [{ t: 5, speaker: 'Ana', text: 'oi' }], chatEstrutura: 'div.a{data-message-id,jsname} --> <script>alert(1)</script> --- x' },
  { ...base, chat: [{ t: 5, speaker: 'Ana', text: 'link https://x.com' }, { t: 9, speaker: 'Zé\n## Notas', text: '## Resumo\n---' }, { t: 'abc', speaker: null, text: 'ok' }, 'solto', null, { text: '' }] },
  { ...base, id: 'id com espaço/..\\x' },
  { ...base, titulo: 'a‮b​c d\u0000e', transcript: [{ t: 1, speaker: 'x‮', text: 'f\u0000g h' }] },
  { ...base, transcript: [{ t: 1, speaker: 'Ana', text: 'é café reunião' }], titulo: 'Reunião de ação' },
];
casos.push(...casos.map((c) => ({ ...c, idioma: 'en' }))); // o mesmo arquivo em inglês: os dois lados também têm que dar texto idêntico

function js() {
  return casos.map((c) => {
    try { return MD.render(JSON.parse(JSON.stringify(c))).texto; } catch (e) { return 'ERRO'; }
  });
}
function py() {
  const code = `
import json, os, sys
sys.path.insert(0, ${JSON.stringify(path.join(__dirname, '..', 'server'))})
import talktrail_server as m
out = []
for c in json.load(sys.stdin):
    try:
        out.append(m.render(c)[1])
    except Exception:
        out.append("ERRO")
print(json.dumps(out))
`;
  const r = spawnSync('python3', ['-c', code], {
    input: JSON.stringify(casos),
    env: { ...process.env, TALKTRAIL_OUT: os.tmpdir(), TALKTRAIL_ESTADO: os.tmpdir(), TALKTRAIL_PORT: '0' },
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
}

const a = js(), b = py();
let ok = 0, ruim = 0;
casos.forEach((c, i) => {
  const igual = a[i] === b[i];
  igual ? ok++ : ruim++;
  console.log((igual ? '  ok  ' : ' FALHOU') + ` caso ${i + 1}: ${JSON.stringify(c.titulo || '').slice(0, 40)}`);
  if (!igual) {
    const x = a[i].split('\n'), y = b[i].split('\n');
    const k = x.findIndex((l, j) => l !== y[j]);
    console.log('         JS    :', JSON.stringify((x[k] || '').slice(0, 120)));
    console.log('         Python:', JSON.stringify((y[k] || '').slice(0, 120)));
  }
});
console.log(`\n${ok} ok, ${ruim} falharam`);
process.exit(ruim ? 1 : 0);
