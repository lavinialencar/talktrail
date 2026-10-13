// Pasta escolhida pelo navegador (sem o servidor): a pessoa escolhe uma pasta uma vez e a extensão grava nela.
// O "handle" da pasta fica no IndexedDB da própria extensão. O navegador só deixa gravar quando a permissão está
// ativa; se não estiver, quem chama cai pro plano B (Downloads) e pede pra liberar com um clique.
(function (raiz) {
  const BANCO = 'talktrail';
  const LOJA = 'handles';
  const CHAVE = 'pasta';

  function abrir() {
    return new Promise((res, rej) => {
      const r = raiz.indexedDB.open(BANCO, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(LOJA);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function transacao(modo, fn) {
    const db = await abrir();
    try {
      return await new Promise((res, rej) => {
        const req = fn(db.transaction(LOJA, modo).objectStore(LOJA));
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
    } finally {
      db.close();
    }
  }

  const api = {
    ler: () => transacao('readonly', (s) => s.get(CHAVE)).then((h) => h || null),
    guardar: (handle) => transacao('readwrite', (s) => s.put(handle, CHAVE)),
    apagar: () => transacao('readwrite', (s) => s.delete(CHAVE)),
    // true se já dá pra gravar; com pedir=true (só de um clique da pessoa) o navegador mostra o pedido
    async permissao(handle, pedir = false) {
      const opcoes = { mode: 'readwrite' };
      if ((await handle.queryPermission(opcoes)) === 'granted') return true;
      return pedir && (await handle.requestPermission(opcoes)) === 'granted';
    },
    // grava texto em AAAA-MM/arquivo.md dentro da pasta escolhida (cria a subpasta)
    async escrever(handle, caminho, texto) {
      const partes = String(caminho).split('/').filter(Boolean);
      const nome = partes.pop();
      let dir = handle;
      for (const sub of partes) dir = await dir.getDirectoryHandle(sub, { create: true });
      const arquivo = await dir.getFileHandle(nome, { create: true });
      const w = await arquivo.createWritable();
      await w.write(texto);
      await w.close();
    },
  };
  raiz.MB_PASTA = api;
})(typeof self !== 'undefined' ? self : globalThis);
