# Publicar na Chrome Web Store: passo a passo com tudo pra colar

O painel do desenvolvedor da loja não aceita ser conduzido por automação (a própria loja bloqueia), então este roteiro é pra você seguir com tudo pronto pra copiar. Pacote: `dist/talktrail-1.21.0.zip`. Arte: `store/out/marfim/`.

## 0. Antes (só você faz)
1. Entre em https://chrome.google.com/webstore/devconsole com a conta que será a dona da extensão.
2. Primeira vez: aceite o contrato do desenvolvedor, pague a taxa única de **US$5** e confirme o e-mail.
3. Busque "Talktrail" na loja e nas bases de marca (WIPO, INPI) antes de enviar.

## 1. Novo item
**Novo item** → envie `dist/talktrail-1.21.0.zip`.

## 2. Aba "Listagem"
- **Idioma:** Português (Brasil). A listagem em inglês só depois da interface em inglês.
- **Título:** `Talktrail` (a loja pega do manifest)
- **Resumo (132 caracteres):**
  `Transcrição do Google Meet salva no seu computador, em Markdown. Sem conta, sem nuvem, sem telemetria.`
- **Descrição:** cole a "Descrição longa (português)" de `store/LISTAGEM.md`.
- **Categoria:** Produtividade
- **Ícone:** `store/out/marfim/icone-loja-128.png`
- **Capturas (5):** `captura-1-transcricao.png`, `captura-2-arquivo.png`, `captura-3-agenda-pauta.png`, `captura-4-pautas.png`, `captura-5-privacidade.png`
- **Tile pequeno:** `tile-440x280-pt.png`; **Marquee (opcional):** `marquee-1400x560-pt.png`
- **Site oficial / suporte:** https://github.com/lavinialencar/talktrail e `talktrail@lavinialencar.com.br`

## 3. Aba "Privacidade"
- **Propósito único:** Transcrever reuniões do Google Meet a partir das legendas da própria chamada e salvar o texto localmente.
- **Justificativa das permissões:** cole a tabela de `store/LISTAGEM.md` (sidePanel, storage, unlimitedStorage, downloads, alarms, hosts do Meet e 127.0.0.1:8787).
- **Código remoto:** não usa.
- **Dados do usuário:** não coleta nem transmite nada. Tudo fica no computador. Marque as três declarações de conformidade (não vende, não usa fora do propósito, não usa pra crédito).
- **Política de privacidade:** https://github.com/lavinialencar/talktrail/blob/main/PRIVACIDADE.md

## 4. Aba "Distribuição"
- Visibilidade: Pública. Regiões: todas.
- **Instruções pro revisor (se pedir):** "A extensão lê as legendas do Google Meet em meet.google.com. Para testar, entre em qualquer reunião do Meet, ative as legendas e clique em Transcrever no painel lateral. Nada é enviado pra fora do computador."

## 5. Enviar pra revisão
Clique em **Enviar para revisão**. Costuma levar de alguns dias a umas semanas. Depois de aprovada, a loja mostra o endereço definitivo da extensão: coloque esse link no README e na página do Buy Me a Coffee.

## Depois de publicar
- ID novo da extensão (a loja gera): os links `chrome-extension://...` de teste mudam.
- Buy Me a Coffee: falta conectar o recebimento (Stripe) pra página aceitar apoio.
