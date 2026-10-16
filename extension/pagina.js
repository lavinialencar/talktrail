// toda página da extensão que abre numa aba fecha o painel lateral da janela (o painel não tem o que fazer ao lado dela)
(async () => {
  try {
    if (!chrome.sidePanel || !chrome.sidePanel.close) return;
    const janela = await chrome.windows.getCurrent();
    await chrome.sidePanel.close({ windowId: janela.id });
  } catch {}
})();
