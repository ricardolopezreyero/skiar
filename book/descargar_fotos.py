#!/usr/bin/env python3
"""Descarga las fotos listadas en book/<resort>/fotos_manifest.csv.

Uso:  python3 book/descargar_fotos.py            (todos los resorts)
      python3 book/descargar_fotos.py keystone   (solo uno)

- Fotos con licencia libre (CC, dominio público) -> book/<resort>/fotos/
  Esas se pueden subir al repo (dar crédito según la columna "credito").
- Fotos sin licencia libre (hoteles, resorts, prensa) -> book/<resort>/fotos_privadas/
  Esa carpeta está en .gitignore: son para uso personal y no deben publicarse
  en un repo público.
- Las filas sin url_imagen (solo página de galería) se saltan y se reportan.
"""
import csv
import pathlib
import re
import sys
import urllib.request

BOOK = pathlib.Path(__file__).resolve().parent
LIBRE = re.compile(r"\b(cc[- ]?by|cc[- ]?0|creative commons|public domain|dominio p[uú]blico|pd)\b", re.I)


def destino(resort_dir, fila):
    carpeta = "fotos" if LIBRE.search(fila.get("licencia", "")) else "fotos_privadas"
    nombre = fila.get("archivo_sugerido") or pathlib.Path(fila["url_imagen"].split("?")[0]).name
    return resort_dir / carpeta / nombre


def descargar(url, ruta):
    ruta.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "skiar-book/1.0 (viaje familiar)"})
    with urllib.request.urlopen(req, timeout=60) as r, open(ruta, "wb") as f:
        f.write(r.read())


def main():
    filtro = set(sys.argv[1:])
    ok = saltadas = errores = 0
    for manifest in sorted(BOOK.glob("*/fotos_manifest.csv")):
        resort_dir = manifest.parent
        if filtro and resort_dir.name not in filtro:
            continue
        with open(manifest, newline="", encoding="utf-8") as f:
            for fila in csv.DictReader(f):
                url = (fila.get("url_imagen") or "").strip()
                if not url:
                    saltadas += 1
                    continue
                ruta = destino(resort_dir, fila)
                if ruta.exists():
                    ok += 1
                    continue
                try:
                    descargar(url, ruta)
                    ok += 1
                    print(f"ok     {ruta.relative_to(BOOK)}")
                except Exception as e:  # red bloqueada, 404, etc.
                    errores += 1
                    print(f"error  {url} -> {e}")
    print(f"\nDescargadas/existentes: {ok} · Sin url directa (solo galería): {saltadas} · Errores: {errores}")


if __name__ == "__main__":
    main()
