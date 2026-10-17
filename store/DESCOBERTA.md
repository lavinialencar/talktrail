# Como fazer o Talktrail ser achado

Sem landing page, a página da Chrome Web Store é a vitrine. A busca da loja olha o nome, a descrição curta, a descrição longa e as avaliações. Nada disso é pago nem precisa de ferramenta.

## Na página da loja

- [ ] Nome com a palavra que a pessoa digita: "Talktrail: transcrição do Google Meet" (a loja aceita um complemento depois do nome).
- [ ] Primeira frase da descrição curta com as palavras de busca: "Google Meet", "transcrição", "legendas", "Markdown".
- [ ] Descrição longa com essas mesmas palavras em frases normais, sem lista de palavras soltas (a loja pune).
- [ ] Listagem em inglês também. A busca em inglês é a maior: "Google Meet transcript", "Meet captions saver", "meeting notes Markdown".
- [ ] 5 capturas de tela com legenda curta e o logo (arte pronta em `store/out/marfim`).
- [ ] Vídeo curto de 30 a 60 s no YouTube mostrando: entrar na reunião, texto ao vivo, arquivo salvo.
- [ ] Categoria Produtividade.

## Fora da loja

- [ ] README do GitHub com os mesmos termos e o link da loja no topo (o repositório já é público).
- [ ] Post de lançamento: Product Hunt, Reddit (r/productivity, r/chrome_extensions, r/brasil quando fizer sentido), comunidades de freelas e de quem usa Meet.
- [ ] Pedir avaliação a quem usar de verdade. Avaliação e número de usuários empurram a posição na loja.
- [ ] Responder toda avaliação, inclusive as ruins.

## Depois de publicar

- [ ] Olhar o painel do desenvolvedor: visualizações da página, instalações e de onde vêm.
- [ ] Ajustar o texto pelas buscas que trazem gente. A loja demora de dias a semanas pra indexar.

## O que atrapalha

- Nome parecido com marca registrada de outro (por isso a busca de marca "Talktrail" ainda vale antes de publicar).
- Prometer o que a extensão não faz, citar o Google como parceiro ou usar o logo do Meet.
- Permissões demais: a extensão pede poucas, o que ajuda na revisão e na confiança.

## Google e IA (SEO e GEO)

Pra aparecer no Google e nas respostas de ChatGPT, Claude, Perplexity e afins, o que conta é ter páginas claras que respondam à pergunta que a pessoa faz ("extensão pra transcrever Google Meet", "Google Meet transcript Chrome extension privacy", "pauta de reunião Google Meet"). A IA cita o que já está no Google e em páginas conhecidas.

Depois que a loja aprovar (precisa do link definitivo):
- [ ] **README em inglês** (`README.en.md`) com as mesmas palavras de busca, no topo o link da loja. IA e Google internacional leem inglês primeiro.
- [ ] **GitHub:** descrição curta do repositório, site (link da loja) e tópicos: `google-meet`, `transcription`, `chrome-extension`, `meeting-notes`, `markdown`, `local-first`, `privacy`, `agenda`.
- [ ] **Perguntas e respostas no README** (FAQ): "funciona sem conta?", "onde ficam os dados?", "funciona com Zoom?" (não), "como uma IA edita a pauta?". Respostas curtas e diretas são o que a IA copia.
- [ ] **Onde a IA costuma citar:** post no Reddit (r/chrome_extensions, r/productivity), Product Hunt, AlternativeTo (cadastrar como alternativa a Otter, Fireflies e Tactiq, destacando "local e grátis"), listas "awesome" de extensões.
- [ ] **Texto da loja** com as frases que as pessoas digitam (já tem "Google Meet", "transcrição", "legendas", "Markdown"); na versão em inglês: "Google Meet transcript", "captions", "meeting notes", "agenda", "local", "no account".
- [ ] Uma **página com endereço próprio** pesa mais no Google do que só o GitHub: a landing page adiada volta a valer quando houver tráfego ou pedido de empresa. Até lá, o README em inglês e a página da loja fazem esse papel.
- [ ] Dar um mês pro Google indexar. Conferir buscando por "site:github.com/lavinialencar/talktrail" e pelas frases de busca.
