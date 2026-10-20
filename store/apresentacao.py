"""Imagem de apresentação (1080x1350, boa pro WhatsApp e pro LinkedIn), em português e em inglês.
Uso: servidor estático na raiz (python3 -m http.server 8799) e python3 store/apresentacao.py  -> docs/apresentacao-pt.png e -en.png"""
import os, re, subprocess
RAIZ = os.path.dirname(os.path.abspath(__file__))
HELIUM = "/Applications/Helium.app/Contents/MacOS/Helium"
CARV, GRAF, MARF, TEAL = "#0E0F12", "#1A1C21", "#E7DFC7", "#2DD4BF"
logo = open(os.path.join(RAIZ, "../design/logo-final/fita-cheio128.svg")).read()
logo = re.sub(r'\s(width|height)="\d+"', "", logo, count=2)
GRAO = ("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'>"
        "<feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0'/></filter>"
        "<rect width='100%' height='100%' filter='url(%23n)'/></svg>")
TXT = {
  "pt": dict(lang="pt-BR", pasta="painel", h1="Sua reunião do Meet<br>vira texto.", h2="Só no seu computador.", chips=["Grátis", "Sem conta", "Sem nuvem"],
             f1="Painel ao lado da chamada", f2="Um arquivo .md por reunião", f3="Pauta de cada reunião", cta="Chrome Web Store", cta2="Busque por Talktrail",
             arq="2026-10-13_14h02_revisao-aurora.md", titulo="Revisão do projeto Aurora", k=("tipo", "reuniao", "titulo", "duracao_min", "participantes"), h="Transcrição", eu="Eu",
             l1="Vamos começar pelo protótipo.", l2="Testei na terça. Gostaram do fluxo."),
  "en": dict(lang="en", pasta="painel-en", h1="Your Meet call<br>becomes text.", h2="Only on your computer.", chips=["Free", "No account", "No cloud"],
             f1="Panel next to the call", f2="One .md file per meeting", f3="An agenda for each meeting", cta="Chrome Web Store", cta2="Search for Talktrail",
             arq="2026-10-13_14h02_aurora-project-review.md", titulo="Aurora project review", k=("type", "meeting", "title", "duration_min", "participants"), h="Transcript", eu="Me",
             l1="Let's start with the prototype.", l2="I tested it Tuesday. They liked the flow."),
}
for lg, t in TXT.items():
    chips = "".join(f'<span class="chip">{c}</span>' for c in t["chips"])
    kt, kv, kti, kd, kp = t["k"]
    html = f"""<!doctype html><html lang="{t['lang']}"><head><meta charset="utf-8"><link rel="stylesheet" href="fonts.css"><style>
*{{box-sizing:border-box;margin:0}}html,body{{background:{CARV}}}
body{{width:1080px;height:1350px;position:relative;overflow:hidden;color:{MARF};font-family:'IBM Plex Sans',sans-serif;-webkit-font-smoothing:antialiased}}
body::after{{content:"";position:absolute;inset:0;background:url("{GRAO}");opacity:.07;mix-blend-mode:screen;pointer-events:none}}
.logo{{position:absolute;left:72px;top:64px;width:96px;height:96px;transform:rotate(-4deg)}}.logo svg{{width:100%;height:100%}}
.marca{{position:absolute;left:190px;top:92px;font:900 40px 'Archivo';letter-spacing:-.02em}}
h1{{position:absolute;left:72px;top:204px;width:960px;font:900 88px/1 'Archivo';letter-spacing:-.03em;white-space:nowrap}}
h1 em{{display:block;margin-top:22px;font-style:normal;font-size:70px;color:{TEAL}}}
.chips{{position:absolute;left:72px;top:560px;display:flex;gap:14px}}
.chip{{font:600 26px 'IBM Plex Sans';color:{TEAL};border:2px solid {TEAL};border-radius:999px;padding:8px 22px}}
.slab{{position:absolute;left:0;right:0;top:672px;bottom:0;background:{MARF}}}
.painel{{position:absolute;border-radius:16px;border:2px solid {CARV};box-shadow:12px 12px 0 {CARV}}}
.arq{{position:absolute;background:{CARV};border-radius:14px;border:2px solid {CARV};box-shadow:12px 12px 0 {CARV};overflow:hidden}}
.arq .topo{{background:{GRAF};padding:12px 16px;font:500 14px 'IBM Plex Mono',monospace;color:#cfc9b6;display:flex;gap:10px;align-items:center;white-space:nowrap}}
.arq .topo i{{width:11px;height:11px;border-radius:50%;background:{TEAL};flex:none}}
.arq .corpo{{padding:18px 20px 22px;font:500 15px/1.55 'IBM Plex Mono',monospace;color:#cfc9b6;white-space:nowrap}}
.k{{color:{TEAL}}}.b{{color:{MARF};font-weight:600}}
.feat{{position:absolute;left:72px;font:700 34px/1.2 'Archivo';color:{CARV};letter-spacing:-.01em}}
.feat span{{display:inline-block;width:14px;height:14px;border-radius:50%;background:{CARV};margin-right:16px;vertical-align:middle;position:relative;top:-3px}}
.cta{{position:absolute;left:72px;bottom:44px;background:{CARV};color:{MARF};border-radius:16px;padding:16px 28px;display:flex;flex-direction:column;gap:4px}}
.cta b{{font:900 36px 'Archivo';letter-spacing:-.01em}}.cta small{{font:500 22px 'IBM Plex Sans';color:#cfc9b6}}
</style></head><body>
<div class="logo">{logo}</div><div class="marca">Talktrail</div>
<h1>{t['h1']}<br><em>{t['h2']}</em></h1>
<div class="chips">{chips}</div>
<div class="slab"></div>
<img class="painel" src="../{t['pasta']}/texto.png" style="left:612px;top:636px;width:400px;height:660px;object-fit:cover;object-position:top;transform:rotate(2.5deg)">
<div class="arq" style="left:56px;top:880px;width:520px;transform:rotate(-2.5deg)">
  <div class="topo"><i></i>{t['arq']}</div>
  <div class="corpo"><div style="color:#8c8a7e">---</div><div><span class="k">{kt}:</span> {kv}</div><div><span class="k">{kti}:</span> "{t['titulo']}"</div><div><span class="k">{kd}:</span> 38</div><div><span class="k">{kp}:</span> [{t['eu']}, Ana, Carlos]</div><div style="color:#8c8a7e">---</div>
  <div style="height:10px"></div><div class="b">## {t['h']}</div><div style="height:6px"></div>
  <div><b class="b">[00:12] {t['eu']}:</b> {t['l1']}</div></div>
</div>
<div class="feat" style="top:702px"><span></span>{t['f1']}</div>
<div class="feat" style="top:756px"><span></span>{t['f2']}</div>
<div class="feat" style="top:810px"><span></span>{t['f3']}</div>
<div class="cta"><b>{t['cta']}</b><small>{t['cta2']}</small></div>
</body></html>"""
    nome = f"apresentacao-{lg}"
    open(os.path.join(RAIZ, "src", nome + ".html"), "w", encoding="utf-8").write(html)
    saida = os.path.join(RAIZ, "..", "docs", nome + ".png")
    subprocess.run([HELIUM, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=1080,1350", "--virtual-time-budget=5000",
                    f"--screenshot={saida}", f"http://127.0.0.1:8799/store/src/{nome}.html"], capture_output=True, timeout=90)
    print("ok", saida)
