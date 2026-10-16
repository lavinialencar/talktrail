# Talktrail: texto da listagem na Chrome Web Store

Rascunho para colar no painel do desenvolvedor. Nada foi enviado nem publicado.

## Nome

Talktrail

## Descrição curta (limite 132 caracteres)

**Português:** Transcrição do Google Meet salva no seu computador, em Markdown. Sem conta, sem nuvem, sem telemetria.

**English:** Google Meet transcripts saved on your computer as Markdown. No account, no cloud, no telemetry.

## E-mail de suporte

talktrail@lavinialencar.com.br

## Categoria

Produtividade (Productivity)

## Descrição longa (português)

Talktrail transforma as legendas do Google Meet em um arquivo de texto no seu computador.

O que ele faz
• Oferece transcrever quando você entra na chamada e liga as legendas sozinho.
• Mostra o texto ao vivo num painel ao lado da chamada, com quem falou e quando.
• Notas e pauta no mesmo painel. Uma página de Pautas mostra as próximas reuniões num calendário: escolha a reunião, escreva a pauta e ela carrega sozinha quando você entrar na sala. As reuniões vêm da tela inicial do Meet, e o ícone mostra quanto falta pra próxima. Funciona também fora do Meet.
• Marcadores de momento por atalho de teclado.
• Salva cada reunião como um arquivo .md, com título, tags, data, duração e participantes.
• Pautas em arquivos: com uma pasta escolhida, cada pauta também vira um .md na subpasta Pautas/. Você ou uma IA edita o arquivo e a pauta muda na extensão, e o contrário também.
• Cópia de segurança: exporte e importe reuniões, pautas e ajustes num arquivo só.

Privacidade
Tudo fica no seu computador. Não tem conta, não tem nuvem e não tem telemetria. A extensão lê as legendas que o próprio Meet já mostra e guarda o texto aqui, na pasta que você escolher.

Bom saber
• As legendas precisam estar ligadas. A extensão liga sozinha quando o organizador permite.
• Avise as pessoas da reunião que você está transcrevendo.
• Talktrail não é afiliado ao Google. Google Meet é marca do Google LLC.

## Long description (English)

Talktrail turns Google Meet captions into a text file on your computer.

What it does
• Offers to transcribe when you join a call and turns captions on for you.
• Shows the live text in a side panel next to the call, with who spoke and when.
• Notes and agenda in the same panel. An Agendas page lists your upcoming meetings in a calendar: pick a meeting, write its agenda, and it loads by itself when you join the room. Meetings come from the Meet home page, and the icon shows the countdown to the next one. It also works outside Meet.
• Keyboard shortcut to mark moments.
• Saves each meeting as a .md file with title, tags, date, duration and participants.
• Agendas as files: with a folder chosen, each agenda also becomes a .md file in the Pautas/ subfolder. You or an AI edit the file and the agenda updates in the extension, and the other way around.
• Backup: export and import meetings, agendas and settings in a single file.

Privacy
Everything stays on your computer. No account, no cloud, no telemetry. The extension reads the captions Meet already shows and stores the text locally, in the folder you choose.

Good to know
• Captions must be on. The extension turns them on when the organizer allows it.
• Let the people in the meeting know you are transcribing.
• Talktrail is not affiliated with Google. Google Meet is a trademark of Google LLC.

> Observação: o painel da extensão ainda está só em português. A descrição em inglês só deve ir pra loja depois da interface em inglês (i18n), senão a pessoa instala e encontra tudo em português.

## URL da política de privacidade

https://github.com/lavinialencar/talktrail/blob/main/PRIVACIDADE.md

## Propósito único (single purpose)

Transcrever reuniões do Google Meet a partir das legendas da própria chamada e salvar o texto localmente.

## Justificativa das permissões

| Permissão | Para que serve |
|---|---|
| `sidePanel` | Mostrar o painel com o texto ao vivo, as notas e a pauta ao lado da chamada. |
| `storage` e `unlimitedStorage` | Guardar a biblioteca de reuniões, as notas e os ajustes no próprio navegador. Reuniões longas passam do limite padrão. |
| `downloads` | Salvar o arquivo .md da reunião em Downloads (modo simples). |
| `alarms` | Rotina de limpeza das reuniões antigas, só se a pessoa ativou. |
| `host: https://meet.google.com/*` | Ler as legendas da chamada e mostrar o aviso e o botão flutuante. |
| `host: http://127.0.0.1:8787/*` | Falar com o servidor local opcional (pasta ao vivo). Nada sai da máquina. |

## Pendências antes de enviar

Feito em 13/10/2026 (versão 1.13.0):
- [x] Instalador fora do pacote: `python3 tools/empacotar.py` gera `dist/talktrail-1.13.0.zip` sem `complemento/`, sem scripts executáveis e sem a recarga de desenvolvimento.
- [x] Recarga de desenvolvimento isolada em `dev-hot.js`, só carregada quando o `version_name` tem "dev"; o pacote não leva.
- [x] Permissão `tabs` removida (o host do Meet já dá acesso à URL das abas do Meet).
- [x] Política de privacidade em `PRIVACIDADE.md` (português e inglês), `LICENSE` (MIT) e `AVISOS-DE-TERCEIROS.md`.
- [x] Arte revisada pelo impeccable (sem eyebrow, sem caixa-alta mono, texto de apoio a 12 px, sombra do aviso neutra).

Feito em 16/10/2026 ("copiar a pauta da última vez" foi tirada por decisão dela: recurso arriscado): pacote `dist/talktrail-1.20.0.zip` (385 KB) gerado e conferido; boas-vindas na instalação, página de Pautas, cópia de segurança.

Falta:
1. Preencher `URL_COMPLEMENTO` em `extension/panel.js` com a página de releases do GitHub (enquanto vazio, o botão de instalar some no pacote da loja).
2. ~~Publicar `PRIVACIDADE.md` numa URL pública~~ Feito em 14/10/2026: repositório público, URL acima.
3. Interface em inglês antes da listagem em inglês.
4. Link do Buy Me a Coffee. (E-mail de suporte feito em 14/10/2026: talktrail@lavinialencar.com.br, encaminha para o e-mail work pela Cloudflare Email Routing.)
5. Ela buscar "Talktrail" na loja e nas bases de marca (WIPO, INPI).

## Arte (pasta `out/marfim/`, recomendada; `out/grafite/` é a alternativa)

O teal fica só no logo e nos detalhes, nunca como fundo (pedido dela).

| Arquivo | Uso na loja |
|---|---|
| `icone-loja-128.png` | Ícone da loja, 128×128 (arte em 96 com respiro). |
| `tile-440x280-pt.png` / `-en.png` | Tile promocional pequeno, 440×280. |
| `marquee-1400x560-pt.png` / `-en.png` | Marquee, 1400×560 (opcional). |
| `captura-1` a `captura-5` | Capturas, 1280×800 (as 5 que a loja aceita): transcrição, arquivo .md, agenda e pauta no painel, página de Pautas com o arquivo, privacidade. Extensão real em dados fictícios (`node store/capturar.js`). |

As versões `-en` só trocam o texto da arte; o painel dentro delas segue em português até a interface ser traduzida.

Para regerar: servidor estático na raiz do repositório (`python3 -m http.server 8799`) e `node store/capturar.js` (tira as imagens do painel e da página de Pautas com a extensão real) e depois `python3 store/gerar.py marfim` (ou `grafite`).
