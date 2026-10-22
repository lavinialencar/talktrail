// Integridade do PACOTE DA LOJA (o que de fato vai pro Google), sem navegador:
// todo arquivo citado existe, todo id usado no JS existe no HTML, todo texto traduzível tem inglês, manifesto e locales coerentes.
const fs = require('fs'), path = require('path'), { execSync } = require('child_process'), os = require('os');
let ok = 0, ruim = 0;
const t = (nome, cond, extra = '') => { cond ? ok++ : ruim++; console.log((cond ? '  ok  ' : ' FALHOU') + ' ' + nome + (extra ? '  ' + extra : '')); };
const RAIZ = path.join(__dirname, '..');
const man0 = JSON.parse(fs.readFileSync(path.join(RAIZ, 'extension/manifest.json'), 'utf8'));
execSync(`python3 tools/empacotar.py ${JSON.stringify(os.tmpdir())}`, { cwd: RAIZ, stdio: 'pipe' });
const PK = path.join(os.tmpdir(), `talktrail-${man0.version}`);
const ler = (f) => fs.readFileSync(path.join(PK, f), 'utf8');
const existe = (f) => fs.existsSync(path.join(PK, f));
const man = JSON.parse(ler('manifest.json'));

console.log('Manifesto');
t('manifest_version 3', man.manifest_version === 3);
t('versão mínima do Chrome declarada (o painel lateral só existe a partir da 114)', Number(man.minimum_chrome_version) >= 114, String(man.minimum_chrome_version));
t('sem version_name de desenvolvimento no pacote', !man.version_name);
t('idioma padrão em inglês (a ficha da loja nasce em inglês)', man.default_locale === 'en');
t('só o Meet e o servidor local como hosts', JSON.stringify(man.host_permissions) === JSON.stringify(['https://meet.google.com/*', 'http://127.0.0.1:8787/*']), JSON.stringify(man.host_permissions));
t('nenhuma permissão perigosa', !(man.permissions || []).some((p) => ['tabs', 'management', 'webRequest', 'cookies', 'history', '<all_urls>'].includes(p)), JSON.stringify(man.permissions));
for (const k of ['en', 'pt_BR']) {
  t(`_locales/${k}/messages.json existe e é JSON válido`, existe(`_locales/${k}/messages.json`) && !!JSON.parse(ler(`_locales/${k}/messages.json`)));
}
const msgs = { en: JSON.parse(ler('_locales/en/messages.json')), pt: JSON.parse(ler('_locales/pt_BR/messages.json')) };
const usadas = new Set([...JSON.stringify(man).matchAll(/__MSG_([A-Za-z0-9_@]+)__/g)].map((m) => m[1]));
for (const u of usadas) t(`mensagem __MSG_${u}__ existe nos dois idiomas`, u in msgs.en && u in msgs.pt);
t('descrição curta cabe no limite da loja (132) nos dois idiomas', msgs.en.extDescricao.message.length <= 132 && msgs.pt.extDescricao.message.length <= 132, `${msgs.en.extDescricao.message.length}/${msgs.pt.extDescricao.message.length}`);
t('nome da extensão curto (<= 45) e igual nos dois idiomas', String(man.name).length <= 45 && !/__MSG/.test(man.name), man.name);
const refs = [man.background && man.background.service_worker, man.side_panel && man.side_panel.default_path, ...Object.values(man.icons || {}), ...Object.values((man.action || {}).default_icon || {}), ...(man.content_scripts || []).flatMap((c) => [...(c.js || []), ...(c.css || [])]), ...(man.web_accessible_resources || []).flatMap((w) => w.resources || [])].filter(Boolean);
for (const r of refs) t(`arquivo do manifesto existe: ${r}`, existe(r));
for (const f of Object.values(man.icons || {})) t(`ícone ${f} tem o tamanho certo`, existe(f) && ler(f).length > 100 && (() => { const b = fs.readFileSync(path.join(PK, f)); return b.readUInt32BE(16) === Number(f.match(/(\d+)\.png/)[1]); })());

console.log('Páginas HTML');
for (const h of fs.readdirSync(PK).filter((f) => f.endsWith('.html'))) {
  const html = ler(h);
  for (const m of html.matchAll(/<(?:script|link|img)[^>]+(?:src|href)="([^"#?]+)"/g)) if (!/^(https?:|data:|chrome)/.test(m[1])) t(`${h}: ${m[1]} existe`, existe(m[1]));
  t(`${h}: sem script inline (a loja barra)`, !/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(html.replace(/<script[^>]*src=[^>]*><\/script>/gi, '')));
  t(`${h}: tem ícone da aba`, /rel="icon"/.test(html));
  t(`${h}: tem <title>`, /<title>[^<]+<\/title>/.test(html));
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  t(`${h}: ids repetidos`, ids.size === [...html.matchAll(/\sid="([^"]+)"/g)].length, [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]).filter((x, i, a) => a.indexOf(x) !== i).join(','));
  // todo $('id') / getElementById('id') dos scripts dessa página existe nela
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]).filter((s) => existe(s));
  const faltando = new Set();
  for (const s of scripts) {
    const js = ler(s);
    for (const m of js.matchAll(/(?:\$|getElementById)\(\s*['"]([A-Za-z0-9_-]+)['"]\s*\)/g)) if (!ids.has(m[1]) && !new RegExp(`id\\s*=\\s*['"]${m[1]}['"]|id:\\s*['"]${m[1]}['"]|\\.id\\s*=\\s*['"]${m[1]}['"]`).test(scripts.map(ler).join('\n'))) faltando.add(`${s}:${m[1]}`);
  }
  t(`${h}: todo id usado pelo JS existe na página`, faltando.size === 0, [...faltando].slice(0, 6).join(', '));
}

console.log('Traduções');
const src = ler('i18n-en.js');
const dic = new Set([...src.matchAll(/^\s*"((?:[^"\\]|\\.)+)"\s*:/gm)].map((m) => JSON.parse('"' + m[1] + '"')));
const faltam = [];
for (const f of ['panel.js', 'pautas.js', 'biblioteca.js', 'boas-vindas.js', 'content.js', 'background.js', 'pagina.js', 'backup.js', 'pasta.js']) {
  if (!existe(f)) continue;
  for (const m of ler(f).matchAll(/\btrad\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
    let s; try { s = m[1] === '`' ? m[2] : JSON.parse('"' + m[2].replace(/\\'/g, "'").replace(/"/g, '\\"') + '"'); } catch (e) { continue; }
    if (/[A-Za-zÀ-ÿ]{3}/.test(s) && !dic.has(s) && !/^[\s+{}0-9()\-]*(tags?|chat)[\s+{}0-9()\-]*$/i.test(s)) faltam.push(`${f}: ${s.slice(0, 60)}`);
  }
}
t('todo texto de trad("…") tem tradução para o inglês', faltam.length === 0, faltam.slice(0, 5).join(' | ') + (faltam.length > 5 ? ` (+${faltam.length - 5})` : ''));
const htmlTextos = [];
for (const h of fs.readdirSync(PK).filter((f) => f.endsWith('.html'))) {
  for (const m of ler(h).matchAll(/>([^<>{}]*[A-Za-zÀ-ÿ]{3}[^<>{}]*)</g)) { const s = m[1].replace(/\s+/g, ' ').trim(); if (s && !dic.has(s) && /[áéíóúãõçâêôà]|\b(de|para|que|com|uma|não)\b/i.test(s)) htmlTextos.push(`${h}: ${s.slice(0, 60)}`); }
}
t('todo texto fixo das páginas em português tem tradução para o inglês', htmlTextos.length === 0, htmlTextos.slice(0, 5).join(' | ') + (htmlTextos.length > 5 ? ` (+${htmlTextos.length - 5})` : ''));

console.log('Pacote');
t('sem arquivos de desenvolvimento no pacote', !existe('dev-hot.js') && !existe('complemento') && !/dev-hot|extversao/.test(ler('background.js')));
t('sem scripts executáveis (.py .sh .bat .command)', !fs.readdirSync(PK, { recursive: true }).some((f) => /\.(py|sh|bat|command)$/.test(f)));
t('sem eval nem new Function nos scripts da extensão', !['background.js', 'content.js', 'panel.js', 'pautas.js', 'biblioteca.js', 'md.js'].some((f) => /\beval\(|new Function\(/.test(ler(f))));
t('tamanho do pacote sensato (< 2 MB)', fs.readdirSync(PK, { recursive: true }).reduce((a, f) => { try { return a + fs.statSync(path.join(PK, f)).size; } catch (e) { return a; } }, 0) < 2e6);
console.log(`\n${ok} ok, ${ruim} falhou`);
process.exit(ruim ? 1 : 0);
