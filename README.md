# Viaje familiar a esquiar 2027 ⛷️

**Ver en vivo: [ricardolopezreyero.github.io/skiar](https://ricardolopezreyero.github.io/skiar/)**

Una página para decidir juntos a dónde ir a esquiar, cuándo y dónde dormir. Compara **Keystone, Breckenridge, Steamboat y Snowmass** para dos adultos y una niña que va a aprender a esquiar. Se abre desde el celular o la computadora, sin usuario ni contraseña.

**La recomendación de la investigación es Keystone**, porque el boleto de la niña sale gratis al reservar el hospedaje con el resort y tiene actividades infantiles todos los días. **Steamboat es el plan B** si el pediatra prefiere que duerma a menor altitud.

## Cómo usar la página

| Pestaña | Para qué sirve |
|---|---|
| 🧭 **Decidir** | Elegir la semana, el destino y uno de los 16 hospedajes. El total del viaje se recalcula con cada elección. |
| ⛷️ **Pistas** | Ver mapas y datos de 40 opciones en Colorado y otros estados. |
| ✅ **Checklist** | Marcar lo que falta antes de reservar, con su fecha límite. |

**Para compartir la misma checklist:** una persona marca la primera tarea, toca el botón de copiar la liga y se la manda a la otra. Desde esa liga, lo que marque una lo ve la otra. La liga general abre una lista nueva en cada dispositivo.

> **Antes de pagar:** los precios, promociones y fechas límite se investigaron el **10 de octubre de 2026**. Confirma cada dato directo con el resort, el hotel o la aerolínea.

## Dónde está cada cosa

| Carpeta | Contenido |
|---|---|
| [`reports/`](reports/Esqu%C3%AD%20familiar%20Colorado%20y%20alternativas.md) | El informe completo con la recomendación |
| [`book/`](book/) | Fichas por destino, hospedajes, vuelos, nieve, pistas y pendientes |
| [`research_notes/`](research_notes/) | Notas y fuentes de la investigación |
| [`site/`](site/) | La página publicada |
| [`tools/`](tools/) | Scripts que arman la página y revisan los mapas |

## Para actualizarla

Los datos se editan en `book/`. Para ver la página en tu computadora:

```bash
python3 tools/build_site.py && python3 -m http.server 8000 --directory site
```

Después abre `http://localhost:8000`.

Cada push a la rama `claude/dreamy-cori-anrnp2` activa [GitHub Actions](.github/workflows/publicar.yml), que busca y revisa los mapas de pistas, arma los datos y la imagen para compartir, y publica `site/` en GitHub Pages.

<!-- RLR · Ricardo López Reyero · rev 181218 -->
