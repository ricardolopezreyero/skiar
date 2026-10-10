#!/usr/bin/env python3
"""Revisa que las ligas de mapas de pistas (PDF, imagen, página) respondan.

Escribe site/mapas_estado.js con {url: {ok, tipo, status}} para que la página
oculte los botones de mapas rotos. Corre en GitHub Actions (allá sí hay internet).

Uso: python3 tools/check_mapas.py
"""
import hashlib
import json
import re
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
UAS = ["Mozilla/5.0 (skiar; revisión de mapas de pistas; https://github.com/ricardolopezreyero/skiar)",
       "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"]


def revisar_con(url, ua):
    req = urllib.request.Request(url, headers={"User-Agent": ua, "Range": "bytes=0-2047"})
    with urllib.request.urlopen(req, timeout=40) as r:
        tipo = r.headers.get("Content-Type", "")
        cabeza = r.read(2048)
        if url.lower().split("?")[0].endswith(".pdf") or "pdf" in tipo:
            ok = cabeza.startswith(b"%PDF") or "pdf" in tipo
        elif "image" in tipo:
            ok = True
        else:
            ok = r.status < 400
        return {"ok": bool(ok), "tipo": tipo, "status": r.status}


def revisar(url):
    # Algunos sitios bloquean navegadores "falsos" y otros a herramientas simples: se prueban ambas.
    error = None
    for ua in UAS:
        try:
            res = revisar_con(url, ua)
            if res["ok"]:
                return res
            error = error or res
        except Exception as e:  # 404, 403, DNS, timeout
            error = e
    if isinstance(error, dict):
        return error
    code = getattr(error, "code", None)
    # 403/429/5xx suelen ser bloqueo a robots: en el navegador de la familia sí abre
    roto = code in (404, 410) or "Name or service" in str(error) or "No address" in str(error)
    return {"ok": not roto, "dudoso": not roto, "tipo": "", "status": code, "error": str(error)[:120]}


def main():
    estado = {}
    entradas = []
    for f in sorted((ROOT / "book" / "pistas").glob("*.json")):
        datos = json.loads(f.read_text(encoding="utf-8"))
        if isinstance(datos, dict):  # _auto.json: {slug: {...}}
            entradas += [dict(v, slug=k) for k, v in datos.items()]
        else:
            entradas += datos
    if True:
        for p in entradas:
            for campo in ("mapa_pdf", "mapa_img", "mapa_pagina"):
                url = p.get(campo)
                if url and url not in estado:
                    estado[url] = revisar(url)
                    print(("ok   " if estado[url]["ok"] else "FALLA"), campo, p.get("slug"), url[:90])
    out = ROOT / "site" / "mapas_estado.js"
    out.write_text("window.SKIAR_MAPAS = " + json.dumps(estado, ensure_ascii=False) + ";\n", encoding="utf-8")
    print(f"{sum(v['ok'] for v in estado.values())}/{len(estado)} ligas funcionan")
    index = ROOT / "site" / "index.html"
    huella = hashlib.sha1(out.read_bytes()).hexdigest()[:10]
    html = re.sub(r'mapas_estado\.js(\?v=[0-9a-f]+)?', f"mapas_estado.js?v={huella}", index.read_text(encoding="utf-8"))
    index.write_text(html, encoding="utf-8")


if __name__ == "__main__":
    main()
