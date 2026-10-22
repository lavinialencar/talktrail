// Atualização: quem tem a versão publicada (1.21.0, a que ficou meses no ar) recebe a nova com o MESMO perfil.
// Grava reunião, pauta e ajustes com a versão velha, troca a pasta da extensão pelo pacote novo (mesmo caminho = mesmo ID)
// e confere que nada se perdeu e que as páginas abrem sem erro. Depois faz exportar -> apagar tudo -> importar.
const fs = require('fs'), os = require('os'), path = require('path');
const { abrir, esp, relatorio, RAIZ } = require('./lib');
const { iniciar } = require('./meet-falso');
const R = relatorio('Atualização e cópia de segurança');
const PORTA = 9000 + Math.floor(Math.random() * 300);
const VELHA = process.env.TT_VERSAO_VELHA || '1.21.0';
const lerTudo = async (B) => { const sw = await B.sw(); const t = JSON.parse(await sw.ev(`chrome.storage.local.get(null).then((x) => JSON.stringify(x))`)); sw.close(); return t; };

(async () => {
  const velhaPasta = path.join(RAIZ, 'dist', `talktrail-${VELHA}`);
  if (!fs.existsSync(velhaPasta)) { console.log('sem o pacote ' + VELHA + ' em dist/, pulando'); process.exit(0); }
  const meet = await iniciar({ porta: PORTA });
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-perfil-up-'));
  const destino = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-ext-up-')) + '/ext';
  const portaSrv = 30000 + Math.floor(Math.random() * 5000);

  R.sec(`== versão velha (${VELHA}) grava dados`);
  let B = await abrir({ idioma: 'pt-BR', meetPorta: PORTA, pacoteDe: velhaPasta, destinoExt: destino, perfilDir: perfil, portaServidor: portaSrv });
  const ID = B.ID;
  const aba = await B.nova(meet.url('/abc-defg-hij'), { largura: 1200, altura: 800 });
  await aba.espera(`!!document.getElementById('talktrail-host') && !!document.getElementById('talktrail-host').shadowRoot.querySelector('[data-a="g"]')`, 12000);
  await aba.ev(`document.getElementById('talktrail-host').shadowRoot.querySelector('[data-a="g"]').click()`);
  await esp(9000);
  await aba.ev(`__falar('Ana', 'Frase gravada na versão velha, antes da atualização.')`); await esp(9000);
  await aba.ev(`__sairDaChamada()`); await esp(6000);
  await aba.fecha();
  const pg = await B.nova(B.url('boas-vindas.html'));
  const hoje = new Date(); const dia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  await pg.ev(`chrome.storage.local.set({ pautas: { 'antiga|1': { titulo: 'Pauta da versão velha', data: '${dia}', hora: '14:00', texto: '1. um\\n2. dois', criada: 1, atualizada: 2 } }, ajustes: { oferta: 'sempre', avisoChat: 'nunca', salvarChat: true, palavras: ['segredo'], baixarAoTerminar: true, apagarAntigas: 'nunca' }, tagsSalvas: ['Projeto X'] })`);
  await esp(500);
  const antes = await lerTudo(B);
  const nAntes = Object.keys(antes).filter((k) => k.startsWith('reuniao:')).length;
  R.t(`a versão velha gravou a reunião`, nAntes === 1, String(nAntes));
  R.t(`a versão velha tem a manifest ${VELHA}`, await pg.ev(`chrome.runtime.getManifest().version`) === VELHA);
  await pg.fecha(); B.fechar(true);
  await esp(1500);

  R.sec('== troca pelo pacote novo, mesmo perfil, mesmo ID');
  B = await abrir({ idioma: 'pt-BR', meetPorta: PORTA, destinoExt: destino, perfilDir: perfil, portaServidor: portaSrv });
  R.t('o ID da extensão continua o mesmo', B.ID === ID, `${ID} → ${B.ID}`);
  const depois = await lerTudo(B);
  const reunioes = Object.keys(depois).filter((k) => k.startsWith('reuniao:'));
  R.t('a reunião gravada continua lá, com a fala', reunioes.length === 1 && /versão velha/.test(JSON.stringify(depois[reunioes[0]].payload.transcript)));
  R.t('a pauta continua lá', depois.pautas && Object.values(depois.pautas).some((p) => p.titulo === 'Pauta da versão velha'));
  R.t('os ajustes continuam (incluindo palavras proibidas)', depois.ajustes && depois.ajustes.salvarChat === true && (depois.ajustes.palavras || []).includes('segredo'), JSON.stringify(depois.ajustes));
  const novaVersao = JSON.parse(fs.readFileSync(path.join(destino, 'manifest.json'), 'utf8')).version;
  for (const arq of ['panel.html', 'pautas.html', 'biblioteca.html', 'boas-vindas.html']) {
    const p = await B.nova(B.url(arq), { largura: 900, altura: 800 }); await esp(1800);
    const txt = await p.ev('document.body.innerText');
    R.t(`${arq} abre sem erro depois da atualização (v${novaVersao})`, p.erros.length === 0 && txt.length > 40, p.erros.slice(0, 2).join(' | '));
    if (arq === 'biblioteca.html') R.t('a biblioteca mostra a reunião antiga', /Ana|abc-defg-hij|Reunião/.test(txt), txt.slice(0, 120).replace(/\n/g, ' '));
    if (arq === 'pautas.html') R.t('a página de Pautas mostra a pauta antiga', /Pauta da versão velha/.test(txt), txt.slice(0, 160).replace(/\n/g, ' '));
    await p.fecha();
  }

  R.sec('== cópia de segurança pela tela: exportar, apagar tudo, importar');
  const pn = await B.nova(B.url('panel.html'), { largura: 436, altura: 880 }); await esp(1800);
  const arquivoJson = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tt-bk-')), 'copia.json');
  // exportar: o painel monta o arquivo; pego o mesmo texto que ele baixaria
  const exp = await pn.ev(`(async () => MB_BACKUP.exportar(await chrome.storage.local.get(null)).texto)()`);
  fs.writeFileSync(arquivoJson, exp);
  const obj = JSON.parse(exp);
  R.t('o arquivo exportado tem reunião, pauta, tag e ajustes', /versão velha/.test(exp) && /Pauta da versão velha/.test(exp) && /Projeto X/.test(exp) && obj.dados.ajustes && obj.dados.ajustes.palavras.includes('segredo'));
  R.t('o arquivo exportado não leva chave de pareamento nem agenda lida', !/pareamento|agendaMeet/.test(exp));
  await pn.ev(`chrome.storage.local.clear()`); await esp(400);
  R.t('depois de apagar tudo, a biblioteca está vazia', Object.keys(await lerTudo(B)).filter((k) => k.startsWith('reuniao:')).length === 0);
  // importar com o botão e o seletor de arquivo de verdade
  const { root } = await pn.send('DOM.getDocument');
  const { nodeId } = await pn.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#ajArquivo' });
  await pn.send('DOM.setFileInputFiles', { files: [arquivoJson], nodeId });
  await esp(1500);
  const msg = await pn.ev(`document.getElementById('ajBackupMsg').textContent`);
  R.t('importar mostra o que entrou', /1 reuni/.test(msg) && /pauta/.test(msg), msg);
  const volta = await lerTudo(B);
  R.t('a reunião voltou com as falas', Object.keys(volta).filter((k) => k.startsWith('reuniao:')).length === 1 && /versão velha/.test(JSON.stringify(volta)));
  R.t('a pauta voltou', Object.values(volta.pautas || {}).some((p) => p.titulo === 'Pauta da versão velha'));
  R.t('os ajustes voltaram', volta.ajustes && volta.ajustes.salvarChat === true);
  await pn.ev(`document.getElementById('ajArquivo').value = ''`);
  await pn.send('DOM.setFileInputFiles', { files: [arquivoJson], nodeId });
  await esp(1500);
  const msg2 = await pn.ev(`document.getElementById('ajBackupMsg').textContent`);
  R.t('importar o mesmo arquivo de novo não duplica nada', /Nada novo|Nothing new/.test(msg2) && Object.keys(await lerTudo(B)).filter((k) => k.startsWith('reuniao:')).length === 1, msg2);
  // arquivo que não é do Talktrail
  const lixo = path.join(path.dirname(arquivoJson), 'lixo.json'); fs.writeFileSync(lixo, '{"a":1}');
  await pn.ev(`document.getElementById('ajArquivo').value = ''`);
  await pn.send('DOM.setFileInputFiles', { files: [lixo], nodeId }); await esp(1200);
  R.t('arquivo que não é cópia do Talktrail é recusado com aviso', /não é uma cópia|not a Talktrail/i.test(await pn.ev(`document.getElementById('ajBackupMsg').textContent`)));
  R.t('nenhum erro no painel durante o backup', pn.erros.length === 0, pn.erros.join(' | '));
  await pn.fecha();
  R.fim();
  B.fechar(); await meet.fechar();
})().catch((e) => { console.error(e); process.exit(2); });
