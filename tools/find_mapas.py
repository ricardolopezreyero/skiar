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
    for k in ("summer", "bike", "hike", "village", "dining", "parking", "lift-ticket", "brochure", "2019", "2020", "2021", "2022",
              "polic", "statement", "discrimination", "waiver", "development", "uphill", "snowshoe", "nordic", "status",
              "hero", "-cta", "cta-", "thumbnail", "w=480", "w=475", "w=553", "mh=488", "mh=538", "375"):
        if k in u:
            s -= 8
    return s


def desde_pagina(url):
    texto, final = get(url)
    texto = html.unescape(texto).replace("\\u002F", "/").replace("\\/", "/")
    print(f"  {url} -> {len(texto)} bytes, título: {(re.search(r'<title>(.*?)</title>', texto, re.S) or [None, '?'])[1].strip()[:60]}")
    candidatos = set()
    for m in re.finditer(r"""(?:https?://[^\s"'<>()]+)?/-/(?:aemasset|media)/[^\s"'<>()]+?\.(?:pdf|jpg|jpeg|png)(?:\?[^\s"'<>()]*)?""", texto, re.I):
        candidatos.add(urllib.parse.urljoin(final, m.group(0)))
    for m in re.finditer(r"""(?:href|src|data-src|content)=["']([^"']+)["']""", texto):
        c = m.group(1)
        lc = c.lower().split("?")[0]
        if lc.endswith((".pdf", ".ashx")) or "aemasset" in lc or ("trail" in lc and lc.endswith((".jpg", ".jpeg", ".png", ".webp"))):
            candidatos.add(urllib.parse.urljoin(final, c))
    for m in re.finditer(r"https?://[^\s\"'<>]+?\.pdf", texto):
        candidatos.add(m.group(0))
    mejores = sorted(candidatos, key=puntaje, reverse=True)
    es_img = lambda c: c.lower().split("?")[0].endswith((".jpg", ".jpeg", ".png", ".webp"))
    pdfs = [c for c in mejores if puntaje(c) >= 4 and not es_img(c)]
    imgs = [c for c in mejores if puntaje(c) >= 4 and es_img(c)]
    return (pdfs[0] if pdfs else None), (imgs[0] if imgs else None), mejores[:6]


def existe_pdf(url):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Range": "bytes=0-7"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read(8).startswith(b"%PDF")
    except Exception:
        return False


# Aspen Snowmass publica sus mapas con un patrón fijo; se prueban las temporadas más recientes.
ASPEN = {"snowmass": "snowmass", "buttermilk": "buttermilk", "aspen-mountain": "aspenmountain", "aspen-highlands": "highlands"}


def desde_patron(slug):
    if slug not in ASPEN:
        return None
    for corto, largo in (("2627", "26-27"), ("2526", "25-26")):
        for nombre in (ASPEN[slug], ASPEN[slug].replace("aspenmountain", "aspen-mountain"), ASPEN[slug].replace("aspenmountain", "ajax")):
            url = f"https://www.aspensnowmass.com/-/media/aspen-snowmass/documents/pdfs/{largo}/{corto}-mountain-maps/{corto}{nombre}-map-layeredwebsite.pdf"
            if existe_pdf(url):
                return url, f"20{corto[:2]}-{corto[2:]}"
    return None


def get_tipo(url, accept):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read(2_000_000).decode("utf-8", "replace")


def desde_skimap(area_id):
    # El archivo de skimap.org expone los mapas del área (JSON o XML) con su año y archivo.
    try:
        texto = get_tipo(f"https://skimap.org/SkiAreas/view/{area_id}.json", "application/json")
        datos = json.loads(texto)
        mapas = []
        def recorrer(x):
            if isinstance(x, dict):
                if "id" in x and any(k in x for k in ("year", "yearPublished", "year_published")):
                    mapas.append(x)
                for v in x.values():
                    recorrer(v)
            elif isinstance(x, list):
                for v in x:
                    recorrer(v)
        recorrer(datos)
        mapas.sort(key=lambda m: int(str(m.get("year") or m.get("yearPublished") or m.get("year_published") or 0)[:4] or 0), reverse=True)
        for m in mapas[:4]:
            anio = int(str(m.get("year") or m.get("yearPublished") or m.get("year_published") or 0)[:4] or 0)
            urls = re.findall(r"https://files\.skimap\.org/[^\"'\s]+?\.(?:jpg|jpeg|png|pdf)", json.dumps(m).replace("\\/", "/"))
            if not urls:
                t2 = get_tipo(f"https://skimap.org/SkiMaps/view/{m['id']}.json", "application/json")
                urls = re.findall(r"https://files\.skimap\.org/[^\"'\s]+?\.(?:jpg|jpeg|png|pdf)", t2.replace("\\/", "/"))
            if urls:
                return anio, urls[0]
        print("  skimap json sin mapas:", texto[:300].replace("\n", " "))
    except Exception as e:
        print("  skimap json falló:", e)
    texto = get_tipo(f"https://skimap.org/SkiAreas/view/{area_id}.xml", "application/xml,text/xml;q=0.9,*/*;q=0.8")
    mapas = re.findall(r'<skiMap id="(\d+)"', texto)
    mejor = None
    for mid in mapas[:6]:
        try:
            t = get_tipo(f"https://skimap.org/SkiMaps/view/{mid}.xml", "application/xml,text/xml;q=0.9,*/*;q=0.8")
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
            if (p.get("mapa_pdf") or p.get("mapa_img")) and slug not in ASPEN:
                continue
            res = {}
            pat = desde_patron(slug)
            if pat:
                res.update(mapa_pdf=pat[0], origen="patrón oficial Aspen Snowmass", anio=pat[1], preferir=True)
                print(f"{slug}: patrón -> {pat}")
            if not res and p.get("mapa_pagina"):
                try:
                    pdf, img, top = desde_pagina(p["mapa_pagina"])
                    print(f"{slug}: página -> pdf={pdf} img={img} | candidatos={top}")
                    if pdf or img:
                        res.update(mapa_pdf=pdf, mapa_img=img, origen="página oficial")
                except Exception as e:
                    print(f"{slug}: página falló: {e}")
            if not res:
                urls = list(p.get("fuentes", [])) + [p.get("skimap") or "", p.get("mapa_pagina") or ""]
                ids = [m.group(1) for u in urls for m in [re.search(r"skimap\.org/skiareas/view/(\d+)", u or "", re.I)] if m]
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
