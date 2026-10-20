"""Capa larga (o Buy Me a Coffee corta ~110 px de cada lado e a faixa de baixo fica sob os cartões: texto no miolo e em cima) (1920x420, o mínimo que o Buy Me a Coffee recomenda é 1800x400) pra página do Buy Me a Coffee. Uso: servidor estático na raiz (python3 -m http.server 8799) e python3 store/capa.py"""
import os, re, subprocess
RAIZ = os.path.dirname(os.path.abspath(__file__))
HELIUM = "/Applications/Helium.app/Contents/MacOS/Helium"
CARV, MARF, TEAL = "#0E0F12", "#E7DFC7", "#2DD4BF"
logo = open(os.path.join(RAIZ, "../design/logo-final/fita-cheio128.svg")).read()
logo = re.sub(r'\s(width|height)="\d+"', "", logo, count=2)
GRAO = ("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'>"
        "<feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0'/></filter>"
        "<rect width='100%' height='100%' filter='url(%23n)'/></svg>")
W, H = 1920, 420
html = f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><link rel="stylesheet" href="fonts.css"><style>
*{{box-sizing:border-box;margin:0}}html,body{{background:{CARV}}}
body{{width:{W}px;height:{H}px;position:relative;overflow:hidden;color:{MARF};font-family:'IBM Plex Sans',sans-serif;-webkit-font-smoothing:antialiased}}
body::after{{content:"";position:absolute;inset:0;background:url("{GRAO}");opacity:.07;mix-blend-mode:screen}}
.slab{{position:absolute;right:0;top:0;bottom:0;width:560px;background:{MARF}}}
h1{{font-family:'Archivo';font-weight:900;letter-spacing:-.03em;line-height:.9;font-size:132px}}
.logo{{position:absolute;width:250px;height:250px;right:210px;top:58px;transform:rotate(-4deg)}}.logo svg{{width:100%;height:100%}}
</style></head><body>
<div class="slab"></div>
<div class="logo">{logo}</div>
<div style="position:absolute;left:270px;top:46px;width:1000px;display:flex;flex-direction:column">
  <h1>Talktrail</h1>
  <p style="font-size:36px;line-height:1.3;color:#cfc9b6;margin-top:20px">Transcrição do Google Meet, só no seu computador.</p>
  <p style="font:600 26px 'IBM Plex Sans';margin-top:14px;color:{TEAL}">Sem conta. Sem nuvem. Sem telemetria.</p>
</div></body></html>"""
open(os.path.join(RAIZ, "src", "capa-apoio.html"), "w").write(html)
saida = os.path.join(RAIZ, "..", "docs", "capa-apoio.png")
subprocess.run([HELIUM, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--window-size={W},{H}", "--virtual-time-budget=5000",
                f"--screenshot={saida}", "http://127.0.0.1:8799/store/src/capa-apoio.html"], capture_output=True, timeout=90)
print("ok", saida)
