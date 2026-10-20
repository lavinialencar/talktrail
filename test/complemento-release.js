// O botão "Instalar o complemento" do pacote da loja baixa um zip da Release do GitHub: o nome que o painel monta
// tem que ser o mesmo que tools/empacotar_complemento.py gera, e o fluxo tem que anexar esses zips na Release.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const raiz = path.join(__dirname, '..');
const painel = fs.readFileSync(path.join(raiz, 'extension/panel.js'), 'utf8');
const py = fs.readFileSync(path.join(raiz, 'tools/empacotar_complemento.py'), 'utf8');
const fluxo = fs.readFileSync(path.join(raiz, '.github/workflows/publicar-loja.yml'), 'utf8');

const url = painel.match(/const URL_COMPLEMENTO = '([^']+)'/);
assert(url, 'URL_COMPLEMENTO sumiu do painel');
assert(/^https:\/\/github\.com\/lavinialencar\/talktrail\/releases\/latest\/download\/Talktrail-complemento-$/.test(url[1]), 'endereço da Release mudou: ' + url[1]);
for (const so of ['mac', 'windows', 'linux']) {
  assert(new RegExp(`"${so}": \\(`).test(py), `o montador não gera o zip de ${so}`);
}
assert(py.includes('Talktrail-complemento-{so}.zip'), 'nome do zip diferente do que o painel baixa');
assert(/dist\/Talktrail-complemento-\*\.zip/.test(fluxo), 'o fluxo não anexa os zips do complemento na Release');
assert(/empacotar_complemento\.py/.test(fluxo), 'o fluxo não monta o complemento');
console.log('complemento-release ok');
