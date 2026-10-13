"""Logo final do Talktrail: fita cassete com T, rastro de onda normal (fita de largura
constante), teal, adesivo recortado. Gera fita-{completo,medio,mini}.svg e os PNGs
16/32/48/128 em extension/icons via rsvg-convert."""
import math, os, subprocess
CARV, MARF, TEAL, ESC = "#0E0F12", "#F1EAD2", "#2DD4BF", "#0F766E"
T = f'<path d="M0 0 H20 V6.2 H13.2 V18 H6.8 V6.2 H0 Z" fill="{CARV}" stroke="none"/>'
dots = lambda pts, cor=CARV: "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{cor}" stroke="none"/>' for x, y, r in pts)

def adesivo(sil, arte, rot=0, sombra=5, halo=16, traco=5.5):
    r = f' transform="rotate({rot} 64 64)"' if rot else ""
    gs = f'stroke-linejoin="round" stroke-linecap="round" stroke-width="{halo}"'
    return (f'<g transform="translate({sombra} {sombra})"><g{r} fill="{CARV}" stroke="{CARV}" {gs}>{sil}</g></g>'
            f'<g{r} fill="{MARF}" stroke="{MARF}" {gs}>{sil}</g>'
            f'<g{r} stroke="{CARV}" stroke-width="{traco}" stroke-linejoin="round" stroke-linecap="round">{arte}</g>')
svg = lambda c, vb: f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="128" height="128">{c}</svg>\n'

def catmull(P, n=8):
    P = [P[0]] + P + [P[-1]]; out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i-1], P[i], P[i+1], P[i+2]
        for k in range(n):
            t = k / n
            out.append(tuple(.5 * ((2*p1[j]) + (-p0[j]+p2[j])*t + (2*p0[j]-5*p1[j]+4*p2[j]-p3[j])*t*t + (-p0[j]+3*p1[j]-3*p2[j]+p3[j])*t**3) for j in (0, 1)))
    out.append(P[-2]); return out

def onda_fita(sx, sy, comp=44, amp=7, per=5.4, decay=.01, sw=5.5):
    """Rastro: a fita desce da base (sx, sy) e faz uma onda curta, largura constante."""
    ent = catmull([(sx, sy), (sx - .5, sy + 8), (sx + 2, sy + 15)])[:-1]
    n = int(comp / 1.2)
    w = [(sx + 2 + i * 1.2, sy + 17 + amp * math.exp(-decay * i * 1.2) * math.sin(i * 1.2 / per)) for i in range(n + 1)]
    pts = ent + w
    return f'<path d="M' + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts) + f'" fill="none" stroke-width="{sw}"/>'

# ---------- 128 px (e SVG mestre): cassete completo ----------
def completo():
    cas = 'translate(5 -7) scale(.82)'
    sx, sy = 5 + 64 * .82, -7 + 102 * .82
    tr = onda_fita(sx, sy)
    c = f'<rect x="8" y="20" width="112" height="82" rx="12" fill="{TEAL}"/>'
    c += dots([(18, 30, 2.8), (110, 30, 2.8), (18, 92, 2.8), (110, 92, 2.8)])
    c += f'<rect x="20" y="29" width="88" height="51" rx="6" fill="{MARF}" stroke-width="4.5"/>'
    c += f'<rect x="23" y="32" width="82" height="7" rx="1" fill="{ESC}" stroke="none"/>'
    c += '<path d="M30 49 H58" stroke-width="3.5" fill="none"/><path d="M30 57 H44" stroke-width="3.5" fill="none"/>'
    c += f'<g transform="translate(86 44) scale(.82)">{T}</g>'
    c += f'<rect x="36" y="58" width="56" height="17" rx="8.5" fill="{CARV}" stroke="none"/>'
    c += dots([(47, 66.5, 6.2), (81, 66.5, 6.2)], MARF) + dots([(47, 66.5, 2.2), (81, 66.5, 2.2)])
    c += f'<path d="M28 102 L38 86 H90 L100 102" fill="{CARV}"/>' + dots([(48, 95, 3.4), (80, 95, 3.4)], TEAL)
    sil = f'<g transform="{cas}"><rect x="8" y="20" width="112" height="82" rx="12"/></g>' + tr
    return adesivo(sil, tr + f'<g transform="{cas}">{c}</g>', rot=-4)

# ---------- 48 px: janela maior, T ao lado, onda mais grossa ----------
def medio():
    cas = 'translate(5 -7) scale(.82)'
    sx, sy = 5 + 64 * .82, -7 + 102 * .82
    tr = onda_fita(sx, sy, sw=7.5)
    c = f'<rect x="8" y="20" width="112" height="82" rx="12" fill="{TEAL}"/>'
    c += f'<rect x="20" y="29" width="88" height="46" rx="8" fill="{MARF}" stroke-width="5.5"/>'
    c += f'<rect x="27" y="40" width="48" height="24" rx="12" fill="{CARV}" stroke="none"/>'
    c += dots([(41, 52, 7.5), (61, 52, 7.5)], MARF) + dots([(41, 52, 2.6), (61, 52, 2.6)])
    c += f'<g transform="translate(82 37) scale(1.1)">{T}</g>'
    c += f'<path d="M28 102 L38 86 H90 L100 102" fill="{CARV}"/>' + dots([(48, 95, 3.4), (80, 95, 3.4)], TEAL)
    sil = f'<g transform="{cas}"><rect x="8" y="20" width="112" height="82" rx="12"/></g>' + tr
    return adesivo(sil, tr + f'<g transform="{cas}">{c}</g>', rot=-4, traco=6.5)

# ---------- 32 e 16 px: reto, traço grosso, sem onda (em 1 px ela vira borrão) ----------
def mini(com_onda):
    tr = onda_fita(64, 102, comp=34, amp=6, per=5.0, sw=8) if com_onda else ""
    sil = '<rect x="10" y="20" width="108" height="76" rx="14"/>' + tr
    a = tr + f'<rect x="10" y="20" width="108" height="76" rx="14" fill="{TEAL}"/>'
    a += f'<rect x="24" y="30" width="80" height="40" rx="8" fill="{MARF}" stroke-width="7"/>'
    a += f'<rect x="34" y="39" width="60" height="22" rx="11" fill="{CARV}" stroke="none"/>'
    a += dots([(49, 50, 8), (79, 50, 8)], MARF) + dots([(49, 50, 3), (79, 50, 3)])
    a += f'<path d="M30 96 L40 78 H88 L98 96" fill="{CARV}" stroke-width="7"/>'
    return adesivo(sil, a, rot=0, sombra=5, halo=12, traco=8)

VB_QUAD = "-8 -8 144 144"
arquivos = {"completo": (completo(), VB_QUAD), "medio": (medio(), VB_QUAD),
            "mini": (mini(False), "-4 8 136 112")}
for k, (corpo, vb) in arquivos.items():
    open(f"fita-{k}.svg", "w").write(svg(corpo, vb))
os.makedirs("../../extension/icons", exist_ok=True)
for tam, k in ((128, "completo"), (48, "medio"), (32, "mini"), (16, "mini")):
    subprocess.run(["rsvg-convert", "-w", str(tam), "-h", str(tam), "-a", "-b", "none", f"fita-{k}.svg",
                    "-o", f"../../extension/icons/icon-{tam}.png"], check=True)
print("ok")
