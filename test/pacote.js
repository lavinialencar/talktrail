// O pacote da loja: sem instalador, sem recarga de desenvolvimento, sem "tabs", sem version_name.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const raiz = path.join(__dirname, '..');
let falhas = 0;
const t = (nome, ok) => { console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}`); if (!ok) falhas++; };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'talktrail-pacote-'));
execFileSync('python3', [path.join(raiz, 'tools/empacotar.py'), tmp]);
const man = JSON.parse(fs.readFileSync(path.join(raiz, 'extension/manifest.json'), 'utf8'));
const pasta = path.join(tmp, `talktrail-${man.version}`);
const lista = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? lista(path.join(d, e.name)).map((f) => path.join(e.name, f)) : [e.name]));
const arquivos = lista(pasta);
const mp = JSON.parse(fs.readFileSync(path.join(pasta, 'manifest.json'), 'utf8'));

t('o zip existe', fs.existsSync(pasta + '.zip'));
t('sem instalador (complemento/)', !arquivos.some((f) => f.startsWith('complemento')));
t('sem scripts executáveis', !arquivos.some((f) => /\.(command|bat|sh|py)$/.test(f)));
t('sem dev-hot.js', !arquivos.includes('dev-hot.js'));
t('manifest do pacote sem version_name', mp.version_name === undefined);
t('manifest do pacote sem "tabs"', !(mp.permissions || []).includes('tabs'));
t('o manifest de desenvolvimento segue com version_name dev', /dev/.test(man.version_name || ''));
t('ícones 16/32/48/128 existem', [16, 32, 48, 128].every((n) => fs.existsSync(path.join(pasta, `icons/icon-${n}.png`))));
t('manifest aponta os ícones', ['16', '32', '48', '128'].every((n) => mp.icons && mp.icons[n] && mp.action.default_icon[n]));
const bg = fs.readFileSync(path.join(pasta, 'background.js'), 'utf8');
t('background do pacote sem recarga de desenvolvimento', !/extversao|dev-hot/.test(bg));
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(falhas ? 1 : 0);
