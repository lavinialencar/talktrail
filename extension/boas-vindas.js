// Boas-vindas: aparece uma vez, quando a extensão é instalada. O passo da pasta usa o mesmo seletor da janelinha do Meet.
const status = document.getElementById('status');
const passo = document.getElementById('passoPasta');
function pronto(nome) {
  passo.classList.add('pronto');
  status.classList.remove('erro');
  status.textContent = `Pronto. Salvando em "${nome}".`;
}
MB_PASTA.ler().then((h) => { if (h) pronto(h.name); }).catch(() => {});
document.getElementById('escolher').onclick = async () => {
  status.classList.add('erro');
  if (typeof window.showDirectoryPicker !== 'function') {
    status.textContent = 'Este navegador não deixa escolher uma pasta. As reuniões continuam indo para Downloads.';
    return;
  }
  try {
    const h = await window.showDirectoryPicker({ id: 'talktrail', mode: 'readwrite', startIn: 'documents' });
    await MB_PASTA.guardar(h);
    await chrome.storage.local.set({ pastaPendente: false });
    pronto(h.name);
  } catch (e) {
    status.textContent = e && e.name === 'AbortError' ? '' : 'Não consegui usar essa pasta. Escolha outra.';
  }
};
