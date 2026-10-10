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


def temporada_de(url):
    """Deduce la temporada del mapa por el nombre del archivo (p. ej. winter-2025-2026, 25-26, 2526)."""
    import re as _re
    u = url.lower()
    for a in range(2030, 2018, -1):
        b = a + 1
        pares = (f"{a}-{b}", f"{a}-{str(b)[2:]}", f"{str(a)[2:]}-{str(b)[2:]}", f"{str(a)[2:]}{str(b)[2:]}", f"winter{str(a)[2:]}-{str(b)[2:]}")
        if any(x in u for x in pares):
            return f"{a}-{str(b)[2:]}"
    m = _re.search(r"(20[2-3]\d)", u)
    return m.group(1) if m else "?"


def main():
    resorts = []
    for slug in ORDEN:
        data = load(BOOK / slug / "opciones.json")
        if data is None:
            print(f"aviso: falta book/{slug}/opciones.json")
            continue
        data["slug"] = slug
        peticiones = load(BOOK / slug / "peticiones.json") or {}
        for l in data.get("alojamientos", []):
            if l.get("nombre") in peticiones:
                l["peticion"] = peticiones[l["nombre"]]
        resorts.append(data)

    pistas = []
    auto = load(BOOK / "pistas" / "_auto.json") or {}  # ligas encontradas por tools/find_mapas.py (GitHub Actions)
    for f in ("finalistas.json", "colorado.json", "otros_estados.json"):
        for p in load(BOOK / "pistas" / f) or []:
            if any(x.get("slug") == p.get("slug") for x in pistas):
                continue
            a = auto.get(p.get("slug")) or {}
            if a and (a.get("preferir") or (not p.get("mapa_pdf") and not p.get("mapa_img"))):
                p["mapa_pdf"] = a.get("mapa_pdf")
                p["mapa_img"] = a.get("mapa_img")
                p["mapa_origen"] = a.get("origen")
                if a.get("anio") and (a.get("preferir") or p.get("temporada_mapa") in (None, "?")):
                    p["temporada_mapa"] = str(a["anio"])
            if p.get("temporada_mapa") in (None, "?"):
                p["temporada_mapa"] = temporada_de(p.get("mapa_pdf") or p.get("mapa_img") or "")
            pistas.append(p)

    payload = {
        "generado": datetime.date.today().isoformat(),
        "rama": "claude/dreamy-cori-anrnp2",
        "resorts": resorts,
        "vuelos": load(BOOK / "vuelos.json") or {},
        "pendientes": load(BOOK / "pendientes.json") or [],
        "mapa": load(BOOK / "mapa.json") or {},
        "nieve": load(BOOK / "nieve.json") or {},
        "espacio": load(BOOK / "espacio.json") or {},
        "pistas": pistas,
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
