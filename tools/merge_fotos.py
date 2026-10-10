#!/usr/bin/env python3
"""Agrega a book/<resort>/opciones.json las fotos verificadas de book/<resort>/fotos_commons.json.

Las fotos de Commons van primero (las de invierno antes), sin duplicar archivos.
La página muestra solo las que sí cargan, máximo 10 por categoría.

Uso: python3 tools/merge_fotos.py
"""
import json
import pathlib
import urllib.parse

BOOK = pathlib.Path(__file__).resolve().parent.parent / "book"


def filepath_url(archivo):
    return "https://commons.wikimedia.org/wiki/Special:FilePath/" + urllib.parse.quote(archivo) + "?width=1600"


def main():
    for extra in sorted(BOOK.glob("*/fotos_commons.json")):
        opciones = extra.parent / "opciones.json"
        data = json.loads(opciones.read_text(encoding="utf-8"))
        nuevas = json.loads(extra.read_text(encoding="utf-8"))
        nuevas.sort(key=lambda f: (bool(f.get("por_verificar")), not f.get("invierno")))
        vistos = set()
        fotos = []
        for f in nuevas:
            archivo = f["archivo"].replace(" ", "_")
            if archivo.lower() in vistos:
                continue
            vistos.add(archivo.lower())
            fotos.append({
                "categoria": f["categoria"],
                "opcion": "",
                "descripcion": f.get("descripcion", ""),
                "url_imagen": filepath_url(archivo),
                "url_pagina": f.get("url_pagina") or "https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(archivo),
                "credito": f.get("credito", "Wikimedia Commons"),
                "licencia": f.get("licencia", ""),
            })
        for f in data.get("fotos", []):
            url = f.get("url_imagen") or ""
            nombre = urllib.parse.unquote(url.split("Special:FilePath/")[-1].split("?")[0]).lower() if "Special:FilePath/" in url else None
            if nombre and nombre in vistos:
                continue
            fotos.append(f)
        data["fotos"] = fotos
        opciones.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{extra.parent.name}: +{len(vistos)} fotos de Commons")


if __name__ == "__main__":
    main()
