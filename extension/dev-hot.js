// Só desenvolvimento. O servidor diz a "versão" dos arquivos da extensão; mudou, recarrega.
// Nunca recarrega no meio de uma gravação. Não vai no pacote da loja.
chrome.alarms.create('hot', { periodInMinutes: 0.25 });
chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name !== 'hot') return;
  try {
    const { v } = await (await fetch(SERVER + '/extversao')).json();
    const { versao } = await chrome.storage.local.get('versao');
    if (!versao) return chrome.storage.local.set({ versao: v });
    if (v !== versao && !gravandoAgora) {
      await chrome.storage.local.set({ versao: v });
      chrome.runtime.reload();
    }
  } catch (e) {}
});
