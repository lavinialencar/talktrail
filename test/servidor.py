"""Bateria de entrada hostil e absurda contra o servidor local.
Uso: python3 test/servidor.py   (sobe o servidor sozinho, numa pasta temporária e porta livre)
"""
import http.client
import json
import os
import re
import socket
import sys
import tempfile
import threading
import time
import unittest

TMP = tempfile.mkdtemp(prefix="talktrail-")
with socket.socket() as s:
    s.bind(("127.0.0.1", 0))
    PORT = s.getsockname()[1]
ESTADO = tempfile.mkdtemp(prefix="talktrail-estado-")
os.environ["TALKTRAIL_OUT"] = TMP
os.environ["TALKTRAIL_PORT"] = str(PORT)
os.environ["TALKTRAIL_ESTADO"] = ESTADO
os.environ.pop("TALKTRAIL_ORGANIZAR", None)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server"))
import talktrail_server as m  # noqa: E402

srv = m.ThreadingHTTPServer(("127.0.0.1", PORT), m.H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
HOST = f"127.0.0.1:{PORT}"
ORIGEM = "chrome-extension://abcdefghijklmnopabcdefghijklmnop"
_n = [0]
TOKEN = None


def post(payload, headers=None, raw=None, path="/save", host=HOST, content_length=None):
    h = {"Host": host, "X-Talktrail": "1", "Content-Type": "application/json", "Origin": ORIGEM}
    if TOKEN and path == "/save":
        h["X-Meet-Token"] = TOKEN
    h.update(headers or {})
    h = {k: v for k, v in h.items() if v is not None}
    body = raw if raw is not None else json.dumps(payload).encode()
    if content_length is not None:
        h["Content-Length"] = str(content_length)
    c = http.client.HTTPConnection("127.0.0.1", PORT, timeout=10)
    c.putrequest("POST", path, skip_host=True, skip_accept_encoding=True)
    for k, v in h.items():
        c.putheader(k, v)
    if "Content-Length" not in h:
        c.putheader("Content-Length", str(len(body)))
    c.endheaders()
    c.send(body)
    r = c.getresponse()
    d = r.read()
    c.close()
    try:
        return r.status, json.loads(d)
    except Exception:
        return r.status, d


def get(path, host=HOST, headers=None):
    c = http.client.HTTPConnection("127.0.0.1", PORT, timeout=10)
    c.putrequest("GET", path, skip_host=True, skip_accept_encoding=True)
    c.putheader("Host", host)
    for k, v in (headers or {}).items():
        c.putheader(k, v)
    c.endheaders()
    r = c.getresponse()
    d = r.read()
    c.close()
    return r.status, d


st0, r0 = post({}, path="/pair")
assert st0 == 200, r0
TOKEN = r0["token"]


def novo(**kw):
    _n[0] += 1
    base = {"id": f"s{_n[0]}-{time.time_ns()}", "startedAt": "2026-10-11T22:00:00Z", "titulo": "Reunião", "transcript": [], "marcas": []}
    base.update(kw)
    return base


def arquivos():
    """Caminhos relativos de todos os .md, inclusive nas subpastas de mês."""
    out = []
    for raiz, _, fs in os.walk(TMP):
        for f in fs:
            if f.endswith(".md"):
                out.append(os.path.relpath(os.path.join(raiz, f), TMP))
    return sorted(out)


def ler(nome):
    with open(os.path.join(TMP, nome), encoding="utf-8") as f:
        return f.read()


def frontmatter(texto):
    """Lê o cabeçalho como um parser estrito: cada linha 'chave: valor', valores com aspas são JSON."""
    assert texto.startswith("---\n"), "arquivo não começa com ---"
    fim = texto.index("\n---\n", 4)
    out = {}
    for linha in texto[4:fim].split("\n"):
        assert re.match(r"^[a-z_]+: ", linha), f"linha de cabeçalho inválida: {linha!r}"
        k, v = linha.split(": ", 1)
        out[k] = json.loads(v) if v and v[0] in '"[' else v
    return out, texto[fim + 5:]


def estrutura_ok(corpo):
    """As seções do arquivo têm que aparecer exatamente uma vez e na ordem."""
    h2 = [l for l in corpo.split("\n") if l.startswith("## ")]
    h2 = [l for l in h2 if l != "## Chat da reunião"]  # seção opcional, só aparece com chat salvo
    return h2 == ["## Resumo", "## Pauta", "## Notas", "## Momentos marcados", "## Transcrição"]


class Titulos(unittest.TestCase):
    CASOS = {
        "emoji": "Kickoff 🚀🔥 do projeto 😀",
        "emoji ZWJ e bandeiras": "👨‍👩‍👧‍👦 🇧🇷 🏳️‍🌈 reunião",
        "japonês": "週次ミーティング 会議",
        "árabe (RTL)": "اجتماع الفريق الأسبوعي",
        "hebraico (RTL)": "פגישת צוות",
        "cirílico": "Еженедельная встреча команды",
        "grego": "Εβδομαδιαία συνάντηση",
        "RTL override": "reunião ‮atnemidnoc‬ final",
        "combinando acentos (NFD)": "Reuniã̃o de acaó e café",
        "só pontuação": "!!! ??? ...",
        "nome reservado CON": "CON",
        "nome reservado nul.txt": "nul.txt",
        "ponto no fim": "reunião...",
        "espaços no fim": "reunião   ",
        "traversal": "../../../etc/passwd",
        "traversal windows": "..\\..\\Windows\\System32",
        "barra": "a/b\\c:d*e?f\"g<h>i|j",
        "aspas e barra invertida": 'ele disse "oi" \\ fim',
        "dois pontos e colchetes": "tag: [a, b] {c: d}",
        "YAML malicioso": "x\n---\ntipo: hack\n...",
        "quebra de linha": "Linha um\n## Resumo\nLinha dois",
        "título com cerquilha": "# Título falso",
        "NUL e controle": "a\x00b\x01c\x1fd\x7fe",
        "separador unicode": "a b c",
        "espaços invisíveis": "​​​",
        "vazio": "",
        "só espaços": "     ",
        "html/script": "<script>alert(1)</script><img src=x onerror=alert(1)>",
        "markdown": "**negrito** _itálico_ [link](http://x) `código` ![i](x)",
        "SQL": "'; DROP TABLE reunioes; --",
        "template": "{{7*7}} ${jndi:ldap://x} %s %n",
        "muito longo (10 mil letras)": "A" * 10000,
        "muito longo com emoji (3 mil)": "😀" * 3000,
        "muito longo multibyte": "ç" * 5000,
    }

    def test_todos(self):
        for nome, titulo in self.CASOS.items():
            with self.subTest(nome):
                antes = set(arquivos())
                st, r = post(novo(titulo=titulo, tags=["a"], notes="x", cola="y"))
                self.assertEqual(st, 200, f"{nome}: {r}")
                novos = set(arquivos()) - antes
                self.assertEqual(len(novos), 1, f"{nome}: criou {novos}")
                rel = novos.pop()
                pasta, f = os.path.split(rel)
                self.assertRegex(pasta, r"^\d{4}-\d{2}$", f"{nome}: fora da pasta do mês: {rel!r}")
                self.assertTrue(len(f.encode("utf-8")) <= 200, f"{nome}: nome com {len(f.encode('utf-8'))} bytes")
                self.assertNotIn("/", f)
                self.assertNotIn("\\", f)
                self.assertFalse(f.startswith("."), f)
                self.assertFalse(re.search(r"[<>:\"|?*\x00-\x1f]", f), f"{nome}: nome com caractere proibido {f!r}")
                self.assertFalse(f[:-3].endswith((" ", ".")), f)
                self.assertTrue(os.path.realpath(os.path.join(TMP, rel)).startswith(os.path.realpath(TMP) + os.sep))
                fm, corpo = frontmatter(ler(rel))
                self.assertEqual(fm["tipo"], "reuniao")
                self.assertTrue(estrutura_ok(corpo), f"{nome}: estrutura quebrada\n{corpo[:400]}")
                self.assertEqual(len([l for l in corpo.split("\n") if l.startswith("# ")]), 1, f"{nome}: mais de um título")


class Conteudo(unittest.TestCase):
    def test_nota_gigante(self):
        st, r = post(novo(notes="linha de nota\n" * 70000))  # ~1 MB
        self.assertEqual(st, 200, r)

    def test_nota_de_mil_caracteres_numa_linha(self):
        st, r = post(novo(notes="x" * 1000))
        self.assertEqual(st, 200)

    def test_nota_de_um_mega_numa_linha(self):
        t0 = time.time()
        st, r = post(novo(notes="palavra " * 130000))
        self.assertEqual(st, 200, r)
        self.assertLess(time.time() - t0, 5)

    def test_corpo_acima_do_limite_diz_o_motivo(self):
        st, r = post(novo(notes="x" * (m.MAX_BODY + 10)))
        self.assertEqual(st, 413)
        self.assertIn("erro", r)

    def test_estrutura_nao_quebra_com_texto_de_fala_maluco(self):
        falas = ["## Resumo", "# Título", "---", "```", "> citação", "- item", "1. um", "| a | b |", "<!-- x -->", "---\ntipo: x\n---"]
        linhas = [{"t": i, "speaker": "Ana", "text": f} for i, f in enumerate(falas)]
        st, _ = post(novo(transcript=linhas))
        self.assertEqual(st, 200)
        f = arquivos()[-1]
        fm, corpo = frontmatter(ler(f))
        self.assertTrue(estrutura_ok(corpo), corpo[:600])

    def test_nome_de_participante_maluco(self):
        nomes = ["Ana\n## Notas", "**x**", "a" * 5000, "😀 Zé", "", None, 123, "<b>x</b>"]
        linhas = [{"t": i, "speaker": n, "text": "oi"} for i, n in enumerate(nomes)]
        st, r = post(novo(transcript=linhas))
        self.assertEqual(st, 200, r)
        fm, corpo = frontmatter(ler(arquivos()[-1]))
        self.assertTrue(estrutura_ok(corpo), corpo[:600])

    def test_chat_da_reuniao(self):
        chat = [{"t": 5, "speaker": "Ana", "text": "link https://x.com"}, {"t": 9, "speaker": "Zé\n## Notas", "text": "## Resumo\n---"},
                {"t": "abc", "speaker": None, "text": "ok"}, "solto", None, {"text": ""}]
        st, r = post(novo(chat=chat))
        self.assertEqual(st, 200, r)
        fm, corpo = frontmatter(ler(arquivos()[-1]))
        self.assertTrue(estrutura_ok(corpo), corpo[:700])
        self.assertIn("## Chat da reunião", corpo)
        self.assertEqual(len([l for l in corpo.split("\n") if l.startswith("- [") and "Ana:" in l]), 1)
        st, r = post(novo(chat="texto"))
        self.assertEqual(st, 200)
        st, r = post(novo(chat=[{"t": 1, "speaker": "a", "text": "x"}] * 5000))
        self.assertEqual(st, 200)

    def test_marcador_maluco(self):
        st, r = post(novo(marcas=[{"t": "abc", "texto": "a\n## Resumo"}, {"t": -5, "texto": None}, {"t": 1e12, "texto": "x"}, "texto solto", None]))
        self.assertEqual(st, 200, r)
        fm, corpo = frontmatter(ler(arquivos()[-1]))
        self.assertTrue(estrutura_ok(corpo), corpo[:600])

    def test_tags_absurdas(self):
        casos = [None, "texto", 5, [None, 3, {"a": 1}, ["x"]], ["a" * 5000] * 3, ["tag" + str(i) for i in range(500)], [",,,", ";;", "#", " "]]
        for tags in casos:
            with self.subTest(tags=str(tags)[:40]):
                st, r = post(novo(tags=tags))
                self.assertEqual(st, 200, r)
                fm, corpo = frontmatter(ler(arquivos()[-1]))
                self.assertLessEqual(len(fm["tags"]), 20)
                for t in fm["tags"]:
                    self.assertLessEqual(len(t), 60)

    def test_tipos_errados(self):
        casos = [
            {"transcript": "texto"}, {"transcript": None}, {"transcript": [None, 1, "x", {"t": "a"}]},
            {"marcas": "x"}, {"notes": 123}, {"notes": ["a"]}, {"cola": {"a": 1}}, {"titulo": 12345}, {"titulo": None},
            {"titulo": ["a"]}, {"url": {"a": 1}}, {"projeto": 5}, {"endedAt": "não é data"}, {"endedAt": 123},
        ]
        for extra in casos:
            with self.subTest(extra=str(extra)[:50]):
                st, r = post(novo(**extra))
                self.assertIn(st, (200, 400), f"{extra} -> {st} {r}")

    def test_datas_invalidas(self):
        for d in ["ontem", "", "2026-13-45T99:99:99Z", None, 0, "9999-12-31T23:59:59Z", "0001-01-01T00:00:00Z"]:
            with self.subTest(d=d):
                st, r = post(novo(startedAt=d))
                self.assertIn(st, (200, 400), f"{d!r} -> {st} {r}")

    def test_terapia_nao_e_bloqueada_a_decisao_de_gravar_e_do_usuario(self):
        for tit in ["Terapia", "Psicólogo", "Therapy"]:
            st, r = post(novo(titulo=tit))
            self.assertEqual(st, 200, f"{tit}: {r}")


class Seguranca(unittest.TestCase):
    def test_sem_cabecalho(self):
        st, _ = post(novo(), headers={"X-Talktrail": None})
        self.assertEqual(st, 403)

    def test_sem_codigo_secreto(self):
        st, r = post(novo(), headers={"X-Meet-Token": None})
        self.assertEqual(st, 403)
        self.assertTrue(r.get("parear"))

    def test_codigo_errado(self):
        for tk in ["", "x", TOKEN[:-1], TOKEN + "a", TOKEN.upper(), "0" * len(TOKEN)]:
            with self.subTest(tk=tk[:6]):
                st, _ = post(novo(), headers={"X-Meet-Token": tk})
                self.assertEqual(st, 403)

    def test_codigo_certo_mas_de_outra_extensao(self):
        st, _ = post(novo(), headers={"Origin": "chrome-extension://zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"})
        self.assertEqual(st, 403)

    def test_pareamento_da_mesma_extensao_e_idempotente(self):
        st, r = post({}, path="/pair")
        self.assertEqual((st, r["token"]), (200, TOKEN))

    def test_outra_extensao_nao_consegue_parear(self):
        st, r = post({}, path="/pair", headers={"Origin": "chrome-extension://zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"})
        self.assertEqual(st, 403)
        self.assertNotIn("token", r)

    def test_pagina_web_nao_consegue_parear(self):
        for o in ["https://evil.com", "http://localhost:3000", "null", f"http://127.0.0.1:{PORT}"]:
            with self.subTest(o=o):
                st, r = post({}, path="/pair", headers={"Origin": o})
                self.assertEqual(st, 403)

    def test_arquivo_de_estado_so_o_dono_le(self):
        modo = os.stat(os.path.join(ESTADO, "pareamento.json")).st_mode & 0o777
        self.assertEqual(modo, 0o600)

    def test_host_errado_rebinding(self):
        for h in ["evil.com", "evil.com:8787", "127.0.0.1", "localhost", f"127.0.0.1.evil.com:{PORT}", f"evil.com:{PORT}", ""]:
            with self.subTest(h=h):
                st, _ = post(novo(), host=h)
                self.assertEqual(st, 403)

    def test_origem_de_pagina_web_recusada(self):
        for o in ["https://evil.com", "http://localhost:3000", "null", "https://meet.google.com"]:
            with self.subTest(o=o):
                st, _ = post(novo(), headers={"Origin": o})
                self.assertEqual(st, 403, f"Origin {o} aceita")

    def test_pagina_de_configuracao(self):
        st, corpo = get("/")
        self.assertEqual(st, 200)
        self.assertIn("Talktrail", corpo.decode())
        self.assertIn("Carregar sem compactação", corpo.decode())
        st, _ = get("/", host="evil.com")
        self.assertEqual(st, 403)

    def test_health_diz_se_esta_pareado(self):
        st, d = get("/health")
        self.assertEqual(st, 200)
        self.assertTrue(json.loads(d)["pareado"])

    def test_config_so_da_propria_pagina_ou_da_extensao_pareada(self):
        casa = os.path.expanduser("~")
        pasta = os.path.join(casa, "talktrail-teste-pasta")
        try:
            for o in ["https://evil.com", "null"]:
                st, _ = post({"pasta": pasta}, path="/config", headers={"Origin": o})
                self.assertEqual(st, 403, o)
            st, _ = post({"pasta": "/etc"}, path="/config", headers={"Origin": f"http://127.0.0.1:{PORT}"})
            self.assertEqual(st, 400)
            st, _ = post({"pasta": "../../etc"}, path="/config", headers={"Origin": f"http://127.0.0.1:{PORT}"})
            self.assertEqual(st, 400)
            st, r = post({"pasta": pasta}, path="/config", headers={"Origin": f"http://127.0.0.1:{PORT}"})
            self.assertEqual((st, r.get("pasta")), (200, pasta), r)
        finally:
            m.OUT = TMP  # volta pra pasta de teste
            import shutil
            shutil.rmtree(pasta, ignore_errors=True)
            try:
                os.remove(os.path.join(ESTADO, "config.json"))
            except OSError:
                pass

    def test_pautas_em_arquivo(self):
        h = {"X-Meet-Token": TOKEN}
        # sem pareamento ou de origem errada: negado
        for hh in [{}, {"Origin": "https://evil.com", "X-Meet-Token": TOKEN}, {"X-Meet-Token": "errado"}]:
            st, _ = post({}, path="/pautas/listar", headers=hh)
            self.assertEqual(st, 403, hh)
        st, r = post({}, path="/pautas/listar", headers=h)
        self.assertEqual((st, r.get("arquivos")), (200, []))
        conteudo = '---\ntitulo: "Daily"\ndata: 2026-10-20\n---\n\n1. ponto A\n'
        st, r = post({"nome": "2026-10-20_daily.md", "conteudo": conteudo}, path="/pautas/gravar", headers=h)
        self.assertEqual((st, r.get("ok")), (200, True), r)
        self.assertTrue(os.path.isfile(os.path.join(TMP, "Pautas", "2026-10-20_daily.md")))
        st, r = post({}, path="/pautas/listar", headers=h)
        self.assertEqual([a["nome"] for a in r["arquivos"]], ["2026-10-20_daily.md"])
        self.assertEqual(r["arquivos"][0]["conteudo"], conteudo)
        self.assertGreater(r["arquivos"][0]["mtime"], 1_700_000_000_000)
        # nomes perigosos e conteúdo absurdo são recusados
        for nome in ["../fora.md", "a/b.md", "..\\x.md", ".oculto.md", "sem-extensao", "x.txt", "", None, 5, "a" * 200 + ".md", "c:evil.md", "a\x00b.md"]:
            st, _ = post({"nome": nome, "conteudo": "x"}, path="/pautas/gravar", headers=h)
            self.assertEqual(st, 400, repr(nome))
        st, _ = post({"nome": "grande.md", "conteudo": "x" * 250_000}, path="/pautas/gravar", headers=h)
        self.assertEqual(st, 400)
        st, _ = post({"nome": "ok.md", "conteudo": 5}, path="/pautas/gravar", headers=h)
        self.assertEqual(st, 400)
        self.assertFalse(os.path.exists(os.path.join(TMP, "fora.md")))
        # arquivo editado por fora (a IA) aparece na lista; apagar remove só dentro de Pautas
        with open(os.path.join(TMP, "Pautas", "2026-10-21_nova.md"), "w", encoding="utf-8") as f:
            f.write("---\ntitulo: Nova\ndata: 2026-10-21\n---\ntexto da IA")
        st, r = post({}, path="/pautas/listar", headers=h)
        self.assertEqual(len(r["arquivos"]), 2)
        st, _ = post({"nome": "2026-10-21_nova.md"}, path="/pautas/apagar", headers=h)
        self.assertEqual(st, 200)
        st, _ = post({"nome": "../x.md"}, path="/pautas/apagar", headers=h)
        self.assertEqual(st, 400)
        st, r = post({}, path="/pautas/listar", headers=h)
        self.assertEqual([a["nome"] for a in r["arquivos"]], ["2026-10-20_daily.md"])
        # uma cópia por dia fica em Pautas/_copias/AAAA-MM-DD
        copias = os.path.join(TMP, "Pautas", "_copias", time.strftime("%Y-%m-%d"))
        self.assertTrue(os.path.isfile(os.path.join(copias, "2026-10-20_daily.md")), os.listdir(os.path.join(TMP, "Pautas")))
        # apagar nunca apaga de vez: o arquivo vai pra Pautas/_apagadas
        st, _ = post({"nome": "2026-10-20_daily.md"}, path="/pautas/apagar", headers=h)
        self.assertEqual(st, 200)
        guardados = os.listdir(os.path.join(TMP, "Pautas", "_apagadas"))
        self.assertTrue(any(n.endswith("_2026-10-20_daily.md") for n in guardados), guardados)
        # a pasta de reuniões fora do ar (disco que não montou) é erro, nunca "lista vazia"
        original = m.OUT
        try:
            m.OUT = os.path.join(TMP, "nao-existe")
            st, r = post({}, path="/pautas/listar", headers=h)
            self.assertEqual(st, 503, r)
        finally:
            m.OUT = original
        st, r = post({}, path="/pautas/listar", headers=h)
        self.assertEqual((st, r.get("arquivos")), (200, []))

    def test_reset_so_da_propria_pagina(self):
        for o in ["https://evil.com", "null", ORIGEM, "chrome-extension://zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"]:
            with self.subTest(o=o):
                st, _ = post({}, path="/reset", headers={"Origin": o})
                self.assertEqual(st, 403)
        # a própria página consegue, e depois a próxima extensão pareia
        global TOKEN
        st, _ = post({}, path="/reset", headers={"Origin": f"http://127.0.0.1:{PORT}"})
        self.assertEqual(st, 200)
        st, r = post({}, path="/pair", headers={"Origin": "chrome-extension://novaextensaonovaextensaonovaext"})
        self.assertEqual(st, 200)
        self.assertNotEqual(r["token"], TOKEN)
        # volta ao estado original dos outros testes
        post({}, path="/reset", headers={"Origin": f"http://127.0.0.1:{PORT}"})
        st, r = post({}, path="/pair")
        TOKEN = r["token"]

    def test_seletor_de_pasta_do_sistema(self):
        self.assertEqual(m.comando_seletor_de_pasta("darwin")[0], "osascript")
        self.assertEqual(m.comando_seletor_de_pasta("win32")[0], "powershell")
        antes = m.shutil.which
        try:
            m.shutil.which = lambda p: "/usr/bin/zenity" if p == "zenity" else None
            self.assertEqual(m.comando_seletor_de_pasta("linux")[0], "zenity")
            m.shutil.which = lambda p: None
            self.assertIsNone(m.comando_seletor_de_pasta("linux"))
        finally:
            m.shutil.which = antes

    def test_escolher_pasta_pelo_seletor(self):
        casa = os.path.expanduser("~")
        pasta = os.path.join(casa, "talktrail-teste-escolha")
        orig = m.escolher_pasta
        try:
            for o in ["https://evil.com", "null", "chrome-extension://zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"]:
                m.escolher_pasta = lambda: pasta
                st, _ = post({}, path="/escolher-pasta", headers={"Origin": o})
                self.assertEqual(st, 403, o)
            m.escolher_pasta = lambda: None  # cancelou
            st, r = post({}, path="/escolher-pasta", headers={"Origin": f"http://127.0.0.1:{PORT}"})
            self.assertEqual((st, r.get("cancelado")), (200, True))
            m.escolher_pasta = lambda: pasta
            st, r = post({}, path="/escolher-pasta", headers={"Origin": f"http://127.0.0.1:{PORT}"})
            self.assertEqual((st, r.get("pasta")), (200, pasta), r)
            m.escolher_pasta = lambda: "/etc"  # fora da pasta pessoal
            st, r = post({}, path="/escolher-pasta", headers={"Origin": f"http://127.0.0.1:{PORT}"})
            self.assertEqual(st, 400)
        finally:
            m.escolher_pasta = orig
            m.OUT = TMP
            import shutil
            shutil.rmtree(pasta, ignore_errors=True)
            try:
                os.remove(os.path.join(ESTADO, "config.json"))
            except OSError:
                pass

    def test_plist_de_instalacao(self):
        d = m.plist_launchagent("/usr/bin/python3", "/x/server/talktrail_server.py")
        self.assertEqual(d["ProgramArguments"], ["/usr/bin/python3", "/x/server/talktrail_server.py"])
        self.assertTrue(d["RunAtLoad"] and d["KeepAlive"])

    def test_json_invalido(self):
        for raw in [b"", b"{", b"[]", b"null", b'"texto"', b"123", b"\xff\xfe\x00", b'{"id":1}', b"{" * 5000]:
            with self.subTest(raw=raw[:20]):
                st, _ = post(None, raw=raw)
                self.assertIn(st, (400, 413), f"{raw[:20]!r} -> {st}")

    def test_content_length_mentiroso(self):
        st, _ = post(None, raw=b"{}", content_length=-1)
        self.assertIn(st, (400, 413))

    def test_rotas_e_metodos(self):
        for p in ["/", "/save/../x", "/../etc/passwd", "/save?x=1", "//save"]:
            st, _ = post(novo(), path=p)
            self.assertIn(st, (404, 403, 200), p)
        c = http.client.HTTPConnection("127.0.0.1", PORT, timeout=5)
        for metodo in ["PUT", "DELETE", "PATCH", "OPTIONS"]:
            c.request(metodo, "/save", headers={"Host": HOST})
            r = c.getresponse(); r.read()
            self.assertIn(r.status, (501, 405, 403, 404), metodo)
            c = http.client.HTTPConnection("127.0.0.1", PORT, timeout=5)

    def test_cliente_que_trava_nao_prende_o_servidor(self):
        s = socket.create_connection(("127.0.0.1", PORT))
        s.sendall(b"POST /save HTTP/1.1\r\nHost: " + HOST.encode() + b"\r\nX-Talktrail: 1\r\nContent-Length: 1000\r\n\r\n{")
        st, _ = post(novo())
        self.assertEqual(st, 200)
        s.close()


class Arquivos(unittest.TestCase):
    def test_duas_reunioes_no_mesmo_minuto_com_o_mesmo_nome_nao_se_sobrescrevem(self):
        a = novo(titulo="Daily", notes="reunião A")
        b = novo(titulo="Daily", notes="reunião B")
        self.assertEqual(post(a)[0], 200)
        self.assertEqual(post(b)[0], 200)
        textos = [ler(f) for f in arquivos() if "daily" in f.lower()]
        self.assertTrue(any("reunião A" in t for t in textos), "perdeu a A")
        self.assertTrue(any("reunião B" in t for t in textos), "perdeu a B")

    def test_renomear_nao_apaga_outra(self):
        a = novo(titulo="Alfa", notes="A")
        post(a)
        b = novo(titulo="Beta", notes="B")
        post(b)
        a2 = dict(a, titulo="Beta")  # troca o título pra um nome que já existe
        post(a2)
        textos = " ".join(ler(f) for f in arquivos())
        self.assertIn("- A", textos)
        self.assertIn("- B", textos)

    def test_salvar_a_mesma_sessao_varias_vezes_nao_duplica(self):
        a = novo(titulo="Repetida")
        for i in range(5):
            post(dict(a, notes=f"v{i}"))
        self.assertEqual(len([f for f in arquivos() if "repetida" in f.lower()]), 1)

    def test_concorrencia_mesma_sessao(self):
        a = novo(titulo="Concorrente")
        erros = []

        def tarefa(i):
            st, r = post(dict(a, notes=f"nota {i}"))
            if st != 200:
                erros.append((st, r))

        ts = [threading.Thread(target=tarefa, args=(i,)) for i in range(30)]
        [t.start() for t in ts]
        [t.join() for t in ts]
        self.assertEqual(erros, [])
        fs = [f for f in arquivos() if "concorrente" in f.lower()]
        self.assertEqual(len(fs), 1, fs)
        frontmatter(ler(fs[0]))  # íntegro

    def test_servidor_reiniciado_no_meio_da_reuniao_nao_duplica(self):
        a = novo(titulo="Antes do reinicio", transcript=[{"t": 1, "speaker": "Ana", "text": "oi pessoal"}])
        post(a)
        m.caminhos.clear()  # simula reinício do servidor
        post(dict(a, titulo="Depois do reinicio"))
        fs = [f for f in arquivos() if "reinicio" in f.lower()]
        self.assertEqual(len(fs), 1, fs)

    def test_sem_lixo_tmp(self):
        post(novo(titulo="limpo"))
        self.assertEqual([f for f in os.listdir(TMP) if f.endswith(".tmp")], [])

    def test_pasta_inexistente_e_criada(self):
        import shutil
        shutil.rmtree(TMP)
        st, _ = post(novo(titulo="recriada"))
        self.assertEqual(st, 200)


class Vazias(unittest.TestCase):
    """Reunião sem nada (sem fala, nota, pauta, marcador nem chat) não vira arquivo."""

    def test_reuniao_vazia_nao_cria_arquivo(self):
        antes = arquivos()
        st, r = post(novo(titulo="Vazia total"))
        self.assertEqual((st, r.get("vazia")), (200, True), r)
        st, r = post(novo(titulo="Vazia final", endedAt="2026-10-11T22:05:00Z"))
        self.assertEqual((st, r.get("vazia")), (200, True))
        self.assertEqual(arquivos(), antes)

    def test_so_o_aviso_da_extensao_no_chat_ainda_e_vazia(self):
        antes = arquivos()
        aviso = "Estou transcrevendo esta reunião (só o texto, sem gravar áudio nem vídeo) no meu computador, com o Talktrail."
        st, r = post(novo(titulo="So aviso", chat=[{"t": 1, "speaker": "Chat", "text": aviso}]))
        self.assertEqual((st, r.get("vazia")), (200, True))
        self.assertEqual(arquivos(), antes)

    def test_qualquer_coisa_de_verdade_guarda(self):
        for campo, valor in [("notes", "uma nota"), ("cola", "uma pauta"), ("marcas", [{"t": 3, "texto": "ok"}]), ("transcript", [{"t": 1, "speaker": "Ana", "text": "oi pessoal"}])]:
            antes = len(arquivos())
            st, r = post(novo(titulo="Com " + campo, **{campo: valor}))
            self.assertEqual((st, r.get("vazia")), (200, False), (campo, r))
            self.assertEqual(len(arquivos()), antes + 1, campo)

    def test_pausas_sozinhas_nao_contam_como_conteudo(self):
        antes = arquivos()
        st, r = post(novo(titulo="So pausas", transcript=[{"t": 9, "speaker": "Talktrail", "text": "(transcrição pausada por 9 s e retomada)"}]))
        self.assertTrue(r.get("vazia"))
        self.assertEqual(arquivos(), antes)

    def test_payload_vazio_nunca_apaga_arquivo_com_conteudo(self):
        a = novo(titulo="Com conteudo", transcript=[{"t": 1, "speaker": "Ana", "text": "oi pessoal"}])
        post(a)
        self.assertTrue(any("conteudo" in f.lower() for f in arquivos()))
        post(dict(a, transcript=[], endedAt="2026-10-11T22:30:00Z"))  # estado perdido por engano
        fs = [f for f in arquivos() if "conteudo" in f.lower()]
        self.assertEqual(len(fs), 1)
        self.assertIn("oi pessoal", ler(fs[0]))

    def test_arquivo_vazio_que_sobrou_e_apagado_no_fim(self):
        p = novo(titulo="Sobra vazia")
        _, conteudo = m.render(p)  # como os arquivos vazios eram gravados antes
        pasta = os.path.join(TMP, "2026-10")
        os.makedirs(pasta, exist_ok=True)
        destino = os.path.join(pasta, "2026-10-11_22h00_sobra-vazia.md")
        with open(destino, "w", encoding="utf-8") as f:
            f.write(conteudo)
        m.caminhos.clear()
        post(dict(p, endedAt="2026-10-11T22:01:00Z"))
        self.assertFalse(os.path.exists(destino))


class Ingles(unittest.TestCase):
    """O mesmo arquivo em inglês (payload com idioma=en): títulos e chaves em inglês, e tudo que reencontra o arquivo funciona nos dois idiomas."""

    def test_reuniao_em_ingles(self):
        r = novo(titulo="Weekly sync", idioma="en", tags=["Product"], transcript=[{"t": 1, "speaker": "Ana", "text": "Hello everyone."}])
        st, resp = post(r)
        self.assertEqual(st, 200, resp)
        nome = [f for f in arquivos() if "weekly-sync" in f][0]
        texto = ler(nome)
        self.assertIn("type: meeting\n", texto)
        self.assertIn('title: "Weekly sync"', texto)
        self.assertIn("source: meet-captions", texto)
        h2 = [l for l in texto.split("\n") if l.startswith("## ")]
        self.assertEqual(h2, ["## Summary", "## Agenda", "## Notes", "## Marked moments", "## Transcript"])
        self.assertNotIn("Transcrição", texto)

    def test_sem_titulo_em_ingles(self):
        st, _ = post(novo(titulo="", idioma="en", notes="a note"))
        self.assertEqual(st, 200)
        self.assertTrue([f for f in arquivos() if f.endswith("_meeting.md")], arquivos())

    def test_servidor_reiniciado_acha_o_arquivo_em_ingles(self):
        a = novo(titulo="Before restart", idioma="en", transcript=[{"t": 1, "speaker": "Ana", "text": "hi there everyone"}])
        post(a)
        m.caminhos.clear()
        post(dict(a, titulo="After restart"))
        fs = [f for f in arquivos() if "restart" in f.lower()]
        self.assertEqual(len(fs), 1, fs)
        self.assertIn("after-restart", fs[0])

    def test_reuniao_em_ingles_que_acabou_vazia_apaga_o_comeco_vazio(self):
        a = novo(titulo="Empty one", idioma="en")
        post(dict(a, notes="x"))  # cria
        antes = [f for f in arquivos() if "empty-one" in f]
        self.assertEqual(len(antes), 1)
        # o arquivo só passa a ser "sem conteúdo" se o texto de verdade sumir: o servidor confere o próprio arquivo, nos dois idiomas
        caminho = os.path.join(TMP, antes[0])
        with open(caminho, "w", encoding="utf-8") as f:
            f.write(m.render(dict(a))[1])
        self.assertTrue(m.arquivo_sem_conteudo(caminho))
        with open(caminho, "w", encoding="utf-8") as f:
            f.write(m.render(dict(a, notes="algo"))[1])
        self.assertFalse(m.arquivo_sem_conteudo(caminho))

    def test_pasta_das_pautas_segue_a_que_existe_e_senao_o_idioma(self):
        import shutil
        original = m.OUT
        h = {"X-Meet-Token": TOKEN}
        try:
            for idioma, existente, esperado in [("en", None, "Agendas"), ("pt", None, "Pautas"), ("en", "Pautas", "Pautas"), ("pt", "Agendas", "Agendas")]:
                base = tempfile.mkdtemp(prefix="talktrail-pautas-")
                m.OUT = base
                if existente:
                    os.makedirs(os.path.join(base, existente))
                st, r = post({"idioma": idioma}, path="/pautas/listar", headers=h)
                self.assertEqual((st, r.get("pasta")), (200, esperado), (idioma, existente, r))
                st, r = post({"idioma": idioma, "nome": "2026-10-20_daily.md", "conteudo": "---\ntitle: Daily\ndate: 2026-10-20\n---\n1. a\n"}, path="/pautas/gravar", headers=h)
                self.assertEqual(st, 200, r)
                self.assertTrue(os.path.isfile(os.path.join(base, esperado, "2026-10-20_daily.md")), os.listdir(base))
                # depois que a pasta existe, o idioma de quem pede não troca mais a pasta
                outro = "pt" if idioma == "en" else "en"
                st, r = post({"idioma": outro}, path="/pautas/listar", headers=h)
                self.assertEqual(r.get("pasta"), esperado)
                self.assertEqual([a["nome"] for a in r["arquivos"]], ["2026-10-20_daily.md"])
                st, _ = post({"idioma": outro, "nome": "2026-10-20_daily.md"}, path="/pautas/apagar", headers=h)
                self.assertEqual(st, 200)
                self.assertTrue(os.listdir(os.path.join(base, esperado, "_apagadas")))
                shutil.rmtree(base)
        finally:
            m.OUT = original

    def test_pagina_de_configuracao_em_ingles_e_em_portugues(self):
        st, pt = get("/")
        self.assertEqual(st, 200)
        self.assertIn("Onde salvar as reuniões", pt.decode())
        for al in ("en-US,en;q=0.9", "de-DE", "ja"):
            st, en = get("/", headers={"Accept-Language": al})
            self.assertEqual(st, 200)
            texto = en.decode()
            self.assertIn("Where to save your meetings", texto, al)
            self.assertIn('<html lang="en">', texto)
            self.assertNotIn("Onde salvar", texto)
            self.assertIn("chromewebstore.google.com/detail/talktrail/", texto)
        st, pt2 = get("/", headers={"Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8"})
        self.assertIn("Onde salvar as reuniões", pt2.decode())

    def test_mensagens_de_erro_no_idioma_de_quem_pede(self):
        st, r = post({}, path="/pautas/listar", headers={"X-Meet-Token": "errado", "Accept-Language": "en-US"})
        self.assertEqual((st, r.get("erro")), (403, "extension not paired"))
        st, r = post({}, path="/pautas/listar", headers={"X-Meet-Token": "errado"})
        self.assertEqual((st, r.get("erro")), (403, "extensão não pareada"))
        st, r = post({"nome": "../x.md", "conteudo": "x"}, path="/pautas/gravar", headers={"X-Meet-Token": TOKEN, "Accept-Language": "en"})
        self.assertEqual((st, r.get("erro")), (400, "invalid file name"))
        st, r = post({"nome": "../x.md", "conteudo": "x"}, path="/pautas/gravar", headers={"X-Meet-Token": TOKEN})
        self.assertEqual((st, r.get("erro")), (400, "nome de arquivo inválido"))

    def test_arquivo_de_explicacao_em_ingles_nao_vai_pra_copia_diaria(self):
        original = m.OUT
        h = {"X-Meet-Token": TOKEN}
        try:
            m.OUT = tempfile.mkdtemp(prefix="talktrail-readme-")
            post({"idioma": "en", "nome": "README.md", "conteudo": "# Talktrail agendas"}, path="/pautas/gravar", headers=h)
            post({"idioma": "en", "nome": "2026-10-20_a.md", "conteudo": "---\ntitle: A\ndate: 2026-10-20\n---\nx"}, path="/pautas/gravar", headers=h)
            post({"idioma": "en"}, path="/pautas/listar", headers=h)
            copias = os.path.join(m.OUT, "Agendas", "_copias", time.strftime("%Y-%m-%d"))
            self.assertEqual(sorted(os.listdir(copias)), ["2026-10-20_a.md"])
        finally:
            m.OUT = original


class Portabilidade(unittest.TestCase):
    """Windows e Linux: o que dá pra conferir sem estar neles (comandos, arquivos de início e tentativas)."""

    def test_mostrar_na_pasta_por_sistema(self):
        self.assertEqual(m.comando_mostrar("/a/b/c.md", "darwin"), ["open", "-R", "/a/b/c.md"])
        w = m.comando_mostrar("C:\\Users\\x\\Meet\\c.md", "win32")
        self.assertEqual((w[0], w[1].startswith("/select,")), ("explorer", True))
        self.assertEqual(m.comando_mostrar("/a/b/c.md", "linux"), ["xdg-open", "/a/b"])

    def test_arquivo_de_inicio_do_windows_e_do_linux(self):
        v = m.conteudo_autostart("win32", "C:\\Python\\pythonw.exe", "C:\\Talktrail\\server\\talktrail_server.py")
        self.assertIn('Run """C:\\Python\\pythonw.exe"" ""C:\\Talktrail\\server\\talktrail_server.py"""', v)
        d = m.conteudo_autostart("linux", "/usr/bin/python3", "/home/x/Talktrail/talktrail_server.py")
        self.assertIn('Exec="/usr/bin/python3" "/home/x/Talktrail/talktrail_server.py"', d)
        self.assertTrue(d.startswith("[Desktop Entry]"))

    def test_gravar_tenta_de_novo_quando_o_arquivo_esta_preso(self):
        orig, vezes = m.os.replace, [0]

        def preso(a, b):
            vezes[0] += 1
            if vezes[0] < 3:
                raise PermissionError("em uso por outro processo")
            return orig(a, b)
        m.os.replace = preso
        try:
            a = os.path.join(TMP, "preso.tmp")
            os.makedirs(TMP, exist_ok=True)
            with open(a, "w") as f:
                f.write("x")
            m.substituir(a, os.path.join(TMP, "preso.txt"))
            self.assertEqual(vezes[0], 3)
        finally:
            m.os.replace = orig
            try:
                os.remove(os.path.join(TMP, "preso.txt"))
            except OSError:
                pass

    def test_mostrar_so_abre_o_arquivo_da_propria_reuniao(self):
        abertos, orig = [], m.mostrar_arquivo
        m.mostrar_arquivo = lambda c: abertos.append(c) or True
        try:
            reuniao = novo(titulo="para mostrar", transcript=[{"t": 1, "speaker": "Ana", "text": "oi pessoal"}])
            self.assertEqual(post(reuniao)[0], 200)
            cab = {"X-Meet-Token": TOKEN}
            st, r = post({"id": reuniao["id"]}, path="/mostrar", headers=cab)
            self.assertEqual((st, r.get("ok")), (200, True), r)
            self.assertTrue(len(abertos) == 1 and abertos[0].endswith(".md") and os.path.isfile(abertos[0]))
            self.assertEqual(post({"id": reuniao["id"]}, path="/mostrar")[0], 403)  # sem o código secreto
            self.assertEqual(post({"id": "nao-existe"}, path="/mostrar", headers=cab)[0], 404)
            self.assertEqual(post({"id": "../../etc/passwd", "caminho": "/etc/passwd"}, path="/mostrar", headers=cab)[0], 404)
            self.assertEqual(len(abertos), 1)
        finally:
            m.mostrar_arquivo = orig


if __name__ == "__main__":
    unittest.main(verbosity=1)
