// Pré-carregado nos testes (node -r): os scripts da extensão usam trad() de i18n.js, que no navegador vem num <script> à parte.
// Aqui o módulo de idioma é colado na frente de cada script que o usa, na hora de ler o arquivo.
// Idioma dos testes: português, a menos que TT_IDIOMA diga outro (ex.: TT_IDIOMA=en-US node -r ./test/_idioma.js test/idioma.js).
const fs = require('fs');
const path = require('path');
const ext = path.join(__dirname, '..', 'extension');
const real = fs.readFileSync;
const USAM = /[\\/]extension[\\/](content|panel|pautas|biblioteca|boas-vindas|backup|background)\.js$/;
const lido = (arq) => real(path.join(ext, arq), 'utf8');
fs.readFileSync = function (p, ...resto) {
  const r = real.call(this, p, ...resto);
  if (typeof p === 'string' && USAM.test(p) && typeof r === 'string' && !r.startsWith('/*i18n*/')) {
    return `/*i18n*/globalThis.__IDIOMA=${JSON.stringify(process.env.TT_IDIOMA || 'pt-BR')};` + lido('i18n-en.js') + '\n' + lido('i18n.js') + '\n' + r;
  }
  return r;
};
