"""Gera a arte da Chrome Web Store: HTMLs em src/ e PNGs exatos em out/ (via Helium headless).
Pré-requisito: servidor estático na raiz do repo (python3 -m http.server 8799)."""
import os, re, subprocess, sys
RAIZ = os.path.dirname(os.path.abspath(__file__))
HELIUM = "/Applications/Helium.app/Contents/MacOS/Helium"
CARV, GRAF, MARF, TEAL, ESC = "#0E0F12", "#1A1C21", "#E7DFC7", "#2DD4BF", "#0F766E"
VARIANTE = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] in ("marfim", "grafite") else "marfim"
SLAB = {"marfim": MARF, "grafite": "#2A2D35"}[VARIANTE]   # fundo da laje: nunca teal
PASTA = {"marfim": "#FBF7EA", "grafite": MARF}[VARIANTE]     # cor da caixa "Sua pasta"
os.makedirs(os.path.join(RAIZ, "out", VARIANTE), exist_ok=True)
logo = open(os.path.join(RAIZ, "../design/logo-final/fita-completo.svg")).read()
logo = re.sub(r'\s(width|height)="\d+"', "", logo, count=2)  # tamanho vem do CSS
GRAO = ("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'>"
        "<feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0'/></filter>"
        "<rect width='100%' height='100%' filter='url(%23n)'/></svg>")
BASE = f"""<meta charset="utf-8"><link rel="stylesheet" href="fonts.css"><style>
*{{box-sizing:border-box;margin:0}}html,body{{background:{CARV}}}
body{{position:relative;overflow:hidden;color:{MARF};font-family:'IBM Plex Sans',system-ui,sans-serif;-webkit-font-smoothing:antialiased}}
body::after{{content:"";position:absolute;inset:0;background:url("{GRAO}");opacity:.07;mix-blend-mode:screen;pointer-events:none}}
.eyebrow{{font:600 15px 'IBM Plex Mono',monospace;letter-spacing:.14em;text-transform:uppercase;color:{TEAL}}}
h1,h2{{font-family:'Archivo',sans-serif;font-weight:900;letter-spacing:-.025em;line-height:.98;text-wrap:balance}}
.logo svg{{width:100%;height:100%;display:block}}
.slab{{position:absolute;background:{SLAB}}}
.painel{{position:absolute;display:block;border-radius:14px;box-shadow:12px 12px 0 {CARV};border:2px solid {CARV}}}
</style>"""

def pagina(nome, w, h, corpo):
    open(os.path.join(RAIZ, "src", nome + ".html"), "w").write(f'<!doctype html><html lang="pt-BR"><head>{BASE}</head><body style="width:{w}px;height:{h}px">{corpo}</body></html>')

def render(nome, w, h):
    out = os.path.join(RAIZ, "out", VARIANTE, nome + ".png")
    subprocess.run([HELIUM, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--window-size={w},{h}", "--virtual-time-budget=5000",
                    f"--screenshot={out}", f"http://127.0.0.1:8799/store/src/{nome}.html"], capture_output=True, timeout=90)
    return out

P = lambda n: f"../painel/{n}.png"
# ---------- textos ----------
T = {"pt": dict(
        tag="Transcrição do Google Meet", s1="A reunião vira texto,<br>ao vivo.", s1b="Quem falou e quando falou, num painel ao lado da chamada.",
        s2="Uma reunião,<br>um arquivo .md.", s2b="Título, tags, data, duração, participantes e a transcrição por fala.",
        s3="Agenda e pauta<br>num só painel.", s3b="A pauta de cada reunião carrega sozinha quando você entra na sala.",
        s3x="Pauta pronta<br>antes da reunião.", s3xb="Um calendário das próximas reuniões. Cada pauta também vira um arquivo .md, pra você ou uma IA editar.",
        s4="Nada sai do<br>seu computador.", s4b="Sem conta, sem nuvem, sem telemetria. O arquivo cai na pasta que você escolher.",
        eb="Talktrail · extensão para o Google Meet", tile="A reunião do Meet vira texto, só no seu computador.", mq="Sua reunião vira texto.<br>Só no seu computador.",
        mqb="Transcrição ao vivo do Google Meet, notas e pauta num painel ao lado da chamada. Salva em Markdown.", mqc="Sem conta. Sem nuvem. Sem telemetria."),
     "en": dict(
        eb="Talktrail · Google Meet extension", tile="Google Meet transcripts that stay on your computer.", mq="Your meeting becomes text.<br>Only on your computer.",
        mqb="Live Google Meet transcription, notes and agenda in a side panel next to the call. Saved as Markdown.", mqc="No account. No cloud. No telemetry.")}
# ---------- tile pequeno 440x280 ----------
for lg in ("pt", "en"):
    t = T[lg]
    pagina(f"tile-440x280-{lg}", 440, 280, f"""
    <div class="slab" style="right:0;top:0;bottom:0;width:178px"></div>
    <div class="logo" style="position:absolute;right:14px;bottom:30px;width:176px;height:176px;transform:rotate(-3deg)">{logo}</div>
    <div style="position:absolute;left:26px;top:34px;width:236px">
      <h1 style="font-size:50px;margin:0 0 14px">Talktrail</h1>
      <p style="font-size:17.5px;line-height:1.35;color:#cfc9b6;text-wrap:balance">{t['tile']}</p>
    </div>""")
# ---------- marquee 1400x560 ----------
for lg in ("pt", "en"):
    t = T[lg]
    pagina(f"marquee-1400x560-{lg}", 1400, 560, f"""
    <div class="slab" style="right:0;top:0;bottom:0;width:520px"></div>
    <img class="painel" src="{P('texto')}" style="right:84px;top:56px;width:300px;height:570px;object-fit:cover;object-position:top;transform:rotate(3deg)">
    <div class="logo" style="position:absolute;right:360px;bottom:28px;width:190px;height:190px;transform:rotate(-4deg)">{logo}</div>
    <div style="position:absolute;left:76px;top:120px;width:790px">
      <h1 style="font-size:{58 if lg == 'pt' else 50}px;margin:0 0 22px">{t['mq']}</h1>
      <p style="font-size:23px;line-height:1.4;color:#cfc9b6;max-width:700px;text-wrap:balance">{t['mqb']}</p>
      <p style="margin-top:22px;color:{TEAL};font:600 21px 'IBM Plex Sans';letter-spacing:.01em">{t['mqc']}</p>
    </div>""")

# ---------- capturas 1280x800 (pt) ----------
t = T["pt"]
def texto(h, sub, marca=True, tam=78):
    return f"""<div class="logo" style="position:absolute;left:64px;top:56px;width:84px;height:84px;transform:rotate(-4deg)">{logo}</div>
    <div style="position:absolute;left:64px;top:230px;width:560px">
      <h1 style="font-size:{tam}px">{h}</h1>
      <p style="font-size:25px;line-height:1.4;color:#cfc9b6;margin-top:26px;max-width:480px;text-wrap:balance">{sub}</p></div>"""
# 1 transcrição ao vivo: janela de chamada fictícia + painel
tiles = "".join(f'<div style="background:#272a31;border-radius:12px;display:flex;align-items:center;justify-content:center;{"outline:4px solid "+TEAL+";" if i==1 else ""}">'
                f'<div style="width:78px;height:78px;border-radius:50%;background:{c};color:{CARV};font:900 34px Archivo;display:flex;align-items:center;justify-content:center">{l}</div></div>'
                for i, (l, c) in enumerate((("E", MARF), ("A", "#8497EE"), ("C", "#D9A441"), ("M", "#3FBF6B"))))
pagina("captura-1-transcricao", 1280, 800, f"""
  <div class="slab" style="left:690px;top:0;bottom:0;right:0"></div>
  <div style="position:absolute;left:600px;top:150px;width:440px;height:340px;background:{GRAF};border-radius:16px;border:2px solid {CARV};box-shadow:12px 12px 0 {CARV};transform:rotate(-4deg);padding:16px">
    <div style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:12px;height:100%">{tiles}</div></div>
  <img class="painel" src="{P('texto')}" style="left:850px;top:60px;width:350px;height:665px;object-fit:cover">
  {texto(t['s1'], t['s1b'])}""")
# 2 arquivo .md
md = f"""<div style="color:#8c8a7e">---</div><div><span style="color:{TEAL}">tipo:</span> reuniao</div><div><span style="color:{TEAL}">titulo:</span> "Revisão do projeto Aurora"</div>
<div><span style="color:{TEAL}">tags:</span> [Produto, Aurora]</div><div><span style="color:{TEAL}">data:</span> 2026-10-13</div><div><span style="color:{TEAL}">duracao_min:</span> 38</div>
<div><span style="color:{TEAL}">participantes:</span> [Eu, Ana, Carlos]</div><div style="color:#8c8a7e">---</div><div style="height:12px"></div>
<div style="color:{MARF};font-weight:600"># Revisão do projeto Aurora</div><div style="height:10px"></div>
<div style="color:{MARF};font-weight:600">## Transcrição</div><div style="height:10px"></div>
<div><b style="color:{MARF}">[00:12] Eu:</b> Vamos começar pelo protótipo. A Ana</div><div style="padding-left:2ch">já testou com o cliente?</div><div style="height:6px"></div>
<div><b style="color:{MARF}">[00:31] Ana:</b> Testei na terça. Gostaram do fluxo,</div><div style="padding-left:2ch">mas pediram para simplificar a tela.</div><div style="height:6px"></div>
<div><b style="color:{MARF}">[00:58] Carlos:</b> Dá para cortar dois campos sem</div><div style="padding-left:2ch">perder nada. Eu ajusto hoje.</div>"""
pagina("captura-2-arquivo", 1280, 800, f"""
  <div class="slab" style="left:690px;top:0;bottom:0;right:0"></div>
  <div style="position:absolute;left:716px;top:96px;width:508px;background:{CARV};border-radius:14px;border:2px solid {CARV};box-shadow:12px 12px 0 {CARV};transform:rotate(2deg);overflow:hidden">
    <div style="background:{GRAF};padding:14px 18px;font:500 14px 'IBM Plex Mono';color:#cfc9b6;display:flex;gap:10px;align-items:center"><span style="width:12px;height:12px;border-radius:50%;background:{TEAL}"></span>2026-10-13_14h02_revisao-aurora.md</div>
    <div style="padding:22px 22px 26px;font:500 15px/1.5 'IBM Plex Mono',monospace;color:#cfc9b6;white-space:nowrap">{md}</div></div>
  {texto(t['s2'], t['s2b'])}""")
# 3 agenda e pauta no painel
pagina("captura-3-agenda-pauta", 1280, 800, f"""
  <div class="slab" style="left:620px;top:0;bottom:0;right:0"></div>
  <img class="painel" src="{P('agenda')}" style="left:668px;top:78px;width:280px;height:532px;object-fit:cover;object-position:top">
  <img class="painel" src="{P('pauta')}" style="left:962px;top:178px;width:280px;height:532px">
  {texto(t['s3'], t['s3b'], tam=68)}""")
# 4 a página de Pautas e o arquivo .md
import datetime
def util(n):
    d = datetime.date.today(); k = 0
    while k < n:
        d += datetime.timedelta(days=1)
        if d.weekday() < 5: k += 1
    return d.isoformat()
md4 = f"""<div style="color:#8c8a7e">---</div><div><span style="color:{TEAL}">titulo:</span> "Planejamento do trimestre"</div>
<div><span style="color:{TEAL}">data:</span> {util(1)}</div><div><span style="color:{TEAL}">hora:</span> 15:00</div><div style="color:#8c8a7e">---</div><div style="height:8px"></div>
<div>1. Metas do trimestre</div><div>2. Prioridades por time</div><div>3. Riscos e dependências</div><div style="height:8px"></div>
<div>Combinados</div><div>- [ ] Fechar o orçamento</div><div>- [ ] Definir responsáveis</div>"""
pagina("captura-4-pautas", 1280, 800, f"""
  <div class="slab" style="left:500px;top:0;bottom:0;right:0"></div>
  <div class="logo" style="position:absolute;left:64px;top:56px;width:84px;height:84px;transform:rotate(-4deg)">{logo}</div>
  <div style="position:absolute;left:64px;top:230px;width:440px"><h1 style="font-size:56px">{t['s3x']}</h1>
    <p style="font-size:23px;line-height:1.4;color:#cfc9b6;margin-top:24px;max-width:400px;text-wrap:balance">{t['s3xb']}</p></div>
  <img class="painel" src="{P('pautas-pagina')}" style="left:540px;top:70px;width:690px;height:477px;object-fit:cover;object-position:top left;transform:rotate(1.2deg)">
  <div style="position:absolute;left:566px;top:468px;width:410px;background:{CARV};border-radius:14px;border:2px solid {CARV};box-shadow:10px 10px 0 {CARV};transform:rotate(-2deg);overflow:hidden">
    <div style="background:{GRAF};padding:11px 16px;font:500 13px 'IBM Plex Mono';color:#cfc9b6;display:flex;gap:9px;align-items:center"><span style="width:10px;height:10px;border-radius:50%;background:{TEAL}"></span>Pautas/{util(1)}_15h00_planejamento.md</div>
    <div style="padding:16px 18px 18px;font:500 14px/1.5 'IBM Plex Mono',monospace;color:#cfc9b6;white-space:nowrap">{md4}</div></div>
""")
# 4 privacidade: fluxo
SETA = f'<svg width="54" height="30" viewBox="0 0 54 30" style="position:absolute"><path d="M2 15 H44 M32 4 L46 15 L32 26" fill="none" stroke="{CARV}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
def caixa(x, y, w, h, bg, fg, titulo, sub, rot=0, extra=""):
    return (f'<div style="position:absolute;left:{x}px;top:{y}px;width:{w}px;height:{h}px;background:{bg};color:{fg};border:2px solid {CARV};border-radius:14px;'
            f'box-shadow:10px 10px 0 {CARV};padding:24px 26px;transform:rotate({rot}deg)"><div style="font:900 34px/1 Archivo">{titulo}</div>'
            f'<div style="font:500 19px/1.35 \'IBM Plex Sans\';margin-top:12px;opacity:.88;max-width:250px;text-wrap:balance">{sub}</div>{extra}</div>')
riscadas = "".join(f'<div style="font:600 36px/1.45 Archivo;color:{MARF};text-decoration:line-through;text-decoration-thickness:3px;text-decoration-color:{TEAL}">{c}</div>' for c in ("conta", "nuvem", "telemetria"))
pagina("captura-5-privacidade", 1280, 800, f"""
  <div class="slab" style="left:0;top:470px;bottom:0;right:0"></div>
  <div class="logo" style="position:absolute;left:64px;top:56px;width:84px;height:84px;transform:rotate(-4deg)">{logo}</div>
  <div style="position:absolute;left:64px;top:170px;width:760px"><h1 style="font-size:78px">{t['s4']}</h1>
    <p style="font-size:25px;line-height:1.4;color:#cfc9b6;margin-top:22px;max-width:640px;text-wrap:balance">{t['s4b']}</p></div>
  <div style="position:absolute;left:900px;top:150px;transform:rotate(2deg)">{riscadas}</div>
  {caixa(64, 540, 340, 190, GRAF, MARF, "Google Meet", "A chamada que você já usa.", -1)}
  <div style="position:absolute;left:412px;top:620px">{SETA}</div>
  {caixa(480, 540, 340, 190, CARV, MARF, "Talktrail", "Lê as legendas e monta o texto na sua máquina.", 1)}
  <div style="position:absolute;left:828px;top:620px">{SETA}</div>
  {caixa(896, 540, 320, 190, PASTA, CARV, "Sua pasta", "Um arquivo .md por reunião.", -1,
         extra="<div style=\"font:600 14px 'IBM Plex Mono';margin-top:14px;opacity:.7\">2026-10-13_revisao-aurora.md</div>")}
""")

icone = re.sub(r'viewBox="[^"]+"', 'viewBox="-32 -32 192 192"', open(os.path.join(RAIZ, "../design/logo-final/fita-completo.svg")).read(), count=1)
open(os.path.join(RAIZ, "src", "store-icon.svg"), "w").write(icone)
import shutil; shutil.copy(os.path.join(RAIZ, "../extension/icons/icon-128.png"), os.path.join(RAIZ, "out", VARIANTE, "icone-loja-128.png"))  # o ícone da loja é o mesmo da extensão: cassete alto, preenche o quadrado
if len(sys.argv) > 2 and sys.argv[2] == "so-html": sys.exit()
for nome, w, h in [("tile-440x280-pt", 440, 280), ("tile-440x280-en", 440, 280), ("marquee-1400x560-pt", 1400, 560), ("marquee-1400x560-en", 1400, 560),
                   ("captura-1-transcricao", 1280, 800), ("captura-2-arquivo", 1280, 800), ("captura-3-agenda-pauta", 1280, 800), ("captura-4-pautas", 1280, 800), ("captura-5-privacidade", 1280, 800)]:
    render(nome, w, h)
print("ok")
