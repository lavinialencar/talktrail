// Editor markdown ao vivo (CodeMirror 6) dos campos Notas e Cola.
// O texto continua sendo markdown puro; a "mágica" é só visual: título grande, negrito,
// lista com bolinha, tarefa com caixa clicável. Na linha onde está o cursor, a marcação aparece
// crua pra editar (mesma ideia do modo "live preview" do Obsidian).
import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView, ViewPlugin, Decoration, WidgetType, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentMore, indentLess } from '@codemirror/commands';
import { markdown, markdownLanguage, markdownKeymap } from '@codemirror/lang-markdown';
import { syntaxTree, indentUnit } from '@codemirror/language';

class Caixa extends WidgetType {
  constructor(feito) {
    super();
    this.feito = feito;
  }
  eq(o) {
    return o.feito === this.feito;
  }
  toDOM(view) {
    const el = document.createElement('span');
    el.className = 'mb-caixa' + (this.feito ? ' on' : '');
    el.setAttribute('role', 'checkbox');
    el.setAttribute('aria-checked', String(this.feito));
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const pos = view.posAtDOM(el);
      view.dispatch({ changes: { from: pos + 1, to: pos + 2, insert: this.feito ? ' ' : 'x' } });
    });
    return el;
  }
  ignoreEvent() {
    return false;
  }
}

class Bolinha extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const el = document.createElement('span');
    el.className = 'mb-bolinha';
    el.textContent = '•';
    return el;
  }
}

const esconde = Decoration.replace({});
const reHora = /\[\d{1,2}:\d{2}\]/g;

function construir(view) {
  const doc = view.state.doc;
  const ativas = new Set();
  for (const r of view.state.selection.ranges) {
    for (let n = doc.lineAt(r.from).number; n <= doc.lineAt(r.to).number; n++) ativas.add(n);
  }
  const ativa = (pos) => ativas.has(doc.lineAt(pos).number) && view.hasFocus;
  const d = [];
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (n) => {
        const nome = n.name;
        const h = /^ATXHeading([1-6])$/.exec(nome);
        if (h) d.push(Decoration.line({ class: 'mb-h mb-h' + Math.min(+h[1], 3) }).range(doc.lineAt(n.from).from));
        else if (nome === 'HeaderMark') {
          if (!ativa(n.from)) d.push(esconde.range(n.from, Math.min(n.to + 1, doc.lineAt(n.from).to)));
        } else if (nome === 'StrongEmphasis') d.push(Decoration.mark({ class: 'mb-b' }).range(n.from, n.to));
        else if (nome === 'Emphasis') d.push(Decoration.mark({ class: 'mb-i' }).range(n.from, n.to));
        else if (nome === 'Strikethrough') d.push(Decoration.mark({ class: 'mb-s' }).range(n.from, n.to));
        else if (nome === 'InlineCode') d.push(Decoration.mark({ class: 'mb-code' }).range(n.from, n.to));
        else if (nome === 'EmphasisMark' || nome === 'CodeMark' || nome === 'StrikethroughMark') {
          if (!ativa(n.from)) d.push(esconde.range(n.from, n.to));
        } else if (nome === 'ListMark') {
          const item = n.node.parent;
          const lista = item && item.parent;
          const tarefa = item && item.getChild('Task');
          const linha = doc.lineAt(n.from);
          if (doc.sliceString(n.to, n.to + 1) !== ' ') return; // "-" sem espaço ainda não é lista
          if (tarefa) {
            d.push(esconde.range(n.from, Math.min(n.to + 1, linha.to)));
            const feito = doc.sliceString(tarefa.from + 1, tarefa.from + 2) !== ' ';
            if (feito) d.push(Decoration.line({ class: 'mb-feito' }).range(linha.from));
          } else if (lista && lista.name === 'BulletList') {
            d.push(Decoration.replace({ widget: new Bolinha() }).range(n.from, n.to));
          }
        } else if (nome === 'TaskMarker') {
          if (doc.sliceString(n.to, n.to + 1) !== ' ') return; // a caixa só aparece depois do espaço
          const feito = doc.sliceString(n.from + 1, n.from + 2) !== ' ';
          d.push(Decoration.replace({ widget: new Caixa(feito) }).range(n.from, n.to));
        } else if (nome === 'QuoteMark') {
          if (!ativa(n.from)) d.push(esconde.range(n.from, Math.min(n.to + 1, doc.lineAt(n.from).to)));
          d.push(Decoration.line({ class: 'mb-cita' }).range(doc.lineAt(n.from).from));
        }
      },
    });
    for (let p = from; p <= to; ) {
      const l = doc.lineAt(p);
      for (const m of l.text.matchAll(reHora)) d.push(Decoration.mark({ class: 'mb-hora' }).range(l.from + m.index, l.from + m.index + m[0].length));
      p = l.to + 1;
    }
  }
  return Decoration.set(d, true);
}

const aoVivo = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decos = construir(view);
    }
    update(u) {
      if (u.docChanged || u.selectionSet || u.viewportChanged || u.focusChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
        this.decos = construir(u.view);
      }
    }
  },
  { decorations: (v) => v.decos, provide: (p) => [EditorView.atomicRanges.of((v) => v.plugin(p).decos)] }
);

// negrito/itálico: com seleção envolve (ou tira, se já estava); sem seleção abre o par e deixa o cursor no meio
function envolver(view, marca) {
  const n = marca.length;
  view.dispatch(
    view.state.changeByRange((r) => {
      const doc = view.state.doc;
      if (r.empty) {
        return { changes: { from: r.from, insert: marca + marca }, range: EditorSelection.cursor(r.from + n) };
      }
      const antes = doc.sliceString(Math.max(0, r.from - n), r.from);
      const depois = doc.sliceString(r.to, r.to + n);
      // "*" sozinho não vale se na verdade é metade de um "**"
      const mesmo = (pos) => (n === 1 ? doc.sliceString(pos, pos + 1) === '*' : false);
      const jaTem = antes === marca && depois === marca && !(n === 1 && (mesmo(r.from - 2) || mesmo(r.to + 1)));
      if (jaTem) {
        return {
          changes: [{ from: r.from - n, to: r.from }, { from: r.to, to: r.to + n }],
          range: EditorSelection.range(r.from - n, r.to - n),
        };
      }
      return {
        changes: [{ from: r.from, insert: marca }, { from: r.to, insert: marca }],
        range: EditorSelection.range(r.from + n, r.to + n),
      };
    })
  );
  view.focus();
  return true;
}

// Depois de recuar ou voltar um item numerado, a numeração de cada nível recomeça certinha:
// o "3." que entra dentro do "2." vira "1." e, ao voltar, retoma o "3.".
function renumerar(view) {
  const doc = view.state.doc;
  const pilha = [];
  const changes = [];
  for (let i = 1; i <= doc.lines; i++) {
    const l = doc.line(i);
    if (!l.text.trim()) continue;
    const ind = l.text.length - l.text.trimStart().length;
    while (pilha.length && pilha[pilha.length - 1].ind > ind) pilha.pop();
    const m = /^(\s*)(\d+)([.)])\s/.exec(l.text);
    if (!m) {
      if (ind === 0) pilha.length = 0; // texto solto na margem encerra a lista
      continue;
    }
    let topo = pilha[pilha.length - 1];
    if (topo && topo.ind === ind) topo.n += 1;
    else pilha.push((topo = { ind, n: ind === 0 ? Number(m[2]) : 1 }));
    if (String(topo.n) !== m[2]) {
      const ini = l.from + m[1].length;
      changes.push({ from: ini, to: ini + m[2].length, insert: String(topo.n) });
    }
  }
  if (changes.length) view.dispatch({ changes });
}
const recuarItem = (v) => {
  const r = indentMore(v);
  if (r) renumerar(v);
  return r;
};
const voltarItem = (v) => {
  const r = indentLess(v);
  if (r) renumerar(v);
  return r;
};

// "[] " ou "[ ] " no começo da linha vira tarefa, sem precisar do traço
const virarTarefa = EditorView.inputHandler.of((view, from, to, texto) => {
  if (texto !== ' ' || from !== to) return false;
  const l = view.state.doc.lineAt(from);
  const antes = view.state.doc.sliceString(l.from, from);
  const m = /^(\s*)\[([ xX]?)\]$/.exec(antes);
  if (!m) return false;
  const novo = `${m[1]}- [${m[2] || ' '}] `;
  view.dispatch({ changes: { from: l.from, to: from, insert: novo }, selection: { anchor: l.from + novo.length } });
  return true;
});

// liga/desliga o prefixo (título, lista, tarefa) nas linhas selecionadas, mantendo o recuo
const reMarca = /^(\s*)(- \[[ xX]\] |[-*+] |\d+[.)] |#{1,6} |> )?/;
function alternar(view, prefixo) {
  const { state } = view;
  const linhas = new Set();
  for (const r of state.selection.ranges) {
    for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) linhas.add(n);
  }
  const changes = [];
  for (const n of linhas) {
    const l = state.doc.line(n);
    const m = reMarca.exec(l.text);
    const ini = l.from + m[1].length;
    const atual = m[2] || '';
    changes.push({ from: ini, to: ini + atual.length, insert: atual === prefixo ? '' : prefixo });
  }
  // o cursor fica DEPOIS do prefixo novo (senão o texto digitado cai antes do traço)
  const cs = state.changes(changes);
  view.dispatch({ changes: cs, selection: state.selection.map(cs, 1) });
  view.focus();
  return true;
}

const ico = (corpo) =>
  `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${corpo}</svg>`;
const BOTOES = [
  ['<b>T</b>', 'Título', (v) => alternar(v, '## ')],
  ['<b>B</b>', 'Negrito (Cmd+B)', (v) => envolver(v, '**')],
  ['<i>I</i>', 'Itálico (Cmd+I)', (v) => envolver(v, '*')],
  ['|'],
  [ico('<circle cx="3" cy="4" r=".9" fill="currentColor"/><circle cx="3" cy="8" r=".9" fill="currentColor"/><circle cx="3" cy="12" r=".9" fill="currentColor"/><path d="M7 4h7M7 8h7M7 12h7"/>'), 'Lista com marcadores', (v) => alternar(v, '- ')],
  [ico('<path d="M7 4h7M7 8h7M7 12h7"/><text x="1" y="5.6" font-size="5.2" fill="currentColor" stroke="none" font-family="sans-serif">1</text><text x="1" y="9.6" font-size="5.2" fill="currentColor" stroke="none" font-family="sans-serif">2</text><text x="1" y="13.6" font-size="5.2" fill="currentColor" stroke="none" font-family="sans-serif">3</text>'), 'Lista numerada', (v) => alternar(v, '1. ')],
  [ico('<rect x="2.5" y="2.5" width="11" height="11" rx="2.5"/><path d="m5.5 8.2 1.7 1.7 3.3-3.6"/>'), 'Tarefa, caixa de marcar', (v) => alternar(v, '- [ ] ')],
  ['|'],
  [ico('<path d="M2 3h12M7 8h7M2 13h12"/><path d="m2 6.5 2.4 1.5L2 9.5z" fill="currentColor"/>'), 'Dentro do item de cima (Tab)', recuarItem],
  [ico('<path d="M2 3h12M7 8h7M2 13h12"/><path d="M5 6.5 2.6 8 5 9.5z" fill="currentColor"/>'), 'Voltar um nível (Shift+Tab)', voltarItem],
];

export function create(host, opts = {}) {
  let aplicando = false;
  host.classList.add('mb-editor');
  const barra = document.createElement('div');
  barra.className = 'mb-barra';
  const parent = document.createElement('div');
  parent.className = 'mb-corpo';
  host.append(barra, parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: opts.doc || '',
      extensions: [
        history(),
        indentUnit.of('    '), // hierarquia mais clara: 4 espaços por nível
        markdown({ base: markdownLanguage, addKeymap: false }), // o keymap vem abaixo, depois do meu Enter
        keymap.of([
          {
            key: 'Mod-Enter',
            run: (v) => {
              const hora = opts.onStamp ? opts.onStamp() : null;
              if (hora == null) return true;
              const pos = v.state.selection.main.head;
              const meio = pos > v.state.doc.lineAt(pos).from;
              const txt = (meio ? '\n' : '') + hora;
              v.dispatch({ changes: { from: pos, insert: txt }, selection: { anchor: pos + txt.length } });
              return true;
            },
          },
          { key: 'Mod-b', run: (v) => envolver(v, '**') },
          { key: 'Mod-i', run: (v) => envolver(v, '*') },
          { key: 'Tab', run: recuarItem },
          { key: 'Shift-Tab', run: voltarItem },
          {
            // Enter num item vazio: sai da lista (ou volta um nível, se estiver aninhado)
            key: 'Enter',
            run: (v) => {
              const r = v.state.selection.main;
              const l = v.state.doc.lineAt(r.head);
              if (!r.empty || r.head !== l.to) return false;
              const m = /^(\s*)((?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?|>\s*)$/.exec(l.text);
              if (!m) return false;
              if (m[1].length > 0) return indentLess(v);
              v.dispatch({ changes: { from: l.from, to: l.to, insert: '' }, selection: { anchor: l.from } });
              return true;
            },
          },
          ...markdownKeymap,
          ...historyKeymap,
          ...defaultKeymap,
        ]),
        EditorView.lineWrapping,
        cmPlaceholder(opts.placeholder || ''),
        aoVivo,
        virarTarefa,
        EditorView.contentAttributes.of({ spellcheck: 'true', autocapitalize: 'sentences' }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !aplicando && opts.onChange) opts.onChange(u.state.doc.toString());
        }),
      ],
    }),
  });
  BOTOES.forEach(([rot, dica, run]) => {
    if (rot === '|') {
      const s = document.createElement('span');
      s.className = 'mb-sep';
      barra.appendChild(s);
      return;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mb-bt';
    b.innerHTML = rot;
    b.title = dica;
    b.setAttribute('aria-label', dica);
    b.addEventListener('mousedown', (e) => e.preventDefault()); // não tira o foco do texto
    b.addEventListener('click', () => {
      run(view);
      view.focus();
    });
    barra.appendChild(b);
  });
  return {
    getValue: () => view.state.doc.toString(),
    setValue(v) {
      if (v === view.state.doc.toString()) return;
      aplicando = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } });
      aplicando = false;
    },
    hasFocus: () => view.hasFocus,
    _view: view, // só pra teste
    focus: () => view.focus(),
  };
}
