// Janelinha de uma ação só: a pessoa escolhe a pasta (o navegador exige um clique numa página da extensão pra isso).
const status = document.getElementById('status');
document.getElementById('escolher').onclick = async () => {
  if (typeof window.showDirectoryPicker !== 'function') {
    status.textContent = 'Este navegador não deixa escolher uma pasta. As reuniões continuam indo pra Downloads.';
    return;
  }
  try {
    const h = await window.showDirectoryPicker({ id: 'talktrail', mode: 'readwrite', startIn: 'documents' });
    await MB_PASTA.guardar(h);
    await chrome.storage.local.set({ pastaPendente: false });
    status.textContent = `Pronto! Salvando em "${h.name}".`;
    setTimeout(() => window.close(), 1600);
  } catch (e) {
    status.textContent = e && e.name === 'AbortError' ? '' : 'Não consegui usar essa pasta. Escolha outra.';
  }
};
