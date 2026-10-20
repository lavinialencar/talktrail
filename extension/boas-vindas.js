// Boas-vindas e configuração inicial. Aparece na instalação e pode ser revista nos Ajustes.
// Com ?so=pasta (janelinha aberta pelo Meet na hora de gravar) mostra só o passo da pasta e fecha ao terminar.
const soPasta = new URLSearchParams(location.search).get('so') === 'pasta';
if (soPasta) {
  document.body.classList.add('so-pasta');
  document.getElementById('titulo').textContent = trad('Onde salvar suas reuniões?');
}
const status = document.getElementById('status');
const passo = document.getElementById('passoPasta');
function pronto(nome) {
  passo.classList.add('pronto');
  status.classList.remove('erro');
  status.textContent = trad('Pronto. Salvando em "{0}".', [nome]);
}

MB_PASTA.ler().then((h) => { if (h) pronto(h.name); }).catch(() => {});
document.getElementById('escolher').onclick = async () => {
  status.classList.add('erro');
  if (typeof window.showDirectoryPicker !== 'function') {
    status.textContent = trad('Este navegador não deixa escolher uma pasta. As reuniões continuam indo para Downloads.');
    return;
  }
  try {
    const h = await window.showDirectoryPicker({ id: 'talktrail', mode: 'readwrite', startIn: 'documents' });
    await MB_PASTA.guardar(h);
    await chrome.storage.local.set({ pastaPendente: false });
    pronto(h.name);
    if (soPasta) setTimeout(() => window.close(), 1600);
  } catch (e) {
    status.textContent = e && e.name === 'AbortError' ? '' : trad('Não consegui usar essa pasta. Escolha outra.');
  }
};
