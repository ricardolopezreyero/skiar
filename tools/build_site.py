#!/usr/bin/env python3
"""Arma site/data.js a partir de book/*/opciones.json, book/vuelos.json y book/pendientes.json.

Uso: python3 tools/build_site.py
"""
import datetime
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
    }
    out = SITE / "data.js"
    out.write_text("window.SKIAR = " + json.dumps(payload, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
    print(f"ok: {out.relative_to(ROOT)} · {len(resorts)} destinos")


if __name__ == "__main__":
    main()
