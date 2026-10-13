#!/usr/bin/env python3
"""Servidor local do Talktrail.

Recebe da extensão a transcrição e as notas de uma reunião e grava um .md numa pasta local.
Só escuta em 127.0.0.1, confere Host e Origin, e só aceita gravar de uma extensão pareada (código secreto).

  python3 talktrail_server.py             # sobe o servidor; a página http://127.0.0.1:8787/ ajuda a configurar
  python3 talktrail_server.py --instalar  # macOS, Windows ou Linux: liga sozinho com o computador e abre a página de configuração
  python3 talktrail_server.py --parear    # esquece a extensão pareada (a próxima que conectar passa a valer)

A pasta vem, nesta ordem, de TALKTRAIL_OUT, do arquivo ~/.config/talktrail/config.json (a página de
configuração grava ali) ou do padrão ~/Documents/Talktrail.
"""
import hashlib
import hmac
import html
import json
import math
import os
import re
import secrets
import shutil
import subprocess
import sys
import threading
import time
import unicodedata
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

for _s in (sys.stdout, sys.stderr):  # o console do Windows usa cp1252; sem isso um acento derruba o servidor
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass  # pythonw não tem console

DEFAULT_OUT = os.path.expanduser("~/Documents/Talktrail")
def _env(nome):
    """Variáveis de ambiente do servidor: TALKTRAIL_OUT, TALKTRAIL_PORT, TALKTRAIL_ESTADO, TALKTRAIL_ORGANIZAR."""
    return os.environ.get("TALKTRAIL_" + nome)


ESTADO = _env("ESTADO") or os.path.expanduser("~/.config/talktrail")
PORT = int(_env("PORT") or "8787")
EXT_DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "extension"))


def ler_json(nome):
    try:
        with open(os.path.join(ESTADO, nome), encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def substituir(origem, destino):
    """os.replace com tentativas: no Windows o Drive, o OneDrive ou o antivírus seguram o arquivo por instantes."""
    for i in range(6):
        try:
            return os.replace(origem, destino)
        except PermissionError:
            if i == 5:
                raise
            time.sleep(0.2)


def gravar_json(nome, obj):
    """Estado do servidor (código de pareamento, pasta): só o dono lê, fora de qualquer pasta sincronizada."""
    os.makedirs(ESTADO, mode=0o700, exist_ok=True)
    destino = os.path.join(ESTADO, nome)
    tmp = f"{destino}.{os.getpid()}.tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False)
    substituir(tmp, destino)


_cfg = ler_json("config.json")
OUT = _env("OUT") or _cfg.get("pasta") or DEFAULT_OUT
ORGANIZAR = _env("ORGANIZAR") or _cfg.get("organizar") or "mes"  # "mes": pasta AAAA-MM; "plano": tudo junto
MAX_BODY = 10_000_000
MAX_TEXTO = 500_000      # notas e pauta, em caracteres
MAX_FALA = 100_000       # uma fala
MAX_LINHAS = 50_000
caminhos = {}            # id da sessão -> caminho atual do arquivo
TRAVA = threading.Lock()  # um salvamento por vez: dois ao mesmo tempo brigavam pelo arquivo temporário

# controle, separadores de linha do Unicode, marcas bidirecionais (RTL override engana o olho), BOM e espaço de largura zero
INVISIVEL = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u2028\u2029\u202a-\u202e\u2066-\u2069\u200b\u2060\ufeff]")


def texto(v, n=None):
    """Qualquer coisa vira texto seguro: str, sem controle, sem substituto solto, no máximo n caracteres."""
    if v is None or isinstance(v, (dict, list, bool)):
        return ""
    s = v if isinstance(v, str) else str(v)
    s = s.encode("utf-8", "replace").decode("utf-8")  # emoji cortado ao meio (substituto solto) não derruba a gravação
    s = unicodedata.normalize("NFC", s)
    s = INVISIVEL.sub("", s) if n is not None else re.sub("[\x00\x01-\x08\x0b\x0c\x0e-\x1f\x7f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]", "", s)
    return s if n is None else s[:n]


def linha_unica(v, n=200):
    """Texto de uma linha só, sem quebra, com espaços compactados."""
    return re.sub(r"\s+", " ", texto(v, n * 4)).strip()[:n]


def numero(v, maximo=10 * 24 * 3600):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return 0
    return 0 if math.isnan(x) or math.isinf(x) or x < 0 else min(x, maximo)


def versao_extensao():
    d = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "extension"))
    h = hashlib.sha1()
    for raiz, _, arqs in sorted(os.walk(d)):
        for a in sorted(arqs):
            p = os.path.join(raiz, a)
            st = os.stat(p)
            h.update(f"{os.path.relpath(p, d)}:{st.st_size}:{int(st.st_mtime)}".encode())
    return h.hexdigest()[:12]


def sem_acento(s):
    """Minúsculas e sem acento, mas mantém outros alfabetos (cirílico, japonês...)."""
    d = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in d if unicodedata.category(c) != "Mn").casefold()


def slug(s, max_bytes=100):
    """Nome de arquivo a partir do título: letras e números de qualquer alfabeto, nunca passa de max_bytes."""
    s = sem_acento(linha_unica(s, 200))
    s = re.sub(r"[\W_]+", "-", s).strip("-")
    while len(s.encode("utf-8")) > max_bytes:  # corta por bytes sem partir um caractere
        s = s[:-1]
    return s.strip("-") or "reuniao"


def quebrar(conteudo, limite=300):
    """Quebra fala longa em blocos de até ~limite caracteres, nas fronteiras de frase."""
    frases = re.split(r"(?<=[.!?])\s+", (conteudo or "").strip())
    blocos, atual = [], ""
    for f in frases:
        if atual and len(atual) + 1 + len(f) > limite:
            blocos.append(atual)
            atual = f
        else:
            atual = f"{atual} {f}".strip()
    if atual:
        blocos.append(atual)
    return blocos or [""]


def como_lista(txt):
    """Notas e Cola viram markdown arrumado: cada linha é um item (senão o markdown junta tudo num
    parágrafo) e título digitado desce pra nível 4, pra não quebrar a estrutura do arquivo."""
    saida = []
    cercas = 0
    for linha in (txt or "").strip().splitlines():
        s = linha.strip()
        if s in ("-", "*", "+") or re.fullmatch(r"[-*+]\s\[[ xX]\]", s):
            continue  # marcador vazio
        if not s:
            saida.append("")
            continue
        if s.startswith("```") or s.startswith("~~~"):
            cercas += 1
        recuo = linha[: len(linha) - len(linha.lstrip())].replace("\t", "  ")  # hierarquia de lista
        h = re.match(r"^#{1,6}\s+(.*)", s)
        if h:
            saida.append("#### " + h.group(1))
        elif re.match(r"^([-*+]|\d+[.)])\s", s) or s.startswith(">"):
            saida.append(recuo + s)
        else:
            saida.append(recuo + "- " + s)
    if cercas % 2:
        saida.append("```")  # cerca de código aberta engoliria as seções de baixo
    return "\n".join(saida)


def mmss(seg):
    seg = int(numero(seg))
    return f"{seg // 60:02d}:{seg % 60:02d}"


def parse_iso(s):
    if not isinstance(s, str):
        raise ValueError("data inválida")
    d = datetime.fromisoformat(s.strip().replace("Z", "+00:00"))
    if not 2000 <= d.year <= 2100:
        raise ValueError("data fora do intervalo")
    return d


def escapar_estrutura(parte):
    """Linha de fala que começaria com marcação de markdown ganha uma barra, pra não virar título ou lista."""
    return "\\" + parte if re.match(r"^\s*(#|>|[-*+]\s|\d+[.)]\s|```|~~~|---|===|\||<)", parte) else parte


def tags_limpas(brutas):
    if not isinstance(brutas, list):
        return []
    saida = []
    for bruta in brutas[:200]:
        for parte in re.split(r"[,;]", linha_unica(bruta, 200)):
            tag = re.sub(r"^[\s,;.#]+|[\s,;]+$", "", parte)[:60]
            if tag and tag not in saida:
                saida.append(tag)
    return saida[:20]


def render(p):
    ini = parse_iso(p["startedAt"]).astimezone()
    dur = ""
    try:
        if p.get("endedAt"):
            dur = max(0, round((parse_iso(p["endedAt"]) - parse_iso(p["startedAt"])).total_seconds() / 60))
    except (ValueError, OverflowError, TypeError):
        dur = ""
    brutas = p.get("transcript")
    linhas = []
    for l in (brutas if isinstance(brutas, list) else [])[:MAX_LINHAS]:
        if not isinstance(l, dict):
            continue
        nome = re.sub(r"[*_`\[\]<>]", "", linha_unica(l.get("speaker"), 80)) or "?"
        linhas.append({"t": numero(l.get("t")), "speaker": nome, "text": texto(l.get("text"), MAX_FALA)})
    nomes = sorted({l["speaker"] for l in linhas if l["speaker"] not in ("?", "Talktrail")})[:50]
    titulo = linha_unica(p.get("titulo"), 200) or "Reunião sem título"
    tags = tags_limpas(p.get("tags"))
    projeto = linha_unica(p.get("projeto"), 60) or (tags[0] if tags else "")
    q = lambda v: json.dumps(v, ensure_ascii=False)
    sessao = re.sub(r"[^A-Za-z0-9_.:-]", "", texto(p.get("id"), 80))
    notas, pauta = texto(p.get("notes"), MAX_TEXTO + 1), texto(p.get("cola"), MAX_TEXTO + 1)
    corte = "\n\n_(texto cortado: passou de 500 mil caracteres)_"
    notas = notas[:MAX_TEXTO] + corte if len(notas) > MAX_TEXTO else notas
    pauta = pauta[:MAX_TEXTO] + corte if len(pauta) > MAX_TEXTO else pauta
    fm = [
        "---",
        "tipo: reuniao",
        f"sessao: {q(sessao)}",
        f"titulo: {q(titulo)}",
        f"projeto: {q(projeto)}",
        f"tags: {q(tags)}",
        f"data: {ini:%Y-%m-%d}",
        f"inicio: {ini:%H:%M}",
        f"duracao_min: {dur}",
        "fonte: legendas-do-meet",
        f"participantes: {q(nomes)}",
        f"url: {q(linha_unica(p.get('url'), 300))}",
        "status: cru",
        'notion: ""',
        "---",
        "",
        f"# {titulo}",
        "",
        "## Resumo",
        "",
        "_(resumo, a preencher depois da reunião)_",
        "",
        "## Pauta",
        "",
        como_lista(pauta) or "_(vazia)_",
        "",
        "## Notas",
        "",
        como_lista(notas) or "_(sem notas)_",
        "",
        "## Momentos marcados",
        "",
    ]
    marcas = p.get("marcas")
    marcas = [m for m in (marcas if isinstance(marcas, list) else [])[:500] if isinstance(m, dict)]
    fm += [f"- [{mmss(m.get('t'))}] {escapar_estrutura(linha_unica(m.get('texto'), 400)) or '(sem fala neste momento)'}" for m in marcas] or ["_(nenhum)_"]
    chat_bruto = p.get("chat")
    chat = []
    for m in (chat_bruto if isinstance(chat_bruto, list) else [])[:2000]:
        if isinstance(m, dict) and linha_unica(m.get("text"), 2000):
            quem = re.sub(r"[*_`\[\]<>]", "", linha_unica(m.get("speaker"), 80)) or "Chat"
            chat.append(f"- [{mmss(m.get('t'))}] {quem}: {escapar_estrutura(linha_unica(m.get('text'), 2000))}")
    if chat:
        fm += ["", "## Chat da reunião", ""] + chat
        estrutura = linha_unica(p.get("chatEstrutura"), 1400).replace("-->", "").replace("--", "-")
        if estrutura:
            fm += ["", f"<!-- estrutura do chat (sem texto): {estrutura} -->"]
    fm += ["", "## Transcrição", ""]
    for l in linhas:
        partes = quebrar(l["text"])
        fm.append(f"**[{mmss(l['t'])}] {l['speaker']}:** {partes[0]}")
        fm += [escapar_estrutura(x) for x in partes[1:]]
        fm.append("")
    if not linhas:
        fm.append("_(vazia)_")
    return ini, "\n".join(fm) + "\n"


def achar_da_sessao(sessao):
    """Depois de um reinício do servidor, reencontra o arquivo da reunião em andamento pelo cabeçalho."""
    marca = f'sessao: "{sessao}"'.encode("utf-8")
    try:
        pastas = [OUT] + [os.path.join(OUT, d) for d in os.listdir(OUT) if re.fullmatch(r"\d{4}-\d{2}", d)]
        for pasta in pastas:
            for f in os.listdir(pasta):
                if f.endswith(".md"):
                    with open(os.path.join(pasta, f), "rb") as fh:
                        if marca in fh.read(700):
                            return os.path.join(pasta, f)
    except OSError:
        pass
    return None


def livre(caminho):
    """Nunca sobrescreve o arquivo de outra reunião: acrescenta -2, -3..."""
    if not os.path.exists(caminho):
        return caminho
    base = caminho[:-3]
    n = 2
    while os.path.exists(f"{base}-{n}.md"):
        n += 1
    return f"{base}-{n}.md"


AVISO_CHAT = "estou transcrevendo esta reuni"  # começo do aviso que a própria extensão manda no chat: não conta como conteúdo


def reuniao_vazia(p):
    """Sem fala, sem marcador, sem nota, sem pauta e sem chat de verdade (o aviso da extensão não conta)."""
    def lista(v):
        return [x for x in (v if isinstance(v, list) else []) if isinstance(x, dict)]
    falas = [l for l in lista(p.get("transcript")) if l.get("speaker") not in ("Talktrail",) and linha_unica(l.get("text"), 20)]
    chat = [m for m in lista(p.get("chat")) if linha_unica(m.get("text"), 2000) and not linha_unica(m.get("text"), 200).lower().startswith(AVISO_CHAT)]
    return not (falas or lista(p.get("marcas")) or chat or texto(p.get("notes"), MAX_TEXTO).strip() or texto(p.get("cola"), MAX_TEXTO).strip())


def arquivo_sem_conteudo(caminho):
    """O arquivo no disco também está vazio? (só aí é seguro apagar)"""
    try:
        with open(caminho, encoding="utf-8") as f:
            t = f.read()
    except OSError:
        return False

    def secao(nome):
        m = re.search(r"^## " + re.escape(nome) + r"\n\n(.*?)(?=^## |\Z)", t, re.S | re.M)
        return m.group(1).strip() if m else None
    chat = secao("Chat da reunião")
    chat_so_aviso = chat is None or all(l.lower().lstrip("- []0123456789:").strip().startswith("chat: " + AVISO_CHAT) or l.startswith("<!--") or not l.strip() for l in chat.split("\n"))
    return (secao("Transcrição") == "_(vazia)_" and secao("Notas") == "_(sem notas)_" and secao("Pauta") == "_(vazia)_"
            and secao("Momentos marcados") == "_(nenhum)_" and chat_so_aviso)


def salvar(p):
    ini, conteudo = render(p)
    sessao = re.sub(r"[^A-Za-z0-9_.:-]", "", texto(p.get("id"), 80))
    if reuniao_vazia(p):
        # reunião sem nada: não cria arquivo; e apaga o que sobrou de um começo vazio (só se o arquivo também está vazio)
        with TRAVA:
            atual = caminhos.get(sessao) or achar_da_sessao(sessao)
            if atual and os.path.exists(atual) and p.get("endedAt") and arquivo_sem_conteudo(atual):
                os.remove(atual)
                caminhos.pop(sessao, None)
        return None
    nome = f"{ini:%Y-%m-%d}_{ini:%Hh%M}_{slug(p.get('titulo') or 'reuniao')}.md"
    with TRAVA:
        pasta = os.path.join(OUT, f"{ini:%Y-%m}") if ORGANIZAR == "mes" else OUT
        os.makedirs(pasta, exist_ok=True)
        desejado = os.path.join(pasta, nome)
        atual = caminhos.get(sessao) or achar_da_sessao(sessao)
        if atual and os.path.exists(atual):
            mesmo_nome = re.fullmatch(re.escape(desejado[:-3]) + r"(-\d+)?\.md", atual)
            destino = atual if mesmo_nome else livre(desejado)
            if destino != atual:
                substituir(atual, destino)
        else:
            destino = livre(desejado)
        tmp = f"{destino}.{os.getpid()}.{threading.get_ident()}.tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(conteudo)
        substituir(tmp, destino)
        caminhos[sessao] = destino
    return os.path.relpath(destino, OUT)


def parear_atual():
    return ler_json("pareamento.json")


PAGINA = """<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Talktrail, configuração</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--card:#fafafa;--tx:#09090b;--mu:#52525b;--ln:#d4d4d8;--ok:#16a34a;--bt:#18181b;--bt-t:#fafafa}
@media(prefers-color-scheme:dark){:root{--bg:#09090b;--card:#141417;--tx:#fafafa;--mu:#a1a1aa;--ln:#34343b;--bt:#fafafa;--bt-t:#09090b}}
body{margin:0;background:var(--bg);color:var(--tx);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Inter",system-ui,sans-serif}
main{max-width:640px;margin:0 auto;padding:40px 20px 80px}
h1{font-size:22px;margin:0 0 4px}.sub{color:var(--mu);margin:0 0 28px}
section{background:var(--card);border:1px solid var(--ln);border-radius:14px;padding:18px 20px;margin:0 0 14px}
h2{font-size:14px;margin:0 0 8px;display:flex;align-items:center;gap:8px}
.ok{color:var(--ok)}.mu{color:var(--mu);font-size:13px}
code{background:var(--bg);border:1px solid var(--ln);border-radius:6px;padding:1px 6px;font-size:13px;word-break:break-all}
input{width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid var(--ln);border-radius:9px;background:var(--bg);color:var(--tx);font:inherit}
button{margin-top:10px;padding:8px 14px;border:0;border-radius:9px;background:var(--bt);color:var(--bt-t);font:inherit;font-weight:600;cursor:pointer}
ol{padding-left:20px;margin:6px 0}li{margin:4px 0}
</style>
<main>
<h1>Talktrail</h1>
<p class="sub">Transcrição do Google Meet, 100% no seu computador.</p>
<section><h2><span class="ok">●</span> O servidor está funcionando</h2>
<p class="mu">Ele fica rodando em segundo plano e é quem grava os arquivos. Você só precisa mexer aqui na primeira vez.</p></section>
<section><h2>1. Onde salvar as reuniões</h2>
<p class="mu">Cada reunião vira um arquivo Markdown, em subpastas por mês (<code>AAAA-MM</code>).</p>
<input id="pasta" value="__PASTA__" spellcheck="false" readonly>
<button id="escolher">Escolher a pasta…</button> <span id="msg" class="mu"></span></section>
<section><h2>2. Instalar a extensão no navegador</h2>
<ol><li>Abra <code>chrome://extensions</code> e ligue <b>Modo do desenvolvedor</b>.</li>
<li>Clique em <b>Carregar sem compactação</b> e escolha esta pasta:<br><code>__EXT__</code></li>
<li>Entre numa reunião do Meet e clique em <b>Gravar</b> no aviso.</li></ol></section>
<section><h2>3. Conexão com a extensão: <span class="__PCLASSE__">__PAREADO__</span></h2>
<p class="mu">__PTEXTO__</p>
<button id="reparear">Parear de novo</button> <span id="msg2" class="mu"></span></section>
</main>
<script>
document.getElementById('escolher').onclick = async () => {
  const msg = document.getElementById('msg');
  msg.textContent = 'Escolha a pasta na janela que abriu...';
  const r = await fetch('/escolher-pasta', {method:'POST', headers:{'X-Talktrail':'1','Content-Type':'application/json'}, body:'{}'});
  const d = await r.json().catch(() => ({}));
  if (d.ok) {
    document.getElementById('pasta').value = d.pasta;
    msg.textContent = 'Pronto. As próximas reuniões vão pra lá.';
  } else {
    msg.textContent = d.cancelado ? 'Nenhuma pasta escolhida.' : (d.erro || 'Não consegui abrir o seletor de pasta.');
  }
};
document.getElementById('reparear').onclick = async () => {
  const r = await fetch('/reset', {method:'POST', headers:{'X-Talktrail':'1','Content-Type':'application/json'}, body:'{}'});
  document.getElementById('msg2').textContent = r.ok ? 'Pronto. A próxima gravação pareia sozinha.' : 'Não consegui.';
};
</script></html>"""


def pagina_config():
    p = parear_atual()
    pareado = bool(p.get("token"))
    return (PAGINA.replace("__PASTA__", html.escape(OUT, quote=True)).replace("__EXT__", html.escape(EXT_DIR))
            .replace("__PAREADO__", "pareada" if pareado else "aguardando")
            .replace("__PCLASSE__", "ok" if pareado else "mu")
            .replace("__PTEXTO__", "A extensão já está conectada e é a única que pode gravar." if pareado
                     else "Instale a extensão (passo 2). A primeira que conectar passa a ser a única autorizada a gravar."))


def pasta_valida(caminho):
    """Pasta escolhida na página: caminho absoluto dentro da pasta do usuário ou de um volume, e gravável."""
    bruto = os.path.expanduser(texto(caminho, 500).strip())
    if not os.path.isabs(bruto) or ".." in bruto.replace("\\", "/").split("/"):
        raise ValueError("use o caminho completo da pasta, sem ..")
    c = os.path.normpath(bruto)
    casa = os.path.expanduser("~")
    cmp, casa_cmp = os.path.normcase(c), os.path.normcase(casa)  # C:\\Users\\x e c:\\users\\x são a mesma pasta no Windows
    if not (cmp == casa_cmp or cmp.startswith(casa_cmp + os.sep) or c.startswith("/Volumes/")):
        raise ValueError("escolha uma pasta dentro da sua pasta pessoal")
    os.makedirs(c, exist_ok=True)
    if not os.access(c, os.W_OK):
        raise ValueError("sem permissão pra gravar nessa pasta")
    return c


def comando_seletor_de_pasta(plataforma=None):
    """Comando que abre o seletor de pasta do próprio sistema e imprime o caminho escolhido."""
    plataforma = plataforma or sys.platform
    if plataforma == "darwin":
        return ["osascript", "-e", 'POSIX path of (choose folder with prompt "Escolha a pasta onde o Talktrail salva as reuniões")']
    if plataforma.startswith("win"):
        ps = ("Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; "
              "$f.Description = 'Escolha a pasta onde o Talktrail salva as reuniões'; "
              "if ($f.ShowDialog() -eq 'OK') { [Console]::Out.Write($f.SelectedPath) }")
        return ["powershell", "-NoProfile", "-Command", ps]
    for prog, args in (("zenity", ["--file-selection", "--directory", "--title=Escolha a pasta do Talktrail"]),
                       ("kdialog", ["--getexistingdirectory", os.path.expanduser("~")])):
        if shutil.which(prog):
            return [prog] + args
    return None


def escolher_pasta():
    """Abre o seletor do sistema e devolve o caminho. None se cancelou ou não há seletor."""
    cmd = comando_seletor_de_pasta()
    if not cmd:
        return None
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    except (OSError, subprocess.TimeoutExpired):
        return None
    saida = r.stdout.strip()
    return os.path.normpath(saida) if r.returncode == 0 and saida else None


def comando_mostrar(caminho, plataforma=None):
    """Comando que mostra o arquivo no gerenciador de arquivos do sistema (selecionado, onde der)."""
    plataforma = plataforma or sys.platform
    if plataforma == "darwin":
        return ["open", "-R", caminho]
    if plataforma.startswith("win"):
        return ["explorer", f"/select,{os.path.normpath(caminho)}"]
    return ["xdg-open", os.path.dirname(caminho)]  # no Linux não há jeito único de selecionar: abre a pasta


def mostrar_arquivo(caminho):
    try:
        subprocess.Popen(comando_mostrar(caminho), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True
    except OSError:
        return False


def plist_launchagent(python=None, script=None):
    return {
        "Label": "com.talktrail.server",
        "ProgramArguments": [python or sys.executable, script or os.path.abspath(__file__)],
        "RunAtLoad": True,
        "KeepAlive": True,
        "StandardOutPath": "/tmp/talktrail.out",
        "StandardErrorPath": "/tmp/talktrail.err",
    }


def conteudo_autostart(plataforma, python, script):
    """Arquivo que o Windows (pasta Inicializar) ou o Linux (autostart) executa ao entrar na sessão."""
    if plataforma.startswith("win"):
        return f'CreateObject("WScript.Shell").Run """{python}"" ""{script}""", 0, False\r\n'
    return ("[Desktop Entry]\nType=Application\nName=Talktrail\nComment=Servidor local do Talktrail\n"
            f'Exec="{python}" "{script}"\nX-GNOME-Autostart-enabled=true\nTerminal=false\n')


def instalar_outros(plataforma):
    import webbrowser
    script = os.path.abspath(__file__)
    if plataforma.startswith("win"):
        pythonw = os.path.join(os.path.dirname(sys.executable), "pythonw.exe")
        python = pythonw if os.path.exists(pythonw) else sys.executable
        pasta = os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~"), "Microsoft", "Windows", "Start Menu", "Programs", "Startup")
        destino = os.path.join(pasta, "Talktrail.vbs")
        os.makedirs(pasta, exist_ok=True)
        with open(destino, "w", encoding="utf-16") as f:  # UTF-16 com BOM: o Windows lê nome de pasta com acento
            f.write(conteudo_autostart(plataforma, python, script))
        subprocess.Popen([python, script], creationflags=0x00000008 | 0x00000200, close_fds=True,
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        pasta = os.path.join(os.environ.get("XDG_CONFIG_HOME") or os.path.expanduser("~/.config"), "autostart")
        destino = os.path.join(pasta, "talktrail.desktop")
        os.makedirs(pasta, exist_ok=True)
        with open(destino, "w", encoding="utf-8") as f:
            f.write(conteudo_autostart(plataforma, sys.executable, script))
        subprocess.Popen([sys.executable, script], start_new_session=True, stdin=subprocess.DEVNULL,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)
    webbrowser.open(f"http://127.0.0.1:{PORT}/")
    print("Pronto. O servidor sobe sozinho quando você entra no computador. A página de configuração abriu no navegador.")
    return 0


def instalar():
    import plistlib
    if sys.platform != "darwin":
        return instalar_outros(sys.platform)
    destino = os.path.expanduser("~/Library/LaunchAgents/com.talktrail.server.plist")
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    with open(destino, "wb") as f:
        plistlib.dump(plist_launchagent(), f)
    uid = str(os.getuid())
    subprocess.run(["launchctl", "bootout", f"gui/{uid}/com.talktrail.server"], capture_output=True)
    r = subprocess.run(["launchctl", "bootstrap", f"gui/{uid}", destino], capture_output=True, text=True)
    if r.returncode:
        print("Não consegui ligar o servidor:", r.stderr.strip())
        return 1
    time.sleep(2)
    subprocess.run(["open", f"http://127.0.0.1:{PORT}/"])
    print("Pronto. O servidor sobe sozinho com o computador. A página de configuração abriu no navegador.")
    return 0


class H(BaseHTTPRequestHandler):
    timeout = 10  # cliente que trava a conexão não prende uma linha de execução pra sempre

    def log_message(self, *a):
        pass

    def _json(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def _host_ok(self):
        return (self.headers.get("Host") or "") in (f"127.0.0.1:{PORT}", f"localhost:{PORT}")

    def _origem_extensao(self):
        o = self.headers.get("Origin") or ""
        return o if o.startswith(("chrome-extension://", "moz-extension://")) else None

    def _origem_ok(self):
        """Página web sempre manda Origin; só a extensão (ou a própria página de configuração) passa."""
        o = self.headers.get("Origin")
        return o is None or self._origem_extensao() is not None or o == f"http://127.0.0.1:{PORT}"

    def _autorizado(self):
        """Gravar exige o código secreto E a mesma extensão que pareou."""
        p = parear_atual()
        token, origem = p.get("token"), p.get("origem")
        if not token or self.headers.get("Origin") != origem:
            return False
        return hmac.compare_digest(self.headers.get("X-Meet-Token") or "", token)

    def do_GET(self):
        if not self._host_ok() or not self._origem_ok():
            return self._json(403, {"ok": False})
        caminho = self.path.split("?")[0]
        if caminho == "/":
            b = pagina_config().encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(b)))
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return self.wfile.write(b)
        if caminho == "/health":
            return self._json(200, {"ok": True, "out": OUT, "pasta_existe": os.path.isdir(OUT), "pareado": bool(parear_atual().get("token")), "organizar": ORGANIZAR})
        if caminho == "/extversao":
            return self._json(200, {"v": versao_extensao()})
        self._json(404, {"ok": False})

    def _corpo_json(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = -1
        if n <= 0:
            return None, (400, {"ok": False, "erro": "corpo vazio"})
        if n > MAX_BODY:
            restante = min(n, 200_000_000)  # lê e descarta, senão o navegador vê "falha de rede" em vez do motivo
            while restante > 0:
                pedaco = self.rfile.read(min(65536, restante))
                if not pedaco:
                    break
                restante -= len(pedaco)
            return None, (413, {"ok": False, "erro": f"dados grandes demais (acima de {MAX_BODY // 1_000_000} MB)"})
        try:
            d = json.loads(self.rfile.read(n))
        except Exception as e:
            return None, (400, {"ok": False, "erro": f"dados inválidos: {e}"[:200]})
        if not isinstance(d, dict):
            return None, (400, {"ok": False, "erro": "dados inválidos: esperado um objeto"})
        return d, None

    def do_POST(self):
        global OUT
        if not self._host_ok() or not self._origem_ok() or self.headers.get("X-Talktrail") != "1":
            return self._json(403, {"ok": False, "erro": "negado"})
        caminho = self.path.split("?")[0]

        if caminho == "/pair":
            origem = self._origem_extensao()
            if not origem:
                return self._json(403, {"ok": False, "erro": "só a extensão pode parear"})
            with TRAVA:
                p = parear_atual()
                if not p.get("token"):
                    p = {"token": secrets.token_urlsafe(32), "origem": origem}
                    gravar_json("pareamento.json", p)
                elif p.get("origem") != origem:
                    return self._json(403, {"ok": False, "erro": "já pareado com outra extensão. Abra http://127.0.0.1:8787/ e clique em Parear de novo."})
            return self._json(200, {"ok": True, "token": p["token"]})

        if caminho == "/reset":
            # "Parear de novo": só a própria página de configuração pode pedir (nenhuma extensão ou página web)
            if self.headers.get("Origin") != f"http://127.0.0.1:{PORT}":
                return self._json(403, {"ok": False, "erro": "negado"})
            with TRAVA:
                try:
                    os.remove(os.path.join(ESTADO, "pareamento.json"))
                except OSError:
                    pass
            return self._json(200, {"ok": True})

        if caminho == "/escolher-pasta":
            if self.headers.get("Origin") != f"http://127.0.0.1:{PORT}" and not self._autorizado():
                return self._json(403, {"ok": False, "erro": "negado"})
            escolhida = escolher_pasta()
            if not escolhida:
                return self._json(200, {"ok": False, "cancelado": True})
            try:
                nova = pasta_valida(escolhida)
            except (ValueError, OSError) as e:
                return self._json(400, {"ok": False, "erro": str(e)[:200]})
            with TRAVA:
                cfg = ler_json("config.json")
                cfg["pasta"] = nova
                gravar_json("config.json", cfg)
                if not _env("OUT"):
                    OUT = nova
            return self._json(200, {"ok": True, "pasta": nova})

        if caminho == "/mostrar":
            # só reabre o arquivo da reunião que ESTE servidor gravou nesta sessão: nunca um caminho vindo de fora
            if not self._autorizado():
                return self._json(403, {"ok": False, "erro": "negado"})
            d, erro = self._corpo_json()
            if erro:
                return self._json(*erro)
            sessao = re.sub(r"[^A-Za-z0-9_.:-]", "", texto(d.get("id"), 80))
            with TRAVA:
                atual = caminhos.get(sessao) or (achar_da_sessao(sessao) if sessao else None)
            if not atual or not os.path.isfile(atual):
                return self._json(404, {"ok": False, "erro": "não achei o arquivo dessa reunião"})
            if not mostrar_arquivo(atual):
                return self._json(500, {"ok": False, "erro": "não consegui abrir o gerenciador de arquivos"})
            return self._json(200, {"ok": True})

        if caminho == "/config":
            if self.headers.get("Origin") != f"http://127.0.0.1:{PORT}" and not self._autorizado():
                return self._json(403, {"ok": False, "erro": "negado"})
            d, erro = self._corpo_json()
            if erro:
                return self._json(*erro)
            try:
                nova = pasta_valida(d.get("pasta"))
            except (ValueError, OSError) as e:
                return self._json(400, {"ok": False, "erro": str(e)[:200]})
            with TRAVA:
                cfg = ler_json("config.json")
                cfg["pasta"] = nova
                gravar_json("config.json", cfg)
                if not _env("OUT"):
                    OUT = nova
            return self._json(200, {"ok": True, "pasta": nova})

        if caminho != "/save":
            return self._json(404, {"ok": False})
        if not self._autorizado():
            return self._json(403, {"ok": False, "erro": "extensão não pareada", "parear": True})
        p, erro = self._corpo_json()
        if erro:
            return self._json(*erro)
        try:
            if not texto(p.get("id"), 80) or not p.get("startedAt"):
                raise ValueError("faltando id ou startedAt")
            parse_iso(p["startedAt"])
        except Exception as e:
            return self._json(400, {"ok": False, "erro": f"dados inválidos: {e}"[:200]})
        try:
            arquivo = salvar(p)
            return self._json(200, {"ok": True, "arquivo": arquivo, "vazia": arquivo is None})
        except OSError as e:
            return self._json(500, {"ok": False, "erro": f"não consegui gravar na pasta: {e.strerror or e}"[:200]})
        except Exception as e:
            return self._json(500, {"ok": False, "erro": str(e)[:200]})


if __name__ == "__main__":
    if "--instalar" in sys.argv:
        sys.exit(instalar())
    if "--parear" in sys.argv:
        try:
            os.remove(os.path.join(ESTADO, "pareamento.json"))
        except OSError:
            pass
        print("Pareamento apagado. A próxima extensão que conectar passa a valer.")
        sys.exit(0)
    try:
        srv = ThreadingHTTPServer(("127.0.0.1", PORT), H)
    except OSError:
        print(f"A porta {PORT} já está em uso. Provavelmente o Talktrail já está rodando: abra http://127.0.0.1:{PORT}/")
        sys.exit(1)
    print(f"Talktrail: http://127.0.0.1:{PORT}  ->  {OUT}")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
