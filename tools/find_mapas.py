#!/usr/bin/env python3
"""Busca la liga directa del mapa de pistas de cada resort (corre en GitHub Actions).

1) Entra a la página oficial del mapa (mapa_pagina) y toma el PDF/imagen de invierno más reciente.
2) Si no hay, prueba skimap.org (archivo público de mapas) usando el id que aparece en las fuentes.

Escribe book/pistas/_auto.json = {slug: {"mapa_pdf": url, "mapa_img": url, "origen": "..."}}
que tools/build_site.py usa cuando el resort no trae liga directa.

Uso: python3 tools/find_mapas.py
"""
import html
import json
import pathlib
import re
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
PISTAS = ROOT / "book" / "pistas"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"


def get(url, n=3_000_000):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read(n).decode("utf-8", "replace"), r.geturl()


def puntaje(url):
    u = urllib.parse.unquote(url).lower()
    s = 0
    for k, v in (("trail", 3), ("map", 2), ("winter", 3), ("ski", 1), ("2026", 4), ("26-27", 4), ("2025", 2), ("25-26", 2)):
        if k in u:
            s += v
    for k in ("summer", "bike", "hike", "village", "dining", "parking", "lift-ticket", "brochure", "2019", "2020", "2021", "2022"):
        if k in u:
            s -= 8
    return s


def desde_pagina(url):
    texto, final = get(url)
    texto = html.unescape(texto)
    candidatos = set()
    for m in re.finditer(r"""(?:href|src|data-src|content)=["']([^"']+)["']""", texto):
        c = m.group(1)
        lc = c.lower().split("?")[0]
        if lc.endswith((".pdf", ".ashx")) or "aemasset" in lc or ("trail" in lc and lc.endswith((".jpg", ".jpeg", ".png", ".webp"))):
            candidatos.add(urllib.parse.urljoin(final, c))
    for m in re.finditer(r"https?://[^\s\"'<>]+?\.pdf", texto):
        candidatos.add(m.group(0))
    mejores = sorted(candidatos, key=puntaje, reverse=True)
    pdfs = [c for c in mejores if puntaje(c) > 0 and not c.lower().split("?")[0].endswith((".jpg", ".jpeg", ".png", ".webp"))]
    imgs = [c for c in mejores if puntaje(c) > 0 and c.lower().split("?")[0].endswith((".jpg", ".jpeg", ".png", ".webp"))]
    return (pdfs[0] if pdfs else None), (imgs[0] if imgs else None), mejores[:6]


def desde_skimap(area_id):
    # El archivo de skimap.org expone XML con los mapas del área y sus archivos.
    texto, _ = get(f"https://skimap.org/SkiAreas/view/{area_id}.xml")
    mapas = re.findall(r'<skiMap id="(\d+)"', texto)
    mejor = None
    for mid in mapas[:6]:
        try:
            t, _ = get(f"https://skimap.org/SkiMaps/view/{mid}.xml")
        except Exception:
            continue
        anio = re.search(r"<yearPublished>(\d{4})</yearPublished>", t)
        url = re.search(r'<render url="([^"]+)"', t) or re.search(r'<unprocessed url="([^"]+)"', t)
        if url:
            cand = (int(anio.group(1)) if anio else 0, url.group(1))
            if not mejor or cand > mejor:
                mejor = cand
    return mejor


def main():
    auto = {}
    for f in sorted(PISTAS.glob("*.json")):
        if f.name.startswith("_"):
            continue
        for p in json.loads(f.read_text(encoding="utf-8")):
            slug = p.get("slug")
            if p.get("mapa_pdf") or p.get("mapa_img"):
                continue
            res = {}
            if p.get("mapa_pagina"):
                try:
                    pdf, img, top = desde_pagina(p["mapa_pagina"])
                    print(f"{slug}: página -> pdf={pdf} img={img} | candidatos={top}")
                    if pdf:
                        res.update(mapa_pdf=pdf, origen="página oficial")
                    elif img:
                        res.update(mapa_img=img, origen="página oficial")
                except Exception as e:
                    print(f"{slug}: página falló: {e}")
            if not res:
                ids = [m.group(1) for u in p.get("fuentes", []) for m in [re.search(r"skimap\.org/skiareas/view/(\d+)", u, re.I)] if m]
                for aid in ids[:1]:
                    try:
                        mejor = desde_skimap(aid)
                        print(f"{slug}: skimap {aid} -> {mejor}")
                        if mejor:
                            res.update(mapa_img=mejor[1], origen=f"skimap.org ({mejor[0] or 'año ?'})", anio=mejor[0] or None)
                    except Exception as e:
                        print(f"{slug}: skimap falló: {e}")
            if res:
                auto[slug] = res
    (PISTAS / "_auto.json").write_text(json.dumps(auto, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"mapas encontrados: {len(auto)}")


if __name__ == "__main__":
    main()
