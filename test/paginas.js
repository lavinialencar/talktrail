// as páginas da extensão têm a mesma cara: logo no título e, nas duas grandes, a mesma navegação
const fs = require('fs');
const path = require('path');
let ok = 0, ruim = 0;
const t = (nome, cond) => { console.log(`  ${cond ? 'ok  ' : 'FALHOU'} ${nome}`); cond ? ok++ : ruim++; };
const ler = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
// a chavinha dos Ajustes tem um campo escondido (absoluto): se a linha não for o ponto de referência, marcar a chavinha rola a JANELA inteira e o painel fica vazio
{
  const css = ler('extension/panel.css');
  const opc = css.match(/^\.opc \{[^}]*\}/m);
  t('a linha da chavinha (.opc) é o ponto de referência do campo escondido (position: relative)', !!opc && /position:\s*relative/.test(opc[0]));
  t('o painel desfaz qualquer rolagem da janela', /window\.addEventListener\('scroll'[\s\S]{0,120}scrollTo\(0, 0\)/.test(ler('extension/panel.js')));
}
console.log('Páginas da extensão: mesma identidade');
for (const f of ['biblioteca.html', 'pautas.html', 'boas-vindas.html']) {
  const h = ler(`extension/${f}`);
  t(`${f} tem o logo no título`, /<h1[^>]*>\s*<img[^>]*icons\/icon-128\.png/.test(h));
}
for (const f of ['biblioteca.html', 'pautas.html', 'boas-vindas.html']) t(`${f} fecha o painel lateral ao abrir (pagina.js)`, /<script src="pagina\.js">/.test(ler(`extension/${f}`)));
for (const f of ['biblioteca.html', 'pautas.html']) {
  const h = ler(`extension/${f}`);
  t(`${f} tem a navegação Biblioteca | Pautas com a página atual marcada`, /class="pagina-nav"/.test(h) && (h.match(/aria-current="page"/g) || []).length === 1);
}
t('a página do servidor local tem o logo embutido', /<h1><img src="data:image\/png;base64,/.test(ler('server/talktrail_server.py')));
t('a cópia do servidor dentro da extensão está sincronizada', ler('server/talktrail_server.py') === ler('extension/complemento/talktrail_server.py'));
t('o painel não tem mais a dica de atalhos embaixo da pauta', !/<div id="colaTxt"[^>]*><\/div>\s*<p class="dica">/.test(ler('extension/panel.html')));
t('trocar de página é suave: a transição entre páginas está ligada e o cabeçalho fica parado', /@view-transition \{ navigation: auto; \}/.test(ler('extension/panel.css')) && /view-transition-name: topo-pagina/.test(ler('extension/panel.css')) && /prefers-reduced-motion/.test(ler('extension/panel.css').split('@view-transition')[1]));
t('boas-vindas tem o logo, os 4 passos numerados e fecha o painel', /<h1[^>]*>\s*<img[^>]*icon-128/.test(ler('extension/boas-vindas.html')) && (ler('extension/boas-vindas.html').match(/<li/g) || []).length === 4 && /pagina\.js/.test(ler('extension/boas-vindas.html')));
t('a página de boas-vindas é empacotada e aparece nos Ajustes', /ajBoasVindas/.test(ler('extension/panel.html')) && /boas-vindas\.html/.test(ler('extension/panel.js')));
console.log(`\n${ok} ok, ${ruim} falharam`);
process.exit(ruim ? 1 : 0);
