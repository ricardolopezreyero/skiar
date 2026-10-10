#!/usr/bin/env python3
"""Genera site/og.jpg (1200x630): la imagen que aparece al compartir la liga.

Izquierda: título y mapita de Colorado con los 4 destinos.
Derecha: las 4 mejores fotos (Wikimedia Commons), con el mismo tono de la página.
Si una foto no se puede descargar, queda un fondo de montaña en su lugar.

Uso: python3 tools/build_og.py
"""
import hashlib
import io
import re
import json
import pathlib
import urllib.parse
import urllib.request

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONTS = ROOT / "tools" / "fonts"
OUT = ROOT / "site" / "og.jpg"
W, H = 1200, 630

FOTOS = [
    ("A_family_snow_tubing_at_Keystone_Resort_in_Colorado.JPG", "Keystone"),
    ("Breckenridge_Ski_Area_from_Dercum_Mountain,_Keystone_Ski_Area.jpg", "Breckenridge"),
    ("Magic_carpet_at_Keystone_Mountain_in_Colorado.JPG", "Clases para niños"),
    ("Snowmass_gondola_and_Ski_area.jpg", "Snowmass"),
]
COLOR_RESORT = {"keystone": "#e0703a", "breckenridge": "#7a4fd0", "steamboat": "#2e8b57", "snowmass": "#1d5fa8"}
NOMBRE = {"keystone": "Keystone", "breckenridge": "Breckenridge", "steamboat": "Steamboat", "snowmass": "Snowmass"}


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


def descargar(archivo):
    url = "https://commons.wikimedia.org/wiki/Special:FilePath/" + urllib.parse.quote(archivo) + "?width=900"
    req = urllib.request.Request(url, headers={"User-Agent": "skiar-og/1.0 (https://github.com/ricardolopezreyero/skiar)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return Image.open(io.BytesIO(r.read())).convert("RGB")


def respaldo(w, h):
    im = Image.new("RGB", (w, h), "#cfe3f5")
    d = ImageDraw.Draw(im)
    for y in range(h):
        t = y / h
        d.line([(0, y), (w, y)], fill=(int(207 - 40 * t), int(227 - 30 * t), int(245 - 10 * t)))
    d.polygon([(0, h), (w * 0.35, h * 0.35), (w * 0.7, h)], fill="#ffffff")
    d.polygon([(w * 0.4, h), (w * 0.72, h * 0.45), (w, h * 0.8), (w, h)], fill="#e9f2fb")
    return im


def cubrir(im, w, h):
    r = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


def tono(im):
    # el mismo tono de la página: un poco menos saturado, más contraste y un velo cálido/frío
    im = ImageEnhance.Color(im).enhance(0.9)
    im = ImageEnhance.Contrast(im).enhance(1.06)
    im = ImageEnhance.Brightness(im).enhance(1.04)
    velo = Image.new("RGB", im.size)
    dv = ImageDraw.Draw(velo)
    for y in range(im.height):
        t = y / im.height
        dv.line([(0, y), (im.width, y)], fill=(int(120 + 104 * t), int(170 - 58 * t), int(220 - 162 * t)))
    return Image.blend(im, velo, 0.08)


def redondear(im, radio):
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, im.width - 1, im.height - 1], radio, fill=255)
    return im, mask


def chip(d, xy, texto, f, fondo=(15, 42, 67), color="#ffffff"):
    x, y = xy
    l, t, r, b = d.textbbox((0, 0), texto, font=f)
    d.rounded_rectangle([x, y, x + (r - l) + 24, y + (b - t) + 14], 999, fill=fondo)
    d.text((x + 12 - l, y + 7 - t), texto, font=f, fill=color)


def main():
    lienzo = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(lienzo)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=(int(15 + 8 * t), int(42 + 16 * t), int(67 + 30 * t)))

    # ---- izquierda: textos
    x0 = 52
    d.text((x0, 50), "TEMPORADA 2026-27  ·  COLORADO", font=font("inter-latin-700-normal.woff", 17), fill="#9cc6f0")
    ft = font("Fraunces-Bold.woff", 60)
    d.text((x0, 82), "Viaje familiar", font=ft, fill="#ffffff")
    d.text((x0, 150), "a esquiar 2027", font=ft, fill="#ffffff")
    d.text((x0, 232), "Fechas, hospedaje, precios y nieve", font=font("inter-latin-500-normal.woff", 21), fill="#cfe0f0")

    # ---- izquierda: mapita de la zona de esquí de Colorado (de Steamboat a Snowmass y Denver)
    mx, my, mw, mh = x0, 282, 456, 300
    lat_n, lat_s, lng_o, lng_e = 40.85, 38.95, -107.75, -104.2
    px = lambda lng: mx + (lng - lng_o) / (lng_e - lng_o) * mw
    py = lambda lat: my + (lat_n - lat) / (lat_n - lat_s) * mh
    mapa = Image.new("RGB", (mw, mh), "#eef5fc")
    dm = ImageDraw.Draw(mapa)
    for y in range(mh):
        t = y / mh
        dm.line([(0, y), (mw, y)], fill=(int(238 - 14 * t), int(245 - 10 * t), int(252 - 4 * t)))
    # cordilleras estilizadas (zona montañosa del centro-oeste)
    picos = [(-107.4, 40.7), (-106.3, 40.6), (-105.7, 40.45), (-107.2, 40.1), (-106.5, 40.0), (-105.6, 39.95),
             (-107.5, 39.55), (-106.6, 39.65), (-105.3, 39.45), (-107.3, 39.15), (-106.45, 39.15), (-105.6, 39.15),
             (-106.0, 40.15), (-107.0, 39.4), (-105.35, 40.8)]
    for lng, lat in picos:
        cx, cy = (lng - lng_o) / (lng_e - lng_o) * mw, (lat_n - lat) / (lat_n - lat_s) * mh
        dm.polygon([(cx - 26, cy + 16), (cx, cy - 18), (cx + 26, cy + 16)], fill="#c9dcef")
        dm.polygon([(cx - 9, cy - 6), (cx, cy - 18), (cx + 9, cy - 6), (cx + 3, cy - 3), (cx - 3, cy - 5)], fill="#ffffff")
    dm.text((mw - 150, mh - 38), "COLORADO", font=font("inter-latin-800-normal.woff", 20), fill="#b4c9de")
    mapa, mask = redondear(mapa, 18)
    lienzo.paste(mapa, (mx, my), mask)

    puntos = {p["id"]: p for p in json.loads((ROOT / "book" / "mapa.json").read_text(encoding="utf-8"))["puntos"]}
    fl = font("inter-latin-700-normal.woff", 15)
    den = puntos.get("den")
    if den:
        x, y = px(den["lng"]), py(den["lat"])
        d.ellipse([x - 6, y - 6, x + 6, y + 6], fill="#12263a", outline="#ffffff", width=2)
        chip(d, (x - 86, y - 14), "✈ Denver" if False else "Denver", fl, fondo=(18, 38, 58), color="#ffffff")
    offs = {"keystone": (12, -34), "breckenridge": (14, 2), "steamboat": (14, -14), "snowmass": (14, -14)}
    for slug, color in COLOR_RESORT.items():
        p = puntos.get(slug)
        if not p:
            continue
        x, y = px(p["lng"]), py(p["lat"])
        d.ellipse([x - 10, y - 10, x + 10, y + 10], fill=color, outline="#ffffff", width=3)
        ox, oy = offs[slug]
        chip(d, (x + ox, y + oy), NOMBRE[slug], fl, fondo=(255, 255, 255), color="#12263a")

    # ---- derecha: 4 fotos en cuadrícula
    gx, gy, gap = 552, 26, 10
    cw, ch = (W - gx - 26 - gap) // 2, (H - 2 * gy - gap) // 2
    fe = font("inter-latin-700-normal.woff", 16)
    for n, (archivo, etiqueta) in enumerate(FOTOS):
        try:
            im = cubrir(descargar(archivo), cw, ch)
            print("ok   ", archivo)
        except Exception as e:  # sin red o archivo no disponible
            print("falla", archivo, "->", e)
            im = respaldo(cw, ch)
        im = tono(im)
        im, mask = redondear(im, 16)
        x, y = gx + (n % 2) * (cw + gap), gy + (n // 2) * (ch + gap)
        lienzo.paste(im, (x, y), mask)
        chip(d, (x + 12, y + ch - 42), etiqueta, fe, fondo=(15, 42, 67))

    lienzo = lienzo.filter(ImageFilter.UnsharpMask(radius=1, percent=40, threshold=3))
    lienzo.save(OUT, "JPEG", quality=86, optimize=True, progressive=True)
    print(f"ok: {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")

    # versión de la imagen para que WhatsApp y compañía no se queden con una vieja
    index = ROOT / "site" / "index.html"
    huella = hashlib.sha1(OUT.read_bytes()).hexdigest()[:10]
    index.write_text(re.sub(r"og\.jpg\?v=[0-9a-z]+", f"og.jpg?v={huella}", index.read_text(encoding="utf-8")), encoding="utf-8")


if __name__ == "__main__":
    main()
