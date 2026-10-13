// Complemento (instalador do servidor): o zip sai válido, com o instalador do Mac executável, e a cópia do servidor
// dentro da extensão é idêntica ao servidor do projeto.
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
let ok = 0, ruim = 0;
const t = (nome, cond, extra = '') => { cond ? ok++ : ruim++; console.log((cond ? '  ok  ' : ' FALHOU') + ' ' + nome + (extra ? '  ' + extra : '')); };
const raiz = path.join(__dirname, '..');

console.log('Cópia do servidor dentro da extensão');
const a = fs.readFileSync(path.join(raiz, 'server/talktrail_server.py'));
const b = fs.readFileSync(path.join(raiz, 'extension/complemento/talktrail_server.py'));
t('é idêntica ao servidor (rode "npm run sincronizar" se mudou)', a.equals(b));
for (const f of ['instalar-mac.command', 'instalar-linux.sh']) {
  try {
    execFileSync('bash', ['-n', path.join(raiz, 'extension/complemento', f)]);
    t(`${f}: sintaxe do bash ok`, true);
  } catch (e) {
    t(`${f}: sintaxe do bash ok`, false, String(e.stderr || e));
  }
}
const bat = fs.readFileSync(path.join(raiz, 'extension/complemento/instalar-windows.bat'), 'utf8');
t('o .bat é só ASCII (sem acento que o Windows lê errado)', /^[\x00-\x7f]*$/.test(bat));
t('o .bat procura py -3, python e tenta o winget', /py -3/.test(bat) && /python -c/.test(bat) && /winget install/.test(bat));
t('os instaladores rodam o servidor com --instalar', ['instalar-mac.command', 'instalar-linux.sh'].every((f) => /--instalar/.test(fs.readFileSync(path.join(raiz, 'extension/complemento', f), 'utf8'))) && /--instalar/.test(bat));

console.log('ZIP');
const ctx = vm.createContext({ self: null, TextEncoder, Uint8Array, DataView, ArrayBuffer, Uint32Array });
ctx.self = ctx;
vm.runInContext(fs.readFileSync(path.join(raiz, 'extension/zip.js'), 'utf8'), ctx);
const enc = new TextEncoder();
const zip = ctx.MB_ZIP.criar([
  { nome: 'Instalar Talktrail.command', bytes: enc.encode('#!/bin/bash\necho oi\n'), modo: 0o755 },
  { nome: 'talktrail_server.py', bytes: new Uint8Array(b), modo: 0o644 },
  { nome: 'LEIA-ME.txt', bytes: enc.encode('Olá, acentuação 日本'), modo: 0o644 },
], new Date(2026, 9, 12, 12, 0, 0));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mbzip-'));
const arq = path.join(tmp, 'x.zip');
fs.writeFileSync(arq, Buffer.from(zip));
const saida = execFileSync('python3', ['-I', '-c', `
import zipfile, json, sys
z = zipfile.ZipFile(sys.argv[1])
print(json.dumps({"teste": z.testzip(), "itens": [[i.filename, oct((i.external_attr >> 16) & 0o777), i.file_size] for i in z.infolist()], "conteudo": z.read("LEIA-ME.txt").decode("utf-8")}))
`, arq]).toString();
const r = JSON.parse(saida);
t('o zip passa no teste de integridade (CRC)', r.teste === null, String(r.teste));
t('tem os 3 arquivos', r.itens.length === 3);
t('o instalador do Mac sai executável (755)', r.itens[0][0] === 'Instalar Talktrail.command' && r.itens[0][1] === '0o755', JSON.stringify(r.itens[0]));
t('o servidor sai com o tamanho certo', r.itens[1][2] === b.length);
t('nome e texto com acento e outro alfabeto voltam iguais', r.conteudo === 'Olá, acentuação 日本');
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n${ok} ok, ${ruim} falharam`);
process.exit(ruim ? 1 : 0);
