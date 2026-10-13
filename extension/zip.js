// ZIP mínimo (sem compressão), com o modo de arquivo do Unix (pra o instalador do Mac sair executável).
(function (raiz) {
  const TABELA = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = (bytes) => {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = TABELA[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };

  // arquivos: [{ nome, bytes (Uint8Array), modo (ex.: 0o755) }]
  function criar(arquivos, agora = new Date()) {
    const enc = new TextEncoder();
    const hora = (agora.getHours() << 11) | (agora.getMinutes() << 5) | (agora.getSeconds() >> 1);
    const data = ((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate();
    const partes = [];
    const central = [];
    let deslocamento = 0;
    for (const a of arquivos) {
      const nome = enc.encode(a.nome);
      const crc = crc32(a.bytes);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // nomes em UTF-8
      local.setUint16(8, 0, true); // sem compressão
      local.setUint16(10, hora, true);
      local.setUint16(12, data, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, a.bytes.length, true);
      local.setUint32(22, a.bytes.length, true);
      local.setUint16(26, nome.length, true);
      local.setUint16(28, 0, true);
      partes.push(new Uint8Array(local.buffer), nome, a.bytes);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true);
      c.setUint16(4, (3 << 8) | 20, true); // criado no Unix
      c.setUint16(6, 20, true);
      c.setUint16(8, 0x0800, true);
      c.setUint16(10, 0, true);
      c.setUint16(12, hora, true);
      c.setUint16(14, data, true);
      c.setUint32(16, crc, true);
      c.setUint32(20, a.bytes.length, true);
      c.setUint32(24, a.bytes.length, true);
      c.setUint16(28, nome.length, true);
      c.setUint32(38, (((0o100000 | (a.modo || 0o644)) << 16) >>> 0), true);
      c.setUint32(42, deslocamento, true);
      central.push(new Uint8Array(c.buffer), nome);
      deslocamento += 30 + nome.length + a.bytes.length;
    }
    const tamCentral = central.reduce((s, p) => s + p.length, 0);
    const fim = new DataView(new ArrayBuffer(22));
    fim.setUint32(0, 0x06054b50, true);
    fim.setUint16(8, arquivos.length, true);
    fim.setUint16(10, arquivos.length, true);
    fim.setUint32(12, tamCentral, true);
    fim.setUint32(16, deslocamento, true);
    const todos = [...partes, ...central, new Uint8Array(fim.buffer)];
    const saida = new Uint8Array(todos.reduce((s, p) => s + p.length, 0));
    let o = 0;
    for (const p of todos) {
      saida.set(p, o);
      o += p.length;
    }
    return saida;
  }
  raiz.MB_ZIP = { criar, crc32 };
})(typeof self !== 'undefined' ? self : globalThis);
