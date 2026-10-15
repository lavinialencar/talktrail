// Talktrail 0.2, script de conteúdo: lê as legendas do Meet e guarda a reunião.
// Funções puras no topo (testáveis no Node); o resto só roda dentro do Meet.

const CODIGO_SALA = /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}(\/|$)/;
const ICONE = /^[a-z]+(_[a-z]+)+$/; // ligadura de ícone do Material, ex.: format_size
const INTERFACE = /^(idioma|language|legendas?|captions?|formato|format|tamanho|font|cor|color)\b/i;

function limparLinhas(texto) {
  return String(texto)
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s && !ICONE.test(s));
}

// o Meet entrega a mesma fala em versões cumulativas ("a", "a b", "a b c"): fica só a mais longa
function colapsar(partes) {
  const out = [];
  for (const p of partes) {
    if (out.some((o) => o.startsWith(p))) continue;
    const j = out.findIndex((o) => p.startsWith(o));
    if (j !== -1) out[j] = p;
    else out.push(p);
  }
  return out.join(' ');
}

function lerBloco(texto) {
  const l = limparLinhas(texto);
  if (l.length < 2) return null;
  let speaker = l[0];
  if (speaker.length > 60 || INTERFACE.test(speaker)) return null;
  if (/^(você|voce|you)$/i.test(speaker)) speaker = 'Eu';
  return { speaker, text: colapsar(l.slice(1)) };
}

// junta a fala nova com a anterior do mesmo falante; null = é outra fala
function fundir(prev, nova) {
  if (nova.startsWith(prev)) return nova;
  if (prev.startsWith(nova)) return prev;
  if (nova.length >= 12 && prev.includes(nova)) return prev;
  // o Meet corrigiu a fala e acrescentou umas palavras antes ou depois: é a mesma fala ("Ai como eu sou?" -> "dias Ai como eu sou?")
  if (prev.length >= 12 && nova.length <= prev.length + 30 && nova.includes(prev)) return nova;
  const cab = prev.slice(0, 40);
  if (cab.length >= 20 && nova.includes(cab)) return nova.length >= prev.length ? nova : prev;
  // o bloco rolou: o começo da fala nova repete o fim da anterior
  for (let k = Math.min(prev.length, nova.length); k >= 15; k--) {
    if (prev.endsWith(nova.slice(0, k))) return prev + nova.slice(k);
  }
  return null;
}

function fecharLinha(linhas, v) {
  const u = linhas[linhas.length - 1];
  if (u && u.speaker === v.speaker) {
    const m = fundir(u.text, v.text);
    if (m !== null) {
      u.text = m;
      return;
    }
  }
  linhas.push({ t: v.t, speaker: v.speaker, text: v.text });
}

// Repetição colada dentro da mesma fala, sem ponto no meio: o Meet reenviou o trecho e ele grudou logo depois do original
// ("...bora ver se Tá apareceu o aviso..." duas vezes seguidas). Trecho de 12 palavras iguais que recomeça colado no fim do original sai.
function tiraRepeticaoInterna(texto) {
  const pal = String(texto || '').split(/\s+/).filter(Boolean);
  const nrm = (w) => w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const K = 12;
  for (let volta = 0; volta < 8; volta++) {
    const nw = pal.map(nrm);
    if (nw.length < K * 2) break;
    const vistos = new Map();
    let achou = false;
    for (let j = 0; j + K <= nw.length && !achou; j++) {
      const chave = nw.slice(j, j + K).join(' ');
      if (vistos.has(chave)) {
        const ant = vistos.get(chave);
        let L = K;
        while (j + L < nw.length && ant + L < j && nw[ant + L] === nw[j + L]) L++;
        // só é cópia colada se começa logo depois do original (até 12 palavras de sobra entre o fim do trecho igual e o começo da cópia); mais longe é a pessoa repetindo
        if (j - (ant + L) <= 12) {
          pal.splice(j, L);
          achou = true;
        }
      }
      if (!achou) vistos.set(chave, j);
    }
    if (!achou) break;
  }
  return pal.join(' ');
}

// Tira frases repetidas dentro de uma mesma fala: igual, ou quase (80% das palavras em comum).
// Frase curta (menos de 4 palavras) nunca é cortada, pra não perder "sim, sim, sim" de verdade.
function limparRepeticoes(texto) {
  const norm = (s) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const todas = String(texto || '').split(/(?<=[.!?…])\s+/);
  // 1) Replay: o Meet às vezes reenvia um trecho inteiro lá de trás (visto num monólogo de 22 min: ~100 frases repetidas,
  //    fora da janela de 80 frases abaixo). Um replay repete uma SEQUÊNCIA de frases na mesma ordem; 3 frases seguidas que
  //    repetem 3 seguidas de antes saem. Uma frase igual isolada, mesmo longe, fica (gente repete frase de verdade).
  const chaves = todas.map((p) => norm(p));
  const ultima = new Map();
  const rep = todas.map(() => -1);
  chaves.forEach((k, i) => {
    if (k.split(' ').length >= 4) {
      if (ultima.has(k)) rep[i] = ultima.get(k);
      ultima.set(k, i);
    }
  });
  const sai = new Set();
  for (let i = 0; i < rep.length; ) {
    let j = i;
    while (j + 1 < rep.length && rep[j] >= 0 && rep[j + 1] === rep[j] + 1) j++;
    if (rep[i] >= 0 && j - i + 1 >= 3) for (let k = i; k <= j; k++) sai.add(k);
    i = j + 1;
  }
  const vistas = [];
  const fica = [];
  for (const [idx, p] of todas.entries()) {
    if (sai.has(idx)) continue;
    const pal = norm(p).split(' ').filter(Boolean);
    if (pal.length >= 4) {
      const s = new Set(pal);
      // a repetição vem do trecho recente reenviado pelo Meet: compara só com as últimas 80 frases (custo linear)
      const igual = vistas.slice(-80).some((v) => {
        let comum = 0;
        for (const w of s) if (v.has(w)) comum++;
        return comum / (s.size + v.size - comum) >= 0.8;
      });
      if (igual) continue;
      vistas.push(s);
    }
    fica.push(p);
  }
  return tiraRepeticaoInterna(fica.join(' '));
}

function tituloPadrao(docTitle) {
  let t = String(docTitle || '')
    .replace(/^Meet\s*[-–—:]\s*/i, '')
    .replace(/\s*[-–—]\s*(Google )?Meet$/i, '')
    .trim();
  t = t.replace(/[\u0000-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!t || /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(t) || /^(google\s+)?meet$/i.test(t)) {
    // reunião sem nome: o código da sala não diz nada, usa a data e a hora
    const d = new Date();
    const dois = (n) => String(n).padStart(2, '0');
    t = `Reunião de ${dois(d.getDate())}/${dois(d.getMonth() + 1)} às ${dois(d.getHours())}h${dois(d.getMinutes())}`;
  }
  return t;
}

// Palavra bloqueada por ela (RH, demissão...) que aparece no nome da reunião: devolve a palavra ou ''
function palavraBloqueada(titulo, lista) {
  const sem = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const t = sem(titulo);
  return (lista || []).find((p) => sem(p).trim().length >= 2 && t.includes(sem(p).trim())) || '';
}

// tags que a pessoa já criou e que aparecem no título da reunião (a automação: o nome da reunião diz as tags)
function inferirTags(titulo, lista) {
  const sem = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const t = sem(titulo);
  return (lista || []).filter((p) => sem(p).length >= 3 && t.includes(sem(p)));
}

if (typeof module !== 'undefined') {
  module.exports = { limparLinhas, colapsar, lerBloco, fundir, fecharLinha, tituloPadrao, inferirTags, palavraBloqueada, limparRepeticoes, CODIGO_SALA };
}

const TEXTO_CHAT = 'Estou transcrevendo esta reunião (só o texto, sem gravar áudio nem vídeo) no meu computador, com o Talktrail. Nada vai pra nuvem.';
// um texto salvo que é uma versão antiga do padrão (começa igual, mas não tem o nome atual) migra pro padrão novo
const ehTextoPadraoAntigo = (t) => /^Estou (gravando e )?transcrevendo esta reunião/.test(String(t || '')) && !String(t).includes('Talktrail');

function iniciar() {
  // Quando a extensão é atualizada com a aba do Meet aberta, este script fica "órfão": o Chrome corta a ligação com ela.
  // Em vez de falhar calado, as mensagens viram respostas de erro e a pessoa recebe um aviso pedindo pra recarregar a aba.
  function extensaoViva() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }
  function enviar(m) {
    try {
      return Promise.resolve(chrome.runtime.sendMessage(m)).catch((e) => ({ ok: false, error: String(e) }));
    } catch (e) {
      return Promise.resolve({ ok: false, error: String(e) });
    }
  }
  let orfa = false;
  let orfaDispensada = false;

  const S = {
    fase: 'oculto', // oculto | oferta | gravando | parado
    id: null,
    inicio: null,
    titulo: '',
    projeto: '', // a primeira tag; é a chave da Cola
    tags: [],
    notes: '',
    cola: '',
    linhas: [],
    marcas: [],
    esconderLegendas: false,
    tagsSalvas: [],
    ajustes: { oferta: 'perguntar', avisoChat: 'nunca', salvarChat: false, textoChat: TEXTO_CHAT, palavras: [], botaoFlutuante: true, fabAbrePainel: true, painelNaTelaCheia: true, pastaOferecida: false },
    avisoChat: '', // '', 'enviado' ou 'falhou'
    info: '',
    infoAte: 0,
    modoSalvar: '', // 'pasta', 'extensao' ou 'downloads'
    erroFixo: '', // aviso que um salvamento bem-sucedido não pode apagar (ex.: pessoa bloqueada entrou)
    ultimaFalaEm: 0,
    chat: [], // mensagens do chat do Meet vistas durante a reunião
    salvoEm: null,
    erro: null,
    dispensado: false,
    pausadaEm: 0, // quando parou de transcrever sem sair da chamada (a reunião fica guardada pra seguir no mesmo arquivo)
    fimEm: 0,
    podeDesfazer: false,
    inicioAte: 0,
  };
  const vivos = new Map(); // elemento do bloco -> { speaker, text, t, ultima }
  const feitos = new WeakMap(); // elemento -> último texto já fechado
  let ultimaAssinatura = '';
  let timerVarrer = null;
  let timerSalvar = null;
  let semChamadaDesde = 0;
  let regiaoVistaEm = Date.now();
  let timerOferta = null;

  const juntarAjustes = (a) => {
    if (a && typeof a === 'object') {
      Object.assign(S.ajustes, a, { palavras: Array.isArray(a.palavras) ? a.palavras : [] });
      if (a.avisoChat === true) S.ajustes.avisoChat = 'sempre'; // valor antigo (ligado/desligado)
      if (ehTextoPadraoAntigo(S.ajustes.textoChat)) S.ajustes.textoChat = TEXTO_CHAT; // quem nunca mudou o texto ganha o novo
      if (!['nunca', 'sempre', 'perguntar'].includes(S.ajustes.avisoChat)) S.ajustes.avisoChat = 'nunca';
    }
  };
  chrome.storage.local.get(['ocultarLegendas', 'tagsSalvas', 'ajustes']).then((v) => {
    if (v && typeof v.ocultarLegendas === 'boolean') S.esconderLegendas = v.ocultarLegendas;
    if (v && Array.isArray(v.tagsSalvas)) S.tagsSalvas = v.tagsSalvas;
    juntarAjustes(v && v.ajustes);
  });
  chrome.storage.onChanged.addListener((c) => {
    if (c.tagsSalvas && Array.isArray(c.tagsSalvas.newValue)) S.tagsSalvas = c.tagsSalvas.newValue;
    if (c.ajustes) juntarAjustes(c.ajustes.newValue);
  });

  // tags novas vindas do título ou do painel; a primeira vira o "projeto" (chave da Cola)
  function ajustarTags(lista) {
    S.tags = [...new Set(lista.map((x) => String(x).replace(/^[\s,;.#]+|[\s,;]+$/g, '')).filter(Boolean))].slice(0, 12);
    const novo = S.tags[0] || '';
    if (novo === S.projeto) return;
    S.projeto = novo;
    chrome.storage.local.get(['cola:' + (novo || '_')]).then((v) => {
      const c = v && v['cola:' + (novo || '_')];
      if (c && !S.cola) {
        S.cola = c;
        push();
      }
    });
  }

  // ---------- Pauta por reunião ----------
  // id = "AAAA-MM-DD|título normalizado". A agenda da tela inicial do Meet dá título e horário (o código da sala só
  // aparece depois do clique), e a aba da sala se chama "Meet: <título>", então título + dia casa a pauta com a sala.
  const normTitulo = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const dia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const codigoDaSala = () => { const m = location.pathname.match(/^\/([a-z]{3}-[a-z]{4}-[a-z]{3})(\/|$)/); return m ? m[1] : ''; };
  const tituloDoMeet = () => {
    const t = String(document.title || '').replace(/^Meet\s*[:\-–]\s*/i, '').replace(/\s*[-–]\s*Google Meet$/i, '').trim();
    return /^(meet|google meet|reuni[ãa]o)?$/i.test(t) || /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(t) ? '' : t;
  };
  const idPauta = (titulo, data) => (normTitulo(titulo) ? `${data || dia(new Date())}|${normTitulo(titulo)}` : '');
  let pautaId = '';
  let chavePauta = '';

  async function lerPautas() {
    const v = await chrome.storage.local.get(['pautas']);
    return (v && v.pautas) || {};
  }

  // entrou na sala (ou o título do Meet carregou): acha a pauta desta reunião e traz pro painel
  async function ligarPautaDaSala() {
    const cod = codigoDaSala();
    if (!cod) { pautaId = ''; return; }
    const titulo = tituloDoMeet();
    const todas = await lerPautas();
    let id = idPauta(titulo || cod);
    if (!todas[id]) {
      const porCodigo = Object.keys(todas).filter((k) => todas[k].codigo === cod).sort((a, b) => (todas[b].atualizada || 0) - (todas[a].atualizada || 0))[0];
      if (porCodigo) id = porCodigo;
    }
    pautaId = id;
    const e = todas[id];
    if (e) {
      if (!S.cola && e.texto) S.cola = e.texto;
      if (!S.titulo && e.titulo) S.titulo = e.titulo;
      if (e.codigo !== cod) {
        e.codigo = cod;
        chrome.storage.local.set({ pautas: todas });
      }
      push();
    }
  }

  async function guardarPauta(texto) {
    const cod = codigoDaSala();
    const id = pautaId || idPauta(tituloDoMeet() || cod);
    if (!id) return;
    const todas = await lerPautas();
    if (!todas[id] && !texto) return;
    const e = todas[id] || { titulo: tituloDoMeet() || S.titulo || cod, data: id.split('|')[0], hora: '', codigo: cod, criada: Date.now() };
    e.texto = texto;
    e.atualizada = Date.now();
    if (cod) e.codigo = cod;
    todas[id] = e;
    pautaId = id;
    await chrome.storage.local.set({ pautas: todas });
  }

  // tela inicial do Meet: lê as reuniões do dia que está aberto (título e hora) e guarda pro painel listar
  const RE_HORA = /(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/;
  let ultimaAgenda = '';
  let inicioHome = 0;
  let avisouVazio = false;
  async function lerAgendaDaHome() {
    const m = location.pathname.match(/^\/home(?:\/(\d{4})\/(\d{2})\/(\d{2}))?\/?$/);
    if (!m) { inicioHome = 0; avisouVazio = false; return; }
    if (!inicioHome) inicioHome = Date.now();
    const data = m[1] ? `${m[1]}-${m[2]}-${m[3]}` : dia(new Date());
    const achados = [];
    // cada reunião é um <li> com o horário e o título em texto (sem botão nem aria-label), em qualquer das contas do Meet
    document.querySelectorAll('li').forEach((li) => {
      const txt = (li.innerText || li.textContent || '').trim();
      const h = txt.match(RE_HORA);
      if (!h || txt.length > 400) return;
      const partes = txt.replace(RE_HORA, '\n').split('\n').map((x) => x.trim()).filter((x) => x && !/^[a-z_]+$/.test(x)); // sem nome de ícone
      const t = partes[0];
      if (t && t.length < 200 && !achados.some((x) => x.titulo === t && x.hora === h[1])) achados.push({ titulo: t, data, hora: h[1] });
    });
    if (!achados.length) {
      // dia sem reunião (ou página ainda carregando): depois de uns segundos conta como lido, sem apagar o que já se sabe
      if (!avisouVazio && Date.now() - inicioHome > 6000) {
        avisouVazio = true;
        chrome.storage.local.set({ agendaLidaEm: Date.now() });
        enviar({ type: 'agenda-lida' });
      }
      return;
    }
    const chave = data + JSON.stringify(achados);
    if (chave === ultimaAgenda) return;
    ultimaAgenda = chave;
    const v = await chrome.storage.local.get(['agendaMeet']);
    const hoje = dia(new Date());
    // une com o que já se sabia (outra conta do Meet pode ter lido o mesmo dia); só some o que já passou de dia
    const chaveDe = (x) => `${x.data}|${normTitulo(x.titulo)}|${x.hora}`;
    const mapa = new Map();
    for (const x of Array.isArray(v && v.agendaMeet) ? v.agendaMeet : []) if (x && x.data >= hoje) mapa.set(chaveDe(x), x);
    for (const x of achados) mapa.set(chaveDe(x), x);
    await chrome.storage.local.set({ agendaMeet: [...mapa.values()].slice(-150), agendaLidaEm: Date.now() });
    enviar({ type: 'agenda-lida' });
  }

  setInterval(() => {
    const chave = codigoDaSala() + '|' + tituloDoMeet();
    if (chave !== chavePauta) {
      chavePauta = chave;
      ligarPautaDaSala().catch(() => {});
    }
    lerAgendaDaHome().catch(() => {});
  }, 1500);

  const seg = () => (S.inicio ? (Date.now() - S.inicio) / 1000 : 0);

  function linhasAoVivo() {
    const copia = S.linhas.map((l) => ({ ...l }));
    for (const v of vivos.values()) fecharLinha(copia, v);
    return copia.map((l) => ({ ...l, text: limparRepeticoes(l.text) }));
  }

  function legendasOk() {
    if (Date.now() < regiaoVistaEm) return true; // acabou de começar, ainda ligando
    const l = legendasLigadas();
    return l !== null ? l : Date.now() - regiaoVistaEm < 8000;
  }
  // por que as legendas não estão valendo: desligadas por mim, travadas ou sumidas (organizador), ou a tela mudou
  function motivoLegendas() {
    const e = estadoLegendas();
    if (e.botao && !e.desabilitado) return 'desligadas';
    return e.botao ? 'organizador' : 'sem-botao';
  }

  function snap() {
    return {
      fase: S.fase,
      id: S.id,
      titulo: S.titulo,
      projeto: S.projeto,
      tags: S.tags,
      notes: S.notes,
      cola: S.cola,
      linhas: linhasAoVivo().slice(-300),
      marcas: S.marcas,
      segundos: Math.floor(seg()),
      salvoEm: S.salvoEm,
      erro: S.erro,
      avisoChat: S.avisoChat,
      legendas: legendasOk(),
      legendasMotivo: legendasOk() ? '' : motivoLegendas(),
      info: S.infoAte > Date.now() ? S.info : '',
      modoSalvar: S.modoSalvar,
      esconderLegendas: S.esconderLegendas,
      pautaId,
      sala: codigoDaSala(),
    };
  }

  let pushPendente = false;
  function push() {
    if (pushPendente) return;
    pushPendente = true;
    setTimeout(() => {
      pushPendente = false;
      enviar({ type: 'state', state: snap() });
    }, 350);
  }

  // ---------- legendas ----------
  function achaRegiao() {
    return document.querySelector('[role="region"][aria-label*="egenda" i], [role="region"][aria-label*="aption" i]');
  }

  function rotulo(el) {
    return el.getAttribute('aria-label') || el.getAttribute('data-tooltip') || '';
  }

  // Estado das legendas pelo botão CC: ligadas (true/false/null), se há botão e se ele está travado.
  // Botão ausente ou travado costuma ser o organizador ter desativado as legendas da reunião.
  function estadoLegendas() {
    let achou = false;
    let travado = false;
    for (const b of document.querySelectorAll('button, [role="button"]')) {
      const l = rotulo(b);
      if (!/legenda|caption/i.test(l)) continue;
      achou = true;
      const off = !!b.disabled || b.getAttribute('aria-disabled') === 'true';
      if (off) travado = true;
      if (/^\s*(desativar|desligar|turn off|hide)/i.test(l)) return { ligadas: true, botao: true, desabilitado: off };
      if (/^\s*(ativar|ligar|turn on|show)/i.test(l)) return { ligadas: false, botao: true, desabilitado: off };
      const ap = b.getAttribute('aria-pressed'); // plano B: botão com estado marcado
      if (ap === 'true') return { ligadas: true, botao: true, desabilitado: off };
      if (ap === 'false') return { ligadas: false, botao: true, desabilitado: off };
    }
    return { ligadas: null, botao: achou, desabilitado: travado };
  }
  const legendasLigadas = () => estadoLegendas().ligadas;

  function ligarLegendas(forcarTecla = false) {
    const estado = legendasLigadas();
    if (estado === true || (estado === null && achaRegiao())) return true;
    const cand = [...document.querySelectorAll('button, [role="button"]')];
    // "Ativar legendas", nunca "Desativar legendas" (já estão ligadas)
    const ligar = /(?<![a-zà-ú])(ativar|ligar|turn on|show)\b.{0,25}(legenda|caption)/i;
    const alvo = cand.find((b) => ligar.test(rotulo(b)));
    if (alvo) {
      alvo.click();
      return true;
    }
    if (forcarTecla) {
      for (const tipo of ['keydown', 'keyup']) {
        document.dispatchEvent(new KeyboardEvent(tipo, { key: 'c', code: 'KeyC', keyCode: 67, bubbles: true }));
      }
    }
    return false;
  }

  // esconde a faixa de legendas do Meet (continua no DOM, só fica invisível)
  const estiloLegendas = document.createElement('style');
  estiloLegendas.textContent =
    '[role="region"][aria-label*="egenda" i],[role="region"][aria-label*="aption" i]{opacity:0!important;pointer-events:none!important}';
  function aplicarEstiloLegendas() {
    const quer = S.fase === 'gravando' && S.esconderLegendas;
    if (quer && !estiloLegendas.isConnected) document.documentElement.appendChild(estiloLegendas);
    if (!quer && estiloLegendas.isConnected) estiloLegendas.remove();
  }

  function blocos(regiao) {
    let el = regiao;
    while (el.children.length === 1) el = el.children[0];
    return [...el.children];
  }

  function varrer() {
    const r = achaRegiao();
    const agora = Date.now();
    if (r) regiaoVistaEm = agora;
    const presentes = new Set();
    if (r) {
      for (const b of blocos(r)) {
        const d = lerBloco(b.innerText || b.textContent || '');
        if (!d) continue;
        presentes.add(b);
        if (feitos.get(b) === d.text) continue;
        const v = vivos.get(b);
        if (!v) {
          vivos.set(b, { ...d, t: seg(), ultima: agora });
          S.ultimaFalaEm = agora;
        } else if (v.text !== d.text || v.speaker !== d.speaker) {
          Object.assign(v, d, { ultima: agora });
          S.ultimaFalaEm = agora;
        }
      }
    }
    for (const [b, v] of vivos) {
      if (!presentes.has(b) || agora - v.ultima > 3000) {
        fecharLinha(S.linhas, v);
        feitos.set(b, v.text);
        vivos.delete(b);
      }
    }
    push();
  }

  function fecharTudo() {
    for (const [b, v] of vivos) {
      fecharLinha(S.linhas, v);
      feitos.set(b, v.text);
    }
    vivos.clear();
  }

  // ---------- salvar ----------
  async function salvar(final = false) {
    if (!S.id) return;
    const payload = {
      id: S.id,
      startedAt: new Date(S.inicio).toISOString(),
      endedAt: final ? new Date(S.fimEm || Date.now()).toISOString() : undefined,
      titulo: S.titulo,
      projeto: S.projeto,
      tags: S.tags,
      url: location.origin + location.pathname,
      notes: S.notes,
      cola: S.cola,
      transcript: linhasAoVivo(),
      marcas: S.marcas,
      chat: S.chat,
      chatEstrutura: S.chatEstrutura || undefined,
    };
    const r = await enviar({ type: 'save', payload });
    if (r && r.ok) {
      S.salvoEm = Date.now();
      S.erro = S.erroFixo || null;
      S.modoSalvar = (r.data && r.data.vazia) || r.modo === 'vazia' ? 'vazia' : r.modo || '';
    } else if (r && r.status === 403 && r.data && r.data.erro) {
      S.erro = 'Esta extensão não está autorizada no servidor da pasta. A reunião continua guardada na extensão. Abra http://127.0.0.1:8787/ e clique em "Parear de novo".';
    } else if (r && r.status === 413) {
      S.erro = 'Texto grande demais pra salvar na pasta. Apague parte das Notas ou da Pauta; a transcrição continua sendo capturada e guardada na extensão.';
    } else if (r && r.status >= 400 && r.data && r.data.erro) {
      S.erro = 'Não consegui salvar na pasta (' + r.data.erro + '). A reunião continua guardada na extensão.';
    } else {
      S.erro = 'A extensão não respondeu (ela pode ter sido atualizada). Recarregue a aba do Meet.';
    }
    push();
    desenhar();
  }

  function assinatura() {
    const u = S.linhas[S.linhas.length - 1];
    return [S.linhas.length, u ? u.text.length : 0, vivos.size, S.notes.length, S.cola.length, S.titulo, S.tags.join(','), S.marcas.length, S.chat.length].join(':');
  }

  // ---------- comandos ----------
  // Experimental: lê as mensagens do chat que estão na tela (o Meet só desenha o chat com o painel aberto).
  const chatVisto = new Set();
  const chatPendente = new Map(); // id -> quando vimos a mensagem ainda sendo enviada (é da própria pessoa)
  // "Ana 08:13" -> "Ana"; "Você" -> "Eu" (igual ao das legendas)
  function nomeDoCabecalho(texto) {
    const n = String(texto || '').replace(/\s+/g, ' ').trim().replace(/\s*\d{1,2}:\d{2}(\s?[AaPp][Mm])?$/, '').trim();
    if (/^(você|voce|you)$/i.test(n)) return 'Eu';
    return n && n.length <= 60 ? n : '';
  }

  // No chat do Meet o nome fica num cabeçalho curto que é irmão anterior do bloco da mensagem (ou de um ancestral dele).
  // Visto na estrutura real (versão 1.5): `div > [cabeçalho, div > div[data-message-id]]`. Sem depender dos nomes de classe.
  function remetente(no) {
    const direto = no.closest('[data-sender-name]');
    if (direto) return direto.getAttribute('data-sender-name') || '';
    let a = no;
    for (let i = 0; a && i < 4 && a !== document.body && a !== document.documentElement; i++, a = a.parentElement) {
      const irmao = a.previousElementSibling;
      if (!irmao || irmao.hasAttribute('data-message-id') || irmao.querySelector('[data-message-id]')) continue;
      const marcado = irmao.getAttribute('data-sender-name') || (irmao.querySelector('[data-sender-name]') || irmao).getAttribute('data-sender-name');
      const nome = marcado ? nomeDoCabecalho(marcado) : nomeDoCabecalho(irmao.textContent);
      if (nome) return nome;
    }
    return '';
  }

  // Só a forma da tela (etiquetas, nomes de atributo, classes), nunca o texto: vai como comentário no arquivo
  // quando o nome de quem mandou não é achado, pra eu acertar a leitura na próxima rodada.
  function estruturaDoNo(no) {
    const forma = (e) => e.tagName.toLowerCase() + (e.getAttribute('role') ? `[role=${e.getAttribute('role')}]` : '') +
      (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : '') +
      '{' + [...e.attributes].map((a) => a.name).filter((n) => n !== 'class' && n !== 'style').join(',') + '}';
    // formato do texto: letras viram "a" e números "9" (mostra se é um nome, uma hora ou outra coisa, sem o conteúdo)
    const molde = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 24).replace(/\d/g, '9').replace(/[A-Za-zÀ-ÿ]/g, 'a');
    const rot = (e) => (e.getAttribute('aria-label') ? ` aria="${molde(e.getAttribute('aria-label'))}"` : '');
    const partes = [];
    let el = no;
    for (let i = 0; el && i < 5; i++, el = el.parentElement) {
      const antes = el.previousElementSibling;
      const filhos = [...el.children].slice(0, 4).map((c) => c.tagName.toLowerCase() + `:"${molde(c.textContent)}"`).join(',');
      partes.push(forma(el) + rot(el) + ` filhos[${filhos}]` + (antes ? ' <-irmao ' + forma(antes) + rot(antes) + ` "${molde(antes.textContent)}"` : ''));
    }
    return partes.join(' > ').slice(0, 1400);
  }

  function lerChat() {
    for (const no of document.querySelectorAll('[data-message-id]')) {
      const id = no.getAttribute('data-message-id');
      if (!id || chatVisto.has(id)) continue;
      // mensagem ainda sendo enviada (data-pending): é da própria pessoa, e o cabeçalho com o nome só enche depois de enviada
      if (no.hasAttribute('data-pending')) {
        if (!chatPendente.has(id)) chatPendente.set(id, Date.now());
        if (Date.now() - chatPendente.get(id) < 6000) continue;
      }
      // o nó da mensagem traz botões da própria tela ("Fixar mensagem") e o nome do ícone ("keep"): tira tudo isso
      const copia = no.cloneNode(true);
      copia.querySelectorAll('button, [role="button"], svg, [aria-hidden="true"]').forEach((x) => x.remove());
      const texto = (copia.textContent || '')
        .replace(/\s*(keep\s*)?(fixar mensagem|pin message|desafixar mensagem|unpin message)\s*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!texto) continue;
      chatVisto.add(id);
      const agora = Math.floor(seg());
      if (S.chat.some((m) => m.text === texto.slice(0, 2000) && Math.abs(m.t - agora) < 15)) continue; // a mesma mensagem desenhada duas vezes
      const quem = remetente(no) || (chatPendente.has(id) ? 'Eu' : '');
      if (!quem && !S.chatEstrutura) S.chatEstrutura = estruturaDoNo(no);
      S.chat.push({ t: agora, speaker: quem || 'Chat', text: texto.slice(0, 2000) });
      if (S.chat.length > 2000) S.chat.shift();
    }
  }

  let ultimoTick = 0;
  // O computador dormiu (ou a aba foi suspensa) no meio da reunião: marca o buraco no arquivo e avisa.
  // Aviso discreto no arquivo de que a pessoa pausou e voltou. Pausa de menos de 5 s (clique duplo, arrependimento) não vira aviso.
  function registrarPausa(ms) {
    if (ms < 5000) return;
    const dur = ms < 60000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60000)} min`;
    S.linhas.push({
      t: Math.max(0, seg() - ms / 1000),
      speaker: 'Talktrail',
      text: `(transcrição pausada por ${dur} e retomada)`,
    });
  }

  function registrarBuraco(ms) {
    if (S.fase !== 'gravando') return;
    fecharTudo();
    const min = Math.max(1, Math.round(ms / 60000));
    S.linhas.push({
      t: Math.max(0, seg() - ms / 1000),
      speaker: 'Talktrail',
      text: `(transcrição parada por ${min} min: o computador dormiu ou a aba foi suspensa; este trecho não foi transcrito)`,
    });
    S.info = `A transcrição ficou parada por ${min} min (o computador dormiu ou a aba foi suspensa). Esse trecho não foi transcrito.`;
    S.infoAte = Date.now() + 60000;
    push();
  }

  // Texto de quem está na reunião: os nomes nos quadradinhos de vídeo e quem já falou (nome da reunião fica de fora daqui)
  function textoDosParticipantes() {
    const partes = [];
    for (const el of document.querySelectorAll('[data-participant-id], [data-self-name]')) {
      partes.push(String(el.getAttribute('data-self-name') || '') + ' ' + String(el.innerText || el.textContent || '').slice(0, 200));
    }
    for (const l of S.linhas) partes.push(l.speaker || '');
    for (const v of vivos.values()) partes.push(v.speaker || '');
    return partes.join(' | ').slice(0, 20000);
  }
  // A palavra bloqueada (de qualquer lista dela) que aparece no nome da reunião ou entre os participantes
  function bloqueioNaReuniao() {
    if (!S.ajustes.palavras.length) return '';
    const titulo = S.titulo || tituloPadrao(document.title);
    return palavraBloqueada(`${titulo} | ${textoDosParticipantes()}`, S.ajustes.palavras);
  }

  // Se fomos nós que ligamos as legendas do Meet, ao parar a transcrição elas voltam a ficar desligadas,
  // como se nada tivesse acontecido. Se já estavam ligadas antes, ficam como estavam.
  let ligueiLegendas = false;
  function desligarLegendas() {
    if (!ligueiLegendas) return;
    ligueiLegendas = false;
    if (!emChamada() || legendasLigadas() !== true) return;
    const desligar = /(desativar|desligar|turn off|hide).{0,25}(legenda|caption)/i;
    const alvo = [...document.querySelectorAll('button, [role="button"]')].find((b) => desligar.test(rotulo(b)));
    if (alvo) alvo.click();
  }

  function iniciarTimers() {
    ligueiLegendas = legendasLigadas() !== true && !(legendasLigadas() === null && achaRegiao());
    ligarLegendas();
    let tentativas = 0;
    const tentar = setInterval(() => {
      if (S.fase !== 'gravando' || legendasLigadas() === true || ++tentativas > 8) {
        clearInterval(tentar);
        return;
      }
      ligarLegendas(tentativas === 3);
    }, 2500);
    ultimoTick = Date.now();
    timerVarrer = setInterval(() => {
      const agora = Date.now();
      if (agora - ultimoTick > 20000) registrarBuraco(agora - ultimoTick); // o relógio pulou: dormiu ou suspendeu
      ultimoTick = agora;
      varrer();
      if (S.ajustes.salvarChat) lerChat();
    }, 1000);
    timerSalvar = setInterval(() => {
      const a = assinatura();
      if (a !== ultimaAssinatura) {
        ultimaAssinatura = a;
        salvar(false);
      }
    }, 8000);
  }

  // Experimental: o Meet muda a tela às vezes. Tenta abrir o chat, escrever e enviar; se não conseguir, só avisa no painel.
  async function avisarNoChat(msg) {
    const espera = (ms) => new Promise((r) => setTimeout(r, ms));
    const botoes = () => [...document.querySelectorAll('button, [role="button"]')];
    const campo = () =>
      [...document.querySelectorAll('textarea, [contenteditable="true"]')].find((e) => /mensage|message/i.test(e.getAttribute('aria-label') || e.getAttribute('placeholder') || ''));
    const alternador = () =>
      botoes().find((b) => /(chat|conversa|bate-papo|mensagens)/i.test(rotulo(b)) && !/(emoji|rea[cç][aã]o|reaction)/i.test(rotulo(b)));
    try {
      let abriuAgora = false;
      if (!campo()) {
        const a = alternador();
        if (!a) throw new Error('sem botão de chat');
        a.click();
        abriuAgora = true;
        for (let i = 0; i < 12 && !campo(); i++) await espera(300);
      }
      const c = campo();
      if (!c) throw new Error('sem campo de mensagem');
      c.focus();
      if (c.tagName === 'TEXTAREA') {
        Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(c, msg);
      } else {
        c.textContent = msg;
      }
      c.dispatchEvent(new Event('input', { bubbles: true }));
      await espera(250);
      const enviar = botoes().find((b) => /(enviar|send)/i.test(rotulo(b)) && !b.disabled && b !== alternador());
      if (!enviar) throw new Error('sem botão de enviar');
      enviar.click();
      await espera(300);
      if (abriuAgora) {
        const a = alternador();
        if (a) a.click();
      }
      S.avisoChat = 'enviado';
    } catch (e) {
      S.avisoChat = 'falhou';
    }
    push();
  }

  function iniciarGravacao(opcoes = {}) {
    if (S.fase === 'gravando') return;
    const bloq = bloqueioNaReuniao();
    if (bloq) {
      S.erro = `"${bloq}" está nesta reunião (no nome ou entre os participantes), então não vou transcrever. Tire da lista de bloqueio nos Ajustes se quiser transcrever.`;
      push();
      desenhar();
      return;
    }
    // Parou e voltou sem sair da chamada: é a MESMA reunião, no mesmo arquivo, com um aviso discreto da pausa.
    pastaOferecidaAgora = false;
    const retomando = !!(S.id && S.pausadaEm && emChamada());
    S.fase = 'gravando';
    if (retomando) {
      S.fase = 'gravando';
      registrarPausa(Date.now() - S.pausadaEm);
      S.pausadaEm = 0;
      S.fimEm = 0;
    } else {
      S.id = String(Date.now());
      S.inicio = Date.now();
      S.titulo = S.titulo || tituloPadrao(document.title);
      ajustarTags([...S.tags, ...inferirTags(S.titulo, S.tagsSalvas)]);
      S.linhas = [];
      S.marcas = [];
      S.salvoEm = null;
    }
    semChamadaDesde = 0;
    regiaoVistaEm = Date.now() + 6000; // dá um tempo pra ligarem sozinhas antes de avisar
    clearTimeout(timerOferta);
    iniciarTimers();
    aplicarEstiloLegendas();
    enviar({ type: 'em-chamada' });
    salvar(false);
    push();
    desenhar();
    if (!retomando) {
      S.avisoChat = '';
      S.chat = [];
      S.chatEstrutura = '';
    }
    S.inicioAte = opcoes.automatico ? Date.now() + 6000 : 0;
    // "perguntar" pergunta no aviso de oferta; em "gravar sozinho" não há a quem perguntar, então avisa (mais seguro)
    const modo = S.ajustes.avisoChat;
    const avisar = (!retomando && (modo === 'sempre' || (modo === 'perguntar' && S.ajustes.oferta === 'auto'))) || opcoes.avisar;
    if (avisar) avisarNoChat(String(S.ajustes.textoChat || TEXTO_CHAT).slice(0, 300));
  }

  // "Desfazer" no aviso de salvo: continua a mesma reunião, no mesmo arquivo
  function desfazerParada() {
    if (S.fase !== 'parado') return;
    S.fase = 'gravando';
    S.erro = null;
    S.podeDesfazer = false;
    semChamadaDesde = 0;
    regiaoVistaEm = Date.now() + 6000;
    iniciarTimers();
    aplicarEstiloLegendas();
    enviar({ type: 'em-chamada' });
    enviar({ type: 'open-panel' });
    salvar(false);
    push();
    desenhar();
  }

  function pararGravacao() {
    if (S.fase !== 'gravando') return;
    clearInterval(timerVarrer);
    clearInterval(timerSalvar);
    fecharTudo();
    S.podeDesfazer = emChamada(); // parou com a chamada ainda aberta: dá pra continuar
    S.fase = 'parado';
    S.pausadaEm = Date.now();
    S.fimEm = Date.now();
    aplicarEstiloLegendas();
    // Reunião acabou: o painel fecha no mesmo instante em que o aviso "salva" entra, num gesto só.
    // Parou mas continua na chamada: o painel fica disponível pra transcrever de novo (quantas vezes quiser).
    if (!emChamada()) {
      painelLigado = false; // o fundo fechou o painel: a próxima vez na chamada manda religar
      enviar({ type: 'fim' });
    }
    desligarLegendas();
    salvar(true).then(() => {
      const sumir = () => {
        if (S.fase !== 'parado') return;
        if (sobreAviso) return setTimeout(sumir, 1000); // mouse em cima: não some na cara da pessoa
        encerrarReuniao();
      };
      // com botão pra apertar (Mostrar na pasta), dá tempo de ler e decidir: 20 s, com a barrinha mostrando quanto falta
      const tempo = temArquivo() ? 20000 : 6000;
      const el = atual && atual.chave === 'parado' ? atual.el : null;
      if (el && temArquivo()) {
        const bar = document.createElement('div');
        bar.className = 'bar';
        el.appendChild(bar);
        if (anima) {
          const tween = gsap.fromTo(bar, { scaleX: 1 }, { scaleX: 0, duration: tempo / 1000, ease: 'none' });
          el.addEventListener('mouseenter', () => tween.pause());
          el.addEventListener('mouseleave', () => tween.resume());
        }
      }
      setTimeout(sumir, tempo);
    });
    push();
    desenhar();
  }

  // Apaga tudo desta reunião (a chamada acabou). Só volta quando entrar numa chamada de novo.
  function limparReuniao() {
    Object.assign(S, { fase: 'oculto', dispensado: true, podeDesfazer: false, erroFixo: '', chat: [], titulo: '', projeto: '', tags: [], notes: '', cola: '', linhas: [], marcas: [], erro: null, salvoEm: null, id: null, inicio: null, pausadaEm: 0, fimEm: 0, inicioAte: 0 });
    vivos.clear();
  }

  // Some o aviso. Se ainda está na chamada, a reunião fica guardada (a pessoa pode voltar a transcrever no mesmo arquivo).
  function encerrarReuniao() {
    if (S.id && emChamada()) {
      Object.assign(S, { fase: 'oculto', dispensado: true, podeDesfazer: false, erroFixo: '', erro: null });
    } else {
      limparReuniao();
    }
    desenhar();
  }

  // mudou nota, pauta ou nome com a transcrição parada (ainda na chamada): salva sem precisar voltar a transcrever
  let tSalvaPausa = null;
  function salvarPausado() {
    if (S.fase === 'gravando' || !S.id || !S.pausadaEm) return;
    clearTimeout(tSalvaPausa);
    tSalvaPausa = setTimeout(() => { if (S.fase !== 'gravando' && S.id && S.pausadaEm) salvar(true); }, 1500);
  }

  let ultimoMarcador = 0;
  function marcar() {
    if (S.fase !== 'gravando') return;
    if (Date.now() - ultimoMarcador < 1200) return; // duplo clique não vira dois marcadores
    ultimoMarcador = Date.now();
    const l = linhasAoVivo();
    const u = l[l.length - 1];
    let fim = u ? u.text.slice(-160) : '';
    if (u && u.text.length > 160) fim = '…' + fim.replace(/^\S*\s/, ''); // começa em palavra inteira
    S.marcas.push({ t: Math.floor(seg()), texto: u ? `${u.speaker}: ${fim}` : '' });
    push();
    desenhar();
  }

  chrome.runtime.onMessage.addListener((m, _s, responder) => {
    if (m.type !== 'cmd') return false;
    if (m.cmd === 'start') iniciarGravacao();
    if (m.cmd === 'stop') pararGravacao();
    if (m.cmd === 'mark') marcar();
    if (m.cmd === 'alternar') (S.fase === 'gravando' ? pararGravacao : iniciarGravacao)();
    if (m.cmd === 'notes') {
      S.notes = String(m.text || '');
      salvarPausado();
    }
    if (m.cmd === 'cola') {
      S.cola = String(m.text || '');
      chrome.storage.local.set({ ['cola:' + (S.projeto || '_')]: S.cola });
      guardarPauta(S.cola).catch(() => {});
      salvarPausado();
    }
    if (m.cmd === 'ligar') ligarLegendas(true);
    if (m.cmd === 'legendas') {
      S.esconderLegendas = !!m.valor;
      chrome.storage.local.set({ ocultarLegendas: S.esconderLegendas });
      aplicarEstiloLegendas();
    }
    if (m.cmd === 'meta') {
      if (typeof m.titulo === 'string') {
        S.titulo = m.titulo;
        const achadas = inferirTags(m.titulo, S.tagsSalvas).filter((x) => !S.tags.includes(x));
        if (achadas.length) ajustarTags([...S.tags, ...achadas]);
      }
      if (Array.isArray(m.tags)) ajustarTags(m.tags);
      salvarPausado();
    }
    if (m.cmd === 'diagnostico') {
      const e = estadoLegendas();
      responder({
        ...snap(),
        diag: {
          naSala: CODIGO_SALA.test(location.pathname),
          naChamada: emChamada(),
          gravando: S.fase === 'gravando',
          legendas: e,
          regiao: !!achaRegiao(),
          ultimaFalaHa: S.ultimaFalaEm ? Math.round((Date.now() - S.ultimaFalaEm) / 1000) : null,
          linhas: S.linhas.length,
          salvoHa: S.salvoEm ? Math.round((Date.now() - S.salvoEm) / 1000) : null,
        },
      });
      return false;
    }
    responder(snap());
    return false;
  });

  // ---------- notificação dentro do Meet (shadow DOM, lado direito, GSAP) ----------
  const host = document.createElement('div');
  host.id = 'talktrail-host';
  // Topo, no centro, logo abaixo da barra de cima do Meet. Os cantos já são do Meet: embaixo à esquerda ele mostra o
  // cartão "Sua reunião está pronta" e os avisos dele; em cima à esquerda o relógio e o código; em cima à direita os
  // participantes; à direita abrem o chat e a lista de pessoas. O centro de cima fica livre.
  host.style.cssText = 'all:initial;position:fixed;top:72px;left:0;right:0;display:flex;justify-content:center;z-index:2147483647;pointer-events:none;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      *{box-sizing:border-box}
      .card{pointer-events:auto;position:relative;overflow:hidden;display:flex;gap:12px;align-items:center;width:420px;max-width:calc(100vw - 32px);
        font:13px/1.4 Inter,-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;color:#09090B;
        background:#FFFFFF;border:1px solid #E4E4E7;border-radius:14px;padding:12px 12px 14px 14px;
        box-shadow:0 12px 36px rgba(0,0,0,.5)}
      .ico{flex:none;width:32px;height:32px;border-radius:10px;display:grid;place-items:center;background:#F4F4F5}
      .ico i{width:10px;height:10px;border-radius:50%;background:#DC2626}
      .ico.ok i{background:none;width:12px;height:7px;border-left:2px solid #16A34A;border-bottom:2px solid #16A34A;border-radius:0;transform:translateY(-1px) rotate(-45deg)}
      .c{flex:1;min-width:0}
      .dois{flex-wrap:wrap;width:480px}
      .salvo{width:max-content;min-width:340px;max-width:min(460px,calc(100vw - 32px));padding:14px 16px 18px 14px}
      .dois .c{flex:1 1 0}
      .dois .r{flex:0 0 100%;justify-content:flex-start;flex-wrap:wrap;gap:8px;margin-top:2px;padding-left:44px}
      .dois button.b{border:1px solid #d4d4d8;color:#09090B;font-weight:600}
      .dois button.b:hover{background:#F4F4F5}
      .r:not(:has(button:not([hidden]))){display:none}
      .salvo{align-items:flex-start}
      .salvo .r{margin-top:12px;gap:8px;flex-wrap:wrap}
      .salvo button{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;font-size:12.5px;line-height:1.4;border:1px solid #D4D4D8;border-radius:8px;color:#09090B;font-weight:600;background:#fff}
      .salvo button:hover{background:#F4F4F5}
      .salvo button.a{color:#0f766e;border-color:#5EB5AD;background:#F0FDFA}
      .salvo button.a:hover{background:#CCFBF1;color:#115e59}
      .salvo .m{white-space:pre-line;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;overflow-wrap:anywhere}
      .t{font-weight:600;font-size:14px}
      .m{color:#52525B;overflow-wrap:anywhere}
      .r{display:flex;gap:4px;align-items:center;flex:none}
      button{font:inherit;white-space:nowrap;cursor:pointer;border:1px solid transparent;border-radius:9px;padding:7px 14px;background:transparent;color:#52525B;transition:background .15s,color .15s}
      button:hover{background:#F4F4F5;color:#09090B}
      button.p{background:#18181B;color:#FAFAFA;font-weight:600}
      button.p:hover{background:#3F3F46;color:#fff}
      button.x{padding:7px 9px;font-size:15px;line-height:1}
      [hidden]{display:none !important}
      button.g{color:#09090B;font-weight:600}
      .bar{position:absolute;left:0;bottom:0;height:2px;width:100%;background:#0f766e;transform-origin:left center}
      .cf{padding-right:36px}
      .card button.fechar{position:absolute;top:6px;right:6px;width:24px;height:24px;padding:0;display:grid;place-items:center;border:0;border-radius:50%;
        background:transparent;color:#71717A;font-size:17px;line-height:1;cursor:pointer}
      .card button.fechar:hover{background:#F4F4F5;color:#09090B}
      .card button.fechar:focus-visible{outline:2px solid #0f766e;outline-offset:1px}
      #slot{position:relative}
      .fab{pointer-events:auto;position:fixed;left:calc(50% - 18px);top:14px;width:36px;height:36px;padding:0;border-radius:50%;cursor:pointer;
        display:grid;place-items:center;background:rgba(32,33,36,.92);border:1px solid rgba(255,255,255,.22);color:#fff;
        box-shadow:0 2px 8px rgba(0,0,0,.35);transition:transform .15s,background .15s,border-color .15s}
      .fab:hover{transform:scale(1.08);border-color:rgba(255,255,255,.5)}
      .fab:focus-visible{outline:2px solid #5EEAD4;outline-offset:2px}
      .fab i{width:12px;height:12px;border-radius:50%;background:#EF4444;transition:border-radius .2s,background .2s}
      .fab.rec{background:#DC2626;border-color:#FCA5A5}
      .fab.rec i{border-radius:3px;background:#fff}
      .fab.rec::after{content:"";position:absolute;inset:-1px;border-radius:50%;border:2px solid rgba(220,38,38,.7);animation:pulso 1.6s ease-out infinite}
      @keyframes pulso{0%{transform:scale(1);opacity:.9}100%{transform:scale(1.5);opacity:0}}
      @media (prefers-reduced-motion:reduce){.fab.rec::after{animation:none}}
      [hidden]{display:none !important}
    </style>
    <button class="fab" type="button" hidden aria-label="Transcrever esta reunião" title="Transcrever esta reunião"><i></i></button>
    <div id="slot" role="status" aria-live="polite"></div>`;
  document.documentElement.appendChild(host);
  // Em tela cheia do Meet só o elemento em tela cheia (e o que está dentro) aparece: leva o aviso e o botão redondo pra dentro dele.
  document.addEventListener('fullscreenchange', () => {
    const fs = document.fullscreenElement;
    const alvo = fs && !['VIDEO', 'IFRAME', 'CANVAS', 'IMG'].includes(fs.tagName) ? fs : document.documentElement;
    if (host.parentNode !== alvo) alvo.appendChild(host);
    // entrou em tela cheia transcrevendo: abre o painel (se não quiser, é só fechar no X). O Chrome só abre painel a
    // partir de um gesto da pessoa; o duplo clique que levou à tela cheia conta, então vale tentar, sem erro se recusar.
    if (fs && S.fase === 'gravando' && S.ajustes.painelNaTelaCheia !== false) enviar({ type: 'open-panel' });
  });
  const slot = root.getElementById('slot');
  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const calmo = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const anima = typeof gsap !== 'undefined' && !calmo;

  // Botão redondo no canto, só durante a chamada: clicar começa ou para a transcrição, sem abrir o painel.
  const fab = root.querySelector('.fab');
  fab.addEventListener('click', () => {
    if (S.fase === 'gravando') {
      pararGravacao();
    } else {
      iniciarGravacao({ automatico: true }); // "automatico" mostra a confirmação curta com o botão Parar
      if (S.ajustes.fabAbrePainel !== false) enviar({ type: 'open-panel' }); // o painel abre na hora
    }
  });
  function atualizarFab() {
    const visivel = S.ajustes.botaoFlutuante !== false && CODIGO_SALA.test(location.pathname) && emChamada();
    fab.hidden = !visivel;
    const gravando = S.fase === 'gravando';
    fab.classList.toggle('rec', gravando);
    const rotulo = gravando ? 'Parar a transcrição' : 'Transcrever esta reunião';
    fab.title = rotulo;
    fab.setAttribute('aria-label', rotulo);
  }

  let atual = null; // { chave, el }
  let sobreAviso = false;
  slot.addEventListener('mouseover', () => (sobreAviso = true));
  slot.addEventListener('mouseout', () => (sobreAviso = false));

  function sairDe(item) {
    item.el.style.cssText += `;position:absolute;top:${item.el.offsetTop}px;left:${item.el.offsetLeft}px`;
    if (!anima) return item.el.remove();
    gsap.to(item.el, { y: -18, opacity: 0, duration: 0.28, ease: 'power2.in', onComplete: () => item.el.remove() });
  }

  function entrarCom(chave, el) {
    slot.appendChild(el);
    atual = { chave, el };
    if (anima) gsap.fromTo(el, { y: -18, opacity: 0, scale: 0.96 }, { x: 0, opacity: 1, scale: 1, duration: 0.6, ease: 'back.out(1.6)' });
  }

  // só há arquivo pra mostrar quando salvou na pasta ao vivo ou em Downloads (na biblioteca da extensão não há)
  const temArquivo = () => S.modoSalvar === 'pasta' || S.modoSalvar === 'downloads';
  // Primeira reunião que caiu em Downloads/biblioteca (sem servidor e sem pasta escolhida): oferece, uma vez só, escolher uma pasta.
  let pastaOferecidaAgora = false;
  const ofertaDePasta = () => {
    if (pastaOferecidaAgora) return true;
    if (S.ajustes.pastaOferecida === true || !(S.modoSalvar === 'downloads' || S.modoSalvar === 'extensao')) return false;
    pastaOferecidaAgora = true;
    S.ajustes.pastaOferecida = true;
    enviar({ type: 'pasta-oferecida' });
    return true;
  };

  function montar(fase) {
    const el = document.createElement('div');
    const oferta = fase === 'oferta';
    const inicio = fase === 'inicio'; // confirmação curta quando começa sozinho
    const aviso = fase === 'orfa';
    const doisBotoes = oferta && S.ajustes.avisoChat === 'perguntar';
    el.className = oferta ? 'card' + (doisBotoes ? ' dois' : '') : 'card salvo'; // o de salvo e o de "transcrevendo": texto em cima, botões embaixo
    const botoes = aviso
      ? '<div class="r"><button class="p" data-a="r">Recarregar a aba</button></div>'
      : oferta
      ? doisBotoes
        ? '<div class="r"><button class="p" data-a="g">Transcrever</button><button class="g b" data-a="ga" title="Transcreve e escreve no chat do Meet que você está transcrevendo">Transcrever e avisar</button><button class="g" data-a="n">Agora não</button></div><div class="bar"></div>'
        : '<div class="r"><button class="p" data-a="g">Transcrever</button></div><div class="bar"></div>'
      : inicio
        ? '<div class="r"><button class="g" data-a="p" title="Parar a transcrição">Parar</button></div>'
        : '<div class="r">' +
          (S.podeDesfazer ? '<button class="g" data-a="d" title="Continuar transcrevendo esta reunião">Desfazer</button>' : '') +
          '<button class="g" data-a="pf" title="Escolher uma pasta sua pra salvar as próximas reuniões nela, ao vivo"' + (ofertaDePasta() ? '' : ' hidden') + '>Salvar numa pasta minha</button>' +
          '<button class="a" data-a="m" title="Mostra o arquivo da reunião na pasta, pra você decidir o que fazer com ele (por exemplo, mandar pra uma IA)"' + (temArquivo() ? '' : ' hidden') + '><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M1.75 4.5a1 1 0 0 1 1-1h3.2l1.4 1.5h5.9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2.75a1 1 0 0 1-1-1z"/></svg>Mostrar na pasta</button></div>';
    el.innerHTML = `<div class="ico${oferta || inicio ? '' : ' ok'}"><i></i></div><div class="c"><div class="t"></div><div class="m"></div></div>${botoes}`;
    if (!oferta) el.querySelector('.c').appendChild(el.querySelector('.r')); // título, texto e botões, um embaixo do outro
    el.classList.add('cf');
    el.insertAdjacentHTML('beforeend', '<button class="fechar" type="button" data-a="x" aria-label="Fechar" title="Fechar">×</button>');
    const semNada = !oferta && !inicio && !aviso && S.modoSalvar === 'vazia';
    el.querySelector('.t').textContent = aviso ? 'A extensão foi atualizada' : oferta ? 'Transcrever esta reunião?' : inicio ? 'Transcrevendo esta reunião' : semNada ? 'Nada foi falado' : 'Reunião salva';
    el.querySelector('.m').textContent = aviso
      ? 'Recarregue esta aba para voltar a transcrever.\nO que já foi salvo continua guardado.'
      : oferta
      ? 'A transcrição fica só no seu computador.'
      : inicio
        ? 'Só no seu computador.\nO painel abre pelo ícone da extensão.'
        : semNada
          ? 'Sem fala, nota nem marcador: não guardei arquivo.'
          : S.titulo || '';
    if (!oferta && !inicio && !aviso) el.querySelector('.m').title = S.titulo || '';
    el.addEventListener('click', (ev) => {
      const a = ev.target && ev.target.dataset && ev.target.dataset.a;
      if (a === 'g') {
        iniciarGravacao();
        enviar({ type: 'open-panel' });
      }
      if (a === 'ga') {
        iniciarGravacao({ avisar: true });
        enviar({ type: 'open-panel' });
      }
      if (a === 'p') pararGravacao();
      if (a === 'r') location.reload();
      if (a === 'x') {
        // fechar só tira o aviso da tela: nada é parado nem apagado
        if (aviso) {
          orfaDispensada = true;
          desenhar();
        } else if (oferta) {
          S.fase = 'oculto';
          S.dispensado = true;
          desenhar();
        } else if (inicio) {
          S.inicioAte = 0;
          desenhar();
        } else {
          encerrarReuniao();
        }
      }
      if (a === 'd') desfazerParada();
      if (a === 'pf') {
        enviar({ type: 'escolher-pasta-navegador' });
        encerrarReuniao();
      }
      if (a === 'm') {
        enviar({ type: 'mostrar', id: S.id });
        encerrarReuniao();
      }
      if (a === 'n') {
        S.fase = 'oculto';
        S.dispensado = true;
        desenhar();
      }
    });
    return el;
  }

  // Enquanto grava, o estado vive só no painel lateral (e no selo REC do ícone).
  // Aqui dentro só aparecem a oferta e o "salvo". Erro de servidor vira selo "!" no ícone e aviso no painel.
  function chaveEsperada() {
    if (orfa && !orfaDispensada) return 'orfa';
    const inicio = S.fase === 'gravando' && S.inicioAte > Date.now();
    const quer = S.fase === 'oferta' || S.fase === 'parado' || inicio;
    return quer ? (inicio ? 'inicio' : S.fase) : '';
  }

  function desenhar() {
    aplicarEstiloLegendas();
    atualizarFab();
    const fase = S.fase;
    const inicio = fase === 'gravando' && S.inicioAte > Date.now();
    const chave = chaveEsperada();
    const quer = chave !== '';
    if (atual && atual.chave === chave) {
      const m = atual.el.querySelector('[data-a="m"]'); // o resultado do salvamento chega depois do aviso
      if (m) m.hidden = !temArquivo();
      const pf = atual.el.querySelector('[data-a="pf"]');
      if (pf) pf.hidden = !ofertaDePasta();
      if (chave === 'parado') {
        const nada = S.modoSalvar === 'vazia';
        const tt = atual.el.querySelector('.t');
        const mm = atual.el.querySelector('.m');
        if (tt && mm && (tt.textContent === 'Nada foi falado') !== nada) {
          tt.textContent = nada ? 'Nada foi falado' : 'Reunião salva';
          mm.textContent = nada ? 'Sem fala, nota nem marcador: não guardei arquivo.' : S.titulo || '';
        }
      }
      return;
    }
    if (atual) {
      sairDe(atual);
      atual = null;
    }
    if (!quer) return;
    const el = montar(chave === 'orfa' ? 'orfa' : inicio ? 'inicio' : fase);
    entrarCom(chave, el);
    if (fase === 'oferta') {
      const bar = el.querySelector('.bar');
      if (anima && bar) gsap.fromTo(bar, { scaleX: 1 }, { scaleX: 0, duration: 30, ease: 'none' });
      clearTimeout(timerOferta);
      timerOferta = setTimeout(() => {
        if (S.fase === 'oferta') {
          S.fase = 'oculto';
          desenhar();
        }
      }, 30000);
    }
  }

  // ---------- detecção da chamada ----------
  function emChamada() {
    return !!document.querySelector(
      'button[aria-label*="Leave call" i], button[aria-label*="Sair da chamada" i], button[aria-label*="Sair da reuni" i]'
    );
  }
  // telas de fim do Meet: "Você saiu da reunião", "Você encerrou a reunião para todos", "Voltar à tela inicial"
const SAIU = /voc[êe] (saiu|encerrou)|you (left|ended)|reuni[ãa]o (foi )?encerrada|call ended|voltar [àa] tela inicial|return to home screen/i;

  let painelLigado = false;
  setInterval(() => {
    const naSala = CODIGO_SALA.test(location.pathname);
    const dentro = naSala && emChamada();
    atualizarFab();
    // trava: qualquer aviso que não combine com o estado de agora sai (inclusive os que ficaram pra trás)
    if (atual && atual.chave !== chaveEsperada()) desenhar();
    for (const filho of [...slot.children]) {
      if ((!atual || filho !== atual.el) && !filho.style.position) filho.remove(); // sobra de antes (os que estão saindo têm position)
    }
    if (dentro && !painelLigado) {
      painelLigado = true;
      enviar({ type: 'em-chamada' });
    } else if (!dentro && painelLigado) {
      // saiu da chamada: o "ligado" zera sempre, pra a próxima entrada religar o painel (mesmo se saiu transcrevendo,
      // caso em que o "fim" é mandado quando a transcrição para)
      painelLigado = false;
      if (S.fase !== 'gravando') enviar({ type: 'fim' });
    }
    if (S.fase === 'gravando') {
      // a frase de fim só vale sem o botão de sair na tela, senão uma fala "você saiu" nas legendas pararia a gravação
      const noCall = emChamada();
      const saiu = !naSala || (!noCall && SAIU.test(document.body ? document.body.innerText : ''));
      if (noCall) semChamadaDesde = 0;
      const entrou = S.ajustes.palavras.length ? bloqueioNaReuniao() : '';
      if (entrou) {
        S.erroFixo = `Parei de transcrever: "${entrou}" entrou na reunião. O que já foi transcrito ficou salvo; apague na biblioteca se não quiser guardar.`;
        pararGravacao();
        S.erro = S.erroFixo;
        push();
      }
      else if (!semChamadaDesde) semChamadaDesde = Date.now();
      if (saiu || (semChamadaDesde && Date.now() - semChamadaDesde > 12000)) pararGravacao();
    }
    if (S.fase === 'oculto' && S.id && !dentro) {
      limparReuniao(); // saiu da chamada: a reunião guardada já foi salva, some da memória
      desenhar();
    }
    if (S.fase === 'oculto' && S.dispensado && !emChamada()) {
      S.dispensado = false; // saiu da chamada: a próxima entrada oferece de novo
      S.erro = null;
      S.erroFixo = '';
    }
    if (S.fase === 'oculto' && naSala && emChamada() && !S.dispensado) {
      enviar({ type: 'em-chamada' }); // o painel fica disponível em qualquer modo
      const bloq = bloqueioNaReuniao();
      const modo = S.ajustes.oferta;
      if (bloq) {
        S.dispensado = true;
        S.erro = `"${bloq}" está nesta reunião (no nome ou entre os participantes), então não vou oferecer transcrever.`;
        push();
      } else if (modo === 'nada') {
        S.dispensado = true; // só o painel; nenhum aviso na página
      } else if (modo === 'auto') {
        S.dispensado = true;
        iniciarGravacao({ automatico: true });
      } else {
        S.fase = 'oferta';
        desenhar();
      }
    }
  }, 2000);

  setInterval(() => {
    if (S.fase === 'gravando') desenhar();
  }, 1000);

  // Rápido (3 vezes por segundo, só consultas baratas): o botão redondo some assim que a chamada acaba, e a tela de fim do
  // Meet ("Você saiu da reunião") para a transcrição na hora, sem esperar o ciclo de 2 s.
  setInterval(() => {
    if (!orfa && !extensaoViva()) {
      orfa = true;
      desenhar();
    }
    atualizarFab();
    if (S.fase === 'gravando' && !emChamada() && SAIU.test(document.body ? document.body.innerText : '')) pararGravacao();
  }, 300);

  window.addEventListener('pagehide', () => {
    if (S.fase === 'gravando') {
      fecharTudo();
      salvar(true);
    }
  });

  desenhar();
}

if (typeof window !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
  iniciar();
}
