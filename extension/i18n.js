// Idioma da interface. Português quando o navegador está em português; inglês nos demais.
// O texto-fonte de tudo é o português: trad('texto em português') devolve o inglês se houver no dicionário (i18n-en.js),
// senão o próprio português. {0}, {1} ou {nome} no texto são trocados pelos valores de `vars`.
(function (g) {
  let lingua = 'pt';
  try {
    lingua = String(g.__IDIOMA || (g.chrome && g.chrome.i18n && g.chrome.i18n.getUILanguage && g.chrome.i18n.getUILanguage()) || (g.navigator && g.navigator.language) || 'pt');
  } catch (e) {}
  const en = !/^pt\b/i.test(lingua);
  const D = g.MB_EN || {};
  const trad = (pt, vars) => {
    let s = en && Object.prototype.hasOwnProperty.call(D, pt) ? D[pt] : pt;
    if (vars != null) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
    return s;
  };
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
  // Traduz o HTML estático de uma página (textos e atributos), uma vez, ao carregar.
  const aplicar = (raiz) => {
    if (!en || !g.document) return;
    const doc = g.document;
    const r = raiz || doc.documentElement;
    const nos = doc.createTreeWalker(r, 4 /* NodeFilter.SHOW_TEXT */);
    const textos = [];
    for (let n = nos.nextNode(); n; n = nos.nextNode()) {
      const p = n.parentNode && n.parentNode.nodeName;
      if (p === 'SCRIPT' || p === 'STYLE') continue;
      textos.push(n);
    }
    for (const n of textos) {
      const k = norm(n.nodeValue);
      if (k && Object.prototype.hasOwnProperty.call(D, k)) n.nodeValue = n.nodeValue.replace(/\S[\s\S]*\S|\S/, D[k]);
    }
    for (const el of r.querySelectorAll('*')) {
      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (v && Object.prototype.hasOwnProperty.call(D, norm(v))) el.setAttribute(a, D[norm(v)]);
      }
    }
    if (doc.title && Object.prototype.hasOwnProperty.call(D, norm(doc.title))) doc.title = D[norm(doc.title)];
    doc.documentElement.lang = 'en';
  };
  g.trad = trad;
  g.MB_IDIOMA = { en, loc: en ? 'en-US' : 'pt-BR', trad, aplicar };
  if (g.document && g.document.readyState === 'loading') g.document.addEventListener('DOMContentLoaded', () => aplicar());
  else if (g.document) aplicar();
})(globalThis);
