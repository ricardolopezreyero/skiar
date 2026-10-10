#!/usr/bin/env python3
"""Arma site/data.js a partir de book/*/opciones.json, book/vuelos.json y book/pendientes.json.

Uso: python3 tools/build_site.py
"""
import datetime
import hashlib
import re
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
BOOK = ROOT / "book"
SITE = ROOT / "site"
ORDEN = ["keystone", "breckenridge", "steamboat", "snowmass"]


def load(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except json.JSONDecodeError as e:
        sys.exit(f"JSON inválido en {path}: {e}")


def main():
    resorts = []
    for slug in ORDEN:
        data = load(BOOK / slug / "opciones.json")
        if data is None:
            print(f"aviso: falta book/{slug}/opciones.json")
            continue
        data["slug"] = slug
        resorts.append(data)

    payload = {
        "generado": datetime.date.today().isoformat(),
        "rama": "claude/dreamy-cori-anrnp2",
        "resorts": resorts,
        "vuelos": load(BOOK / "vuelos.json") or {},
        "pendientes": load(BOOK / "pendientes.json") or [],
        "mapa": load(BOOK / "mapa.json") or {},
    }
    out = SITE / "data.js"
    out.write_text("window.SKIAR = " + json.dumps(payload, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
    print(f"ok: {out.relative_to(ROOT)} · {len(resorts)} destinos")

    # Cache-busting: cada archivo se pide con ?v=<huella de su contenido>,
    # así el navegador nunca se queda con una versión vieja.
    index = SITE / "index.html"
    html = index.read_text(encoding="utf-8")
    for name in ("data.js", "app.js", "styles.css"):
        huella = hashlib.sha1((SITE / name).read_bytes()).hexdigest()[:10]
        html = re.sub(rf'(["\']){re.escape(name)}(\?v=[0-9a-f]+)?(["\'])', rf"\g<1>{name}?v={huella}\g<3>", html)
    index.write_text(html, encoding="utf-8")
    print("ok: index.html con versiones")


if __name__ == "__main__":
    main()
