(function () {
  "use strict";

  const D = window.SKIAR || { resorts: [], vuelos: {} };
  const V = D.vuelos || {};
  const REPO = "https://github.com/ricardolopezreyero/skiar/blob/" + (D.rama || "main");
  const PRESUPUESTO = 6000;
  const TOPE = 8000;

  const VENTANAS = [
    { id: "D", corto: "⭐ 21–28 mar", titulo: "⭐ Dom 21 – Dom 28 marzo", nota: "Favorita · Semana Santa · buena nieve, más gente", dias: 7 },
    { id: "A", corto: "10–16 ene", titulo: "Dom 10 – Sáb 16 enero", nota: "Lo más barato y con menos gente · el más frío" },
    { id: "B", corto: "24–30 ene", titulo: "Dom 24 – Sáb 30 enero", nota: "Mejor equilibrio entre precio, nieve y poca gente" },
    { id: "C", corto: "28 feb–6 mar", titulo: "Dom 28 feb – Sáb 6 marzo", nota: "La mejor nieve y días menos fríos · precio medio" },
  ];

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "href") n.setAttribute("href", Array.isArray(v) ? v[0] : String(v).split(/[ ,;]+(?=https?:)/)[0]);
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : String(kid));
    return n;
  };
  const ext = (href, attrs, ...kids) => el("a", { href, target: "_blank", rel: "noopener", ...attrs }, ...kids);
  const boton = (attrs, ...kids) => el("button", { type: "button", ...attrs }, ...kids);
  const MEDALLAS = ["🥇", "🥈", "🥉"];
  const money = (n) => (n == null || isNaN(n) ? "—" : "$" + Math.round(n).toLocaleString("en-US"));
  const conf = (c) => el("span", { class: "dot " + (c || "baja"), title: "Confianza: " + (c || "baja / estimado") });
  const num = (x) => (typeof x === "number" && isFinite(x) ? x : null);

  // ---------- estado (se guarda en la URL para compartir) ----------
  const state = { v: "D", r: null, l: null, f: "cocinando", tab: "decidir" };
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    if (p.get("v")) state.v = p.get("v");
    if (p.get("r")) state.r = p.get("r");
    if (p.get("l") != null) state.l = Number(p.get("l"));
    if (p.get("f")) state.f = p.get("f");
    if (p.get("tab")) state.tab = p.get("tab");
    if (p.get("lista")) Nube.setId(p.get("lista"));
  }
  function writeHash() {
    const p = new URLSearchParams({ v: state.v, r: state.r || "", l: state.l ?? "", f: state.f });
    if (Nube.id()) p.set("lista", Nube.id());
    if (state.tab !== "decidir") p.set("tab", state.tab);
    history.replaceState(null, "", "#" + p.toString());
  }

  // ---------- cálculo ----------
  const deVentana = (r, v, k) => {
    const o = ((r.por_ventana || {})[v] || {})[k];
    return o && typeof o === "object" ? { ...r[k], ...o } : o ?? r[k];
  };
  const vueloDe = (k, v) => ((V.por_ventana || {})[v] || {})[k] ?? V[k];
  function lodgingPrice(l, v) {
    const p = (l.precios || {})[v] || {};
    const total = num(p.total_6_noches_con_impuestos_usd);
    const noche = num(p.noche_usd);
    const noches = num(p.noches) ?? 6;
    if (total != null) return { total, noche, noches, conf: p.confianza, src: p.fuente, nota: p.nota };
    if (noche != null) return { total: noche * noches, noche, noches, conf: "baja", src: p.fuente, nota: `${noches} × tarifa por noche, sin impuestos` };
    return { total: null, noche: null, noches, conf: null, src: p.fuente, nota: p.nota, agotado: p.disponible === false };
  }

  function route(resort, v) {
    const rec = ((V.recomendado_por_ventana || {})[v] || {})[resort.slug] || (V.recomendado || {})[resort.slug] || {};
    const ruta = (V.rutas || []).find((r) => r.id === rec.ruta);
    const t0 = (V.traslados || []).find((t) => t.id === rec.traslado);
    const tras = t0 && { ...t0, ...((t0.precios || {})[v] || {}) };
    let vuelo = null;
    if (ruta) {
      const p = (ruta.precios || {})[v] || {};
      const total = num(p.total_3_usd) ?? (num(p.por_persona_usd) != null ? p.por_persona_usd * 3 : null);
      vuelo = { total, conf: p.confianza, src: p.fuente, ruta, fechas: p.fechas_reales, equipaje: num(p.equipaje_total_usd) ?? num(ruta.equipaje_total_usd), equipajeConf: p.equipaje_confianza || ruta.equipaje_confianza || "baja", equipajeNota: p.equipaje_nota || ruta.equipaje_total_nota };
    }
    return { vuelo, tras, desdeMty: ruta ? /^mty/i.test(ruta.id) : false };
  }

  // ---------- espacio y puntaje familiar ----------
  const E = (D.espacio || {}).resorts || {};
  const espacio = (slug, l) => ((E[slug] || {})[l && l.nombre]) || null;
  const M2_TOPE = 120; // arriba de ~120 m² ya no suma más espacio al puntaje
  const PESOS = { precio: 35, espacio: 30, acceso: 15, nina: 10, viaje: 10 };
  const ETQ = { precio: "💰 precio", espacio: "📐 espacio", acceso: "⛷️ acceso a pista", nina: "👧 niña gratis", viaje: "🕒 horas de viaje" };
  const nivelSki = (l) => ({ verdadero: 2, caminando: 1 })[l.ski_in_out] || 0;
  const esGratis = (r, l) => l.nina_gratis !== false && (deVentana(r, state.v, "forfaits") || {}).nina_total_usd === 0;
  let _pcache = null;
  function puntajes() {
    const key = state.v + "|" + state.f;
    if (_pcache && _pcache.key === key) return _pcache.map;
    const rows = [];
    D.resorts.forEach((r) => (r.alojamientos || []).forEach((l, i) => {
      const t = tripTotal(r, i, state.v, state.f);
      const e = espacio(r.slug, l);
      rows.push({
        k: r.slug + "|" + i, total: t.sinHospedaje ? null : t.total, m2: e && num(e.m2) != null ? Math.min(e.m2, M2_TOPE) : null,
        ski: nivelSki(l),
        gratis: esGratis(r, l),
        viaje: balance(r, i).viajando,
      });
    }));
    const rng = (vals) => { const v = vals.filter((x) => x != null); return v.length ? [Math.min(...v), Math.max(...v)] : [0, 0]; };
    const [tA, tB] = rng(rows.map((x) => x.total)), [mA, mB] = rng(rows.map((x) => x.m2)), [vA, vB] = rng(rows.map((x) => x.viaje));
    const norm = (x, a, b, inv) => (x == null || b === a ? 0.5 : inv ? (b - x) / (b - a) : (x - a) / (b - a));
    const map = new Map();
    rows.forEach((x) => {
      const parts = { precio: x.total == null ? 0 : norm(x.total, tA, tB, true), espacio: norm(x.m2, mA, mB, false), acceso: x.ski / 2, nina: x.gratis ? 1 : 0, viaje: norm(x.viaje, vA, vB, true) };
      const score = x.total == null ? 0 : Math.round(Object.entries(PESOS).reduce((s, [k, w]) => s + w * parts[k], 0));
      map.set(x.k, { score, parts, sinM2: x.m2 == null });
    });
    _pcache = { key, map };
    return map;
  }
  const puntaje = (r, i) => puntajes().get(r.slug + "|" + i) || { score: 0, parts: {} };
  const detallePuntaje = (p) => Object.keys(PESOS).map((k) => `${ETQ[k]} ${Math.round((p.parts[k] || 0) * PESOS[k])}/${PESOS[k]}`).join(" · ");
  const m2txt = (e) => (e && e.m2 ? `${e.estimado ? "~" : ""}${e.m2} m²` : null);

  function defaultLodging(resort) {
    const ls = resort.alojamientos || [];
    let best = 0, bestScore = -1;
    ls.forEach((l, i) => { if (lodgingPrice(l, state.v).total == null) return; const s = puntaje(resort, i).score; if (s > bestScore) { bestScore = s; best = i; } });
    return best;
  }

  function items(resort, li, v, food) {
    const l = (resort.alojamientos || [])[li] || {};
    const out = [];
    const r = route(resort, v);
    if (r.vuelo) out.push({ label: "✈️ Vuelos redondos (3 personas)", amount: r.vuelo.total, conf: r.vuelo.conf, src: r.vuelo.src, note: [r.vuelo.ruta.descripcion, r.vuelo.fechas].filter(Boolean).join(" · ") });
    else out.push({ label: "✈️ Vuelos redondos (3 personas)", amount: null, note: "Falta dato" });
    if (r.vuelo && r.vuelo.equipaje != null) out.push({ label: "🧳 Equipaje documentado", amount: r.vuelo.equipaje, conf: r.vuelo.equipajeConf, note: r.vuelo.equipajeNota });
    if (r.vuelo && /den/i.test(r.vuelo.ruta.id) && num(vueloDe("hotel_denver_usd", v)) != null) out.push({ label: "🏨 Primera noche en Denver (aclimatación)", amount: vueloDe("hotel_denver_usd", v), conf: vueloDe("hotel_denver_confianza", v) || "baja", src: vueloDe("hotel_denver_fuente", v), note: vueloDe("hotel_denver_nota", v) });
    if (r.desdeMty) {
      const hm = vueloDe("hotel_monterrey", v);
      if (hm && num(hm.total_usd) != null) out.push({ label: "🏨 Noches en Monterrey (sáb 20 y dom 28)", amount: hm.total_usd, conf: hm.confianza, src: hm.fuente, note: hm.nota });
      const g = num(V.gasolina_casetas_trc_mty_redondo_usd), e = num(vueloDe("estacionamiento_mty_usd", v));
      out.push({ label: "🚗 Torreón ↔ Monterrey en carro + estacionamiento", amount: g == null && e == null ? null : (g || 0) + (e || 0), conf: "media", note: "Gasolina, casetas y estacionamiento en el aeropuerto" });
    }
    if (r.tras) out.push({ label: "🚙 Traslado aeropuerto ↔ montaña", amount: num(r.tras.total_usd), conf: r.tras.confianza, src: r.tras.fuente, note: r.tras.descripcion });
    const lp = lodgingPrice(l, v);
    out.push({ label: `🏔️ Hospedaje ${lp.noches} noches · ` + corto(l.nombre), amount: lp.total, conf: lp.conf, src: lp.src, note: lp.nota });
    const f = deVentana(resort, v, "forfaits") || {};
    out.push({ label: "🎟️ Forfaits adultos (5 días × 2)", amount: num(f.adultos_total_usd), conf: f.confianza, src: f.fuente, note: f.como_comprar });
    const ninaGratis = l.nina_gratis !== false;
    const nina = ninaGratis ? num(f.nina_total_usd) : num(f.nina_total_sin_programa_usd) ?? num(f.nina_total_usd);
    out.push({ label: "👧 Forfait de la niña", amount: nina, conf: f.confianza, note: nina === 0 ? "Gratis: " + (resort.ninos_gratis || "") : (ninaGratis ? "" : "Este hospedaje no califica para el programa de niños gratis") });
    const e = deVentana(resort, v, "escuela") || {};
    out.push({ label: "⛷️ Escuela de esquí de la niña", amount: num(e.total_5_dias_usd), conf: e.confianza, src: e.fuente, note: e.incluye });
    out.push({ label: "🎿 Renta de equipo (3 personas)", amount: num(deVentana(resort, v, "renta_equipo_total_usd")), conf: "media", note: ((resort.por_ventana || {})[v] || {}).renta_equipo_nota });
    const c = resort.comida_total_usd || {};
    const modo = food === "restaurantes" || l.cocina === false ? "restaurantes" : "cocinando";
    const dias = (VENTANAS.find((w) => w.id === v) || {}).dias || 6;
    out.push({ label: `🍽️ Comida ${dias} días (` + (modo === "cocinando" ? "cocinando + algunas salidas" : "restaurantes") + ")", amount: num(c[modo]) == null ? null : Math.round((c[modo] * dias) / (resort.comida_dias || 6)), conf: "baja", note: l.cocina === false && food === "cocinando" ? "Este hospedaje no tiene cocina" : "" });
    return out;
  }

  const sum = (its) => its.reduce((a, i) => a + (i.amount || 0), 0);
  const missing = (its) => its.filter((i) => i.amount == null).length;
  const tripTotal = (resort, li, v, food) => {
    const its = items(resort, li, v, food);
    const sinHospedaje = lodgingPrice((resort.alojamientos || [])[li] || {}, v).total == null;
    return { total: sum(its), faltan: missing(its), sinHospedaje };
  };
  const level = (t) => (t <= PRESUPUESTO ? "ok" : t <= TOPE ? "warn" : "bad");
  const COLOR_NIVEL = { ok: "var(--ok)", warn: "var(--warn)", bad: "var(--bad)" };

  // ---------- render ----------
  function firstPhoto(resort, cats) {
    const f = (resort.fotos || []).find((p) => p.url_imagen && (!cats || cats.includes(p.categoria)));
    return f && f.url_imagen;
  }

  function renderVentanas() {
    const box = $("#ventanas");
    box.replaceChildren(...VENTANAS.map((w) =>
      boton({ class: "chip" + (state.v === w.id ? " on" : ""), role: "radio", "aria-checked": String(state.v === w.id), onclick: () => { state.v = w.id; render(); } },
        el("strong", { class: "largo" }, w.titulo + " 2027"), el("strong", { class: "corto" }, w.corto), el("span", {}, w.nota))));
  }

  function renderResorts() {
    const list = [...D.resorts].sort((a, b) => puntaje(b, defaultLodging(b)).score - puntaje(a, defaultLodging(a)).score);
    $("#resorts").replaceChildren(...list.map((r) => {
      const li = defaultLodging(r);
      const t = tripTotal(r, li, state.v, state.f);
      const ph = firstPhoto(r, ["ubicacion", "pista"]);
      const badges = [];
      if ((deVentana(r, state.v, "forfaits") || {}).nina_total_usd === 0) badges.push(el("span", { class: "badge ok" }, "Niña esquía gratis"));
      if ((r.alojamientos || []).some((l) => l.ski_in_out === "verdadero")) badges.push(el("span", { class: "badge ok" }, "Ski-in/ski-out"));
      if (r.altitud_base_m) badges.push(el("span", { class: "badge" + (r.altitud_base_m > 2800 ? " warn" : "") }, "Base " + r.altitud_base_m.toLocaleString("es-MX") + " m"));
      if (r.aeropuerto) badges.push(el("span", { class: "badge" }, "✈ " + r.aeropuerto));
      const nv = nieve(r.slug, state.v);
      if (nv) badges.push(el("span", { class: "badge " + (nv.prob_buena === "alta" ? "ok" : nv.prob_buena === "baja" ? "warn" : ""), title: nv.nota || "" }, `❄️ ${nv.cm} cm de nieve`));
      return boton({ class: "resort" + (state.r === r.slug ? " on" : ""), onclick: () => { state.r = r.slug; state.l = null; render(); $("#hospedaje").scrollIntoView(); } },
        el("div", { class: "ph" }, ph ? el("div", { class: "ph-img photo-tone", style: `background-image:url("${ph}")` }) : null, el("span", { class: "score", title: detallePuntaje(puntaje(r, li)) }, "⭐ " + puntaje(r, li).score + "/100")),
        el("div", { class: "body" },
          el("h3", {}, r.nombre),
          el("p", { class: "lead-hosp" }, "🏔️ " + corto((r.alojamientos[li] || {}).nombre) + (m2txt(espacio(r.slug, r.alojamientos[li])) ? " · 📐 " + m2txt(espacio(r.slug, r.alojamientos[li])) : "")),
          el("p", { class: "lead" }, r.resumen || ""),
          el("div", { class: "badges" }, badges),
          el("div", { class: "total" }, el("small", {}, "Total del viaje estimado"), t.sinHospedaje ? "Sin disponibilidad" : money(t.total), t.faltan ? el("small", { class: "missing" }, t.faltan + " concepto(s) sin dato") : null),
          t.sinHospedaje ? el("span", { class: "badge warn" }, "Falta precio de hospedaje en estas fechas") :
          el("span", { class: "badge " + level(t.total) }, t.total <= PRESUPUESTO ? "Cabe en $6,000" : t.total <= TOPE ? "Cabe en $8,000" : "Arriba de $8,000")));
    }));
  }

  function currentResort() { return D.resorts.find((r) => r.slug === state.r) || D.resorts[0]; }

  function renderLodgings() {
    const r = currentResort();
    if (!r) return;
    if (state.r == null) state.r = r.slug;
    if (state.l == null) state.l = defaultLodging(r);
    $("#hospedaje-hint").textContent = `Opciones en ${r.nombre}.`;
    $("#lodgings").replaceChildren(...(r.alojamientos || []).map((l, i) => {
      const p = lodgingPrice(l, state.v);
      const acceso = { verdadero: ["ok", "Ski-in/ski-out real"], caminando: ["warn", "Caminando a la pista"], shuttle: ["warn", "Necesita shuttle"] }[l.ski_in_out] || ["", l.ski_in_out || "Acceso por confirmar"];
      const foto = l.foto ? { url: l.foto, real: true } : l.foto_zona ? { url: l.foto_zona.url, real: false } : null;
      const cab = el("div", { class: "lodging-ph" },
        foto ? el("div", { class: "lodging-img photo-tone", style: `background-image:url("${foto.url}")` }) : null,
        el("span", { class: "lodging-ph-ico" }, "🏔️"),
        foto ? el("span", { class: "lodging-ph-tag" }, foto.real ? "📷 Foto del hospedaje" : "📍 Foto de la zona") : null);
      if (foto) { const pre = new Image(); pre.onload = () => cab.classList.add("ok"); pre.onerror = () => cab.classList.add("sin-foto"); pre.referrerPolicy = "no-referrer"; pre.src = foto.url; }
      return el("article", { class: "lodging" + (state.l === i ? " on" : "") },
        cab,
        el("h4", {}, l.nombre),
        el("div", { class: "badges" },
          el("span", { class: "badge " + acceso[0] }, acceso[1]),
          (() => { const e = espacio(r.slug, l); return e && e.m2 ? el("span", { class: "badge m2", title: [e.unidad, e.ft2 ? e.ft2 + " ft²" : null, e.rango_m2 ? "rango " + e.rango_m2 + " m²" : null, e.nota].filter(Boolean).join(" · ") }, `📐 ${m2txt(e)}`) : null; })(),
          el("span", { class: "badge star", title: detallePuntaje(puntaje(r, i)) }, `⭐ ${puntaje(r, i).score}/100`),
          p.agotado ? el("span", { class: "badge warn" }, "Sin disponibilidad") : null,
          l.nina_gratis ? el("span", { class: "badge ok" }, "Niña gratis") : null,
          l.cocina ? el("span", { class: "badge" }, "Cocina") : null,
          l.tipo ? el("span", { class: "badge" }, l.tipo) : null),
        el("p", { class: "meta" }, [l.recamaras, l.distancia_escuela ? "Escuela infantil: " + l.distancia_escuela : null].filter(Boolean).join(" · ")),
        el("div", { class: "price" }, money(p.total), " ", el("small", {}, `${p.noches} noches`, p.noche ? ` · ${money(p.noche)}/noche` : ""), " ", conf(p.conf)),
        p.nota ? el("p", { class: "meta" }, p.nota) : null,
        el("details", {}, el("summary", {}, "Pros, contras y detalles"),
          l.detalle_acceso ? el("p", {}, l.detalle_acceso) : null,
          (l.pros || []).length ? el("ul", {}, l.pros.map((x) => el("li", {}, "👍 " + x))) : null,
          (l.contras || []).length ? el("ul", {}, l.contras.map((x) => el("li", {}, "👎 " + x))) : null,
          l.ideal_si ? el("p", {}, el("strong", {}, "Ideal si: "), l.ideal_si) : null,
          (l.amenidades || []).length ? el("p", { class: "meta" }, l.amenidades.join(" · ")) : null,
          p.src ? el("p", { class: "meta" }, "Fuente del precio: ", ext(p.src, null, "ver")) : null),
        el("div", { class: "row" },
          boton({ class: "btn", onclick: () => { state.l = i; render(); $("#combo").scrollIntoView(); } }, state.l === i ? "Elegido ✓" : "Elegir"),
          l.link ? ext(l.link, { class: "btn ghost" }, "Sitio oficial") : null,
          l.galeria ? ext(l.galeria, { class: "btn ghost" }, "Fotos") : null),
        l.peticion ? boton({ class: "btn ficha-btn", onclick: () => abrirFicha(r, i) }, "📋 Ficha y qué pedir") : null);
    }));
  }

  function renderCombo() {
    const r = currentResort();
    if (!r) return;
    const w = VENTANAS.find((x) => x.id === state.v);
    const l = (r.alojamientos || [])[state.l] || {};
    const e2 = espacio(r.slug, l);
    $("#combo-title").textContent = `${r.nombre} · ${corto(l.nombre) || "—"} · ${w.corto}` + (e2 && e2.m2 ? ` · 📐 ${e2.m2} m²` : "");
    document.querySelectorAll("[data-food]").forEach((b) => b.classList.toggle("on", b.dataset.food === state.f));
    const its = items(r, state.l, state.v, state.f);
    const total = sum(its);
    $("#combo-table").replaceChildren(
      ...its.map((i) => el("tr", {},
        el("td", {}, i.label, i.note ? el("span", { class: "note" }, i.note) : null),
        el("td", {}, i.amount == null ? el("span", { class: "missing" }, "sin dato") : [money(i.amount), " ", conf(i.conf), i.src ? [" ", ext(i.src, { title: "Fuente" }, "↗")] : null]))),
      el("tr", { class: "sum" }, el("td", {}, "Total estimado"), el("td", {}, money(total))));
    const pct = Math.min(100, (total / 10000) * 100);
    const lv = level(total);
    const color = COLOR_NIVEL[lv];
    const faltan = missing(its);
    if (lodgingPrice(l, state.v).total == null) {
      $("#combo-meter").replaceChildren(el("div", { class: "verdict missing" }, "Este hospedaje no tiene precio para estas fechas todavía; el total está incompleto."));
      return;
    }
    $("#combo-meter").replaceChildren(
      el("div", { class: "bar" }, el("div", { class: "fill", style: `width:${pct}%;background:${color}` })),
      el("div", { class: "marks" }, el("span", {}, "$0"), el("span", {}, "$6,000"), el("span", {}, "$8,000"), el("span", {}, "$10,000")),
      el("div", { class: "verdict", style: `color:${color}` },
        lv === "ok" ? `Cabe en la meta de $6,000 (sobran ${money(PRESUPUESTO - total)}).` :
        lv === "warn" ? `Pasa la meta por ${money(total - PRESUPUESTO)}, pero cabe en el tope de $8,000.` :
        `Se pasa del tope de $8,000 por ${money(total - TOPE)}.`,
        faltan ? ` Ojo: ${faltan} concepto(s) sin dato.` : ""));
  }

  // ---------- contacto en un clic: llamar, copiar dirección, Google Maps, Waze ----------
  function puntoHospedaje(l) { return ((D.mapa || {}).puntos || []).find((p) => p.tipo === "hospedaje" && p.nombre === l.nombre) || null; }
  function contactos(c) {
    const nombre = c.nombre || "", dir = c.direccion || "";
    const lat = c.lat ?? null, lng = c.lng ?? null;
    if (!c.telefono && !dir && lat == null) return null;
    const q = encodeURIComponent([nombre, dir].filter(Boolean).join(", "));
    const gmaps = dir || lat == null ? `https://www.google.com/maps/search/?api=1&query=${q}` : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    const waze = lat != null ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes` : `https://waze.com/ul?q=${encodeURIComponent(dir || nombre)}&navigate=yes`;
    const copiarBtn = dir ? boton({ class: "ct" }, "📋 Copiar dirección") : null;
    if (copiarBtn) copiarBtn.addEventListener("click", () => copiar(`${nombre}\n${dir}`, copiarBtn));
    return el("div", { class: "contacto" },
      c.telefono ? el("a", { class: "ct", href: "tel:" + c.telefono.replace(/[^+\d]/g, "") }, "📞 Llamar", c.telefono_texto ? el("small", {}, c.telefono_texto) : null) : null,
      copiarBtn,
      ext(gmaps, { class: "ct" }, "📍 Google Maps"),
      ext(waze, { class: "ct" }, "🚗 Waze"),
      dir ? el("p", { class: "ct-dir" }, dir) : null);
  }

  // ---------- ficha del hospedaje: características, qué pedir y textos para Booking ----------
  async function copiar(texto, btn) {
    try { await navigator.clipboard.writeText(texto); } catch (e) {
      const ta = el("textarea", {}, texto); document.body.append(ta); ta.select();
      try { document.execCommand("copy"); } catch (e2) { /* nada */ } ta.remove();
    }
    const antes = btn.textContent; btn.textContent = "✓ Copiado"; btn.classList.add("ok");
    setTimeout(() => { btn.textContent = antes; btn.classList.remove("ok"); }, 1800);
  }

  function abrirFicha(r, i) {
    const l = r.alojamientos[i], p = l.peticion || {}, rec = p.recomendacion || {};
    const e = espacio(r.slug, l), lp = lodgingPrice(l, state.v), pt = puntaje(r, i);
    const foto = l.foto ? l.foto : l.foto_zona ? l.foto_zona.url : null;
    const caja = (idioma, bandera, texto) => {
      const btn = boton({ class: "btn sm" }, "📋 Copiar");
      btn.addEventListener("click", () => copiar(texto, btn));
      return el("div", { class: "pedido" }, el("div", { class: "pedido-h" }, el("strong", {}, `${bandera} ${idioma}`), btn), el("p", {}, texto));
    };
    $("#ficha-body").replaceChildren(
      el("div", { class: "ficha-top" },
        foto ? el("div", { class: "ficha-img photo-tone", style: `background-image:url("${foto}")` }) : null,
        boton({ class: "ficha-close", "aria-label": "Cerrar", onclick: () => $("#ficha").close() }, "✕")),
      el("div", { class: "ficha-in" },
        el("p", { class: "eyebrow-d" }, r.nombre),
        el("h3", {}, l.nombre),
        el("div", { class: "badges" },
          m2txt(e) ? el("span", { class: "badge m2" }, "📐 " + m2txt(e)) : null,
          el("span", { class: "badge star" }, `⭐ ${pt.score}/100`),
          lp.total ? el("span", { class: "badge" }, `💰 ${money(lp.total)} · ${lp.noches} noches`) : null,
          l.ski_in_out === "verdadero" ? el("span", { class: "badge ok" }, "Ski-in/ski-out real") : null),
        (() => { const pt0 = puntoHospedaje(l); return contactos({ nombre: l.nombre.split(" (")[0].split(",")[0], telefono: p.telefono, telefono_texto: p.telefono_texto, direccion: p.direccion, lat: p.lat ?? (pt0 && pt0.lat), lng: p.lng ?? (pt0 && pt0.lng) }); })(),
        el("div", { class: "reco" },
          el("div", { class: "reco-h" }, "🎯 Qué pedir"),
          el("p", { class: "reco-pedir" }, rec.pedir || "—"),
          rec.por_que ? el("p", { class: "reco-por" }, el("strong", {}, "Por qué: "), rec.por_que) : null,
          (rec.unidades || []).length ? el("div", { class: "reco-uds" }, el("span", {}, "Unidades recomendadas: "), rec.unidades.map((u) => el("span", { class: "ud" }, u))) : null,
          (rec.evitar || []).length ? el("div", { class: "reco-evitar" }, el("strong", {}, "Evitar: "), rec.evitar.join(" · ")) : null,
          rec.confianza ? el("p", { class: "reco-conf" }, conf(rec.confianza), " Confianza ", rec.confianza) : null),
        el("h4", {}, "📝 Para pegar en Booking"),
        el("p", { class: "meta" }, "Al reservar, en «Peticiones especiales». Si ya reservaste: Administrar reserva → Peticiones especiales, o mándalo por el chat del alojamiento unos 7 días antes de llegar."),
        p.solicitud_es ? caja("Español", "🇲🇽", p.solicitud_es) : null,
        p.solicitud_en ? caja("English", "🇺🇸", p.solicitud_en) : null,
        (p.caracteristicas || []).length ? el("h4", {}, "✨ Características") : null,
        (p.caracteristicas || []).length ? el("ul", { class: "carac" }, p.caracteristicas.map((c) => el("li", {}, c))) : null,
        el("div", { class: "row" },
          l.link ? ext(l.link, { class: "btn ghost" }, "Sitio oficial") : null,
          boton({ class: "btn", onclick: () => { $("#ficha").close(); state.r = r.slug; state.l = i; render(); $("#combo").scrollIntoView(); } }, "Elegir este hospedaje")),
        (p.fuentes || []).length ? el("details", { class: "fuentes" }, el("summary", {}, "Fuentes"), el("ul", {}, p.fuentes.slice(0, 12).map((u) => el("li", {}, ext(u, null, u.replace(/^https?:\/\/(www\.)?/, "").slice(0, 70)))))) : null));
    $("#ficha").showModal();
    $("#ficha").scrollTop = 0;
  }

  // ---------- catálogo de pistas con mapa oficial ----------
  const P = D.pistas || [];
  const ESTADO_MAPA = window.SKIAR_MAPAS || {};
  const CEL = window.matchMedia("(max-width: 700px)");
  const urlOk = (u) => !!u && (ESTADO_MAPA[u] ? ESTADO_MAPA[u].ok !== false : true);
  const fmtN = (n, suf) => (n == null ? "—" : Math.round(n).toLocaleString("es-MX") + (suf || ""));
  let filtroPistas = "Todas";

  function renderPistas() {
    const estados = ["Todas", "Finalistas", ...[...new Set(P.map((p) => p.estado).filter(Boolean))]];
    $("#pistas-filtros").replaceChildren(...estados.map((e) => boton({ class: "filter" + (filtroPistas === e ? " on" : ""), onclick: () => { filtroPistas = e; renderPistas(); } }, e)));
    const lista = P.filter((p) => filtroPistas === "Todas" || (filtroPistas === "Finalistas" ? p.finalista : p.estado === filtroPistas))
      .sort((a, b) => (b.finalista ? 1 : 0) - (a.finalista ? 1 : 0));
    $("#pistas-lista").replaceChildren(...lista.map((p) => {
      const s = p.stats || {};
      const tieneMapa = urlOk(p.mapa_img) || urlOk(p.mapa_pdf);
      const niv = [["ini", s.principiante_pct], ["int", s.intermedio_pct], ["ava", s.avanzado_pct]];
      return el("article", { class: "pista" + (p.finalista ? " fin" : "") },
        el("div", { class: "pista-h" },
          el("div", {}, el("h3", { title: p.resumen }, p.nombre), el("p", { class: "meta" }, [p.estado, p.pase].filter(Boolean).join(" · "))),
          p.finalista ? el("span", { class: "badge star" }, "⭐ Finalista") : null),
        el("div", { class: "pista-stats" },
          el("div", {}, el("small", {}, "Pistas"), el("strong", {}, fmtN(s.pistas))),
          el("div", {}, el("small", {}, "Hectáreas"), el("strong", {}, fmtN(s.hectareas))),
          el("div", {}, el("small", {}, "Telesillas"), el("strong", {}, fmtN(s.telesillas))),
          el("div", {}, el("small", {}, "Desnivel"), el("strong", {}, fmtN(s.desnivel_m, " m"))),
          el("div", {}, el("small", {}, "Base → cima"), el("strong", {}, s.base_m ? `${fmtN(s.base_m)}–${fmtN(s.cima_m)} m` : "—")),
          el("div", {}, el("small", {}, "Nieve al año"), el("strong", {}, fmtN(s.nevada_cm, " cm")))),
        niv.some(([, v]) => v) ? el("div", { class: "niveles", title: "Principiante · Intermedio · Avanzado" },
          niv.map(([k, v]) => v ? el("span", { class: "nv-" + k, style: `flex:${v}` }, `${Math.round(v)}%`) : null)) : null,
        p.ninos ? el("p", { class: "pista-ninos" }, "👧 ", p.ninos) : null,
        contactos({ nombre: p.nombre, telefono: p.telefono, telefono_texto: p.telefono_texto, direccion: p.direccion, lat: p.lat, lng: p.lng }),
        el("div", { class: "row" },
          tieneMapa ? boton({ class: "btn", onclick: () => abrirMapa(p) }, "🗺️ Ver mapa") : null,
          urlOk(p.mapa_pdf) ? ext(p.mapa_pdf, { class: "btn ghost", download: "" }, "⬇️ PDF") : null,
          p.mapa_pagina ? ext(p.mapa_pagina, { class: "btn ghost" }, tieneMapa ? "Página oficial" : "🗺️ Mapa oficial") : null));
    }));
  }

  function abrirMapa(p) {
    const img = urlOk(p.mapa_img) ? p.mapa_img : null;
    const pdf = urlOk(p.mapa_pdf) ? p.mapa_pdf : null;
    let visor;
    if (img) visor = ext(img, { class: "mapa-img" }, el("img", { src: img, alt: "Mapa de pistas de " + p.nombre, referrerpolicy: "no-referrer" }));
    else if (pdf) visor = el("iframe", { class: "mapa-pdf", title: "Mapa de pistas de " + p.nombre, src: CEL.matches ? "https://docs.google.com/viewer?embedded=true&url=" + encodeURIComponent(pdf) : pdf + "#view=FitH" });
    $("#mapa-dlg-body").replaceChildren(
      el("div", { class: "mapa-dlg-h" },
        el("div", {}, el("p", { class: "eyebrow-d" }, [p.estado, p.temporada_mapa ? "Mapa " + p.temporada_mapa : null].filter(Boolean).join(" · ")), el("h3", {}, p.nombre)),
        boton({ class: "ficha-close static", "aria-label": "Cerrar", onclick: () => $("#mapa-dlg").close() }, "✕")),
      visor || el("p", { class: "muted", style: "padding:16px" }, "No hay mapa descargable; usa la página oficial."),
      el("div", { class: "row mapa-dlg-acc" },
        pdf ? ext(pdf, { class: "btn", download: "" }, "⬇️ Descargar PDF") : null,
        img ? ext(img, { class: "btn ghost" }, "🔍 Abrir en grande") : null,
        pdf ? ext(pdf, { class: "btn ghost" }, "Abrir PDF") : null,
        p.mapa_pagina ? ext(p.mapa_pagina, { class: "btn ghost" }, "Página oficial") : null),
      pdf ? el("p", { class: "meta", style: "padding:0 18px 16px" }, "Si no se ve aquí, usa «Abrir PDF».") : null);
    $("#mapa-dlg").showModal();
  }
  ["ficha", "mapa-dlg"].forEach((id) => $("#" + id).addEventListener("click", (ev) => { if (ev.target.id === id) ev.target.close(); }));

  // ---------- cuadro comparativo ----------
  const cmp = { sort: "puntaje", dir: 1, soloSki: false, soloPres: false, soloGratis: false };
  const corto = (x) => (x || "").split(/[;(]| — /)[0].trim();

  function filasComparativo() {
    const rows = [];
    D.resorts.forEach((r) => (r.alojamientos || []).forEach((l, i) => {
      const t = tripTotal(r, i, state.v, state.f);
      const lp = lodgingPrice(l, state.v);
      rows.push({
        r, l, i, t,
        hosp: lp.total, conf: lp.conf,
        ski: nivelSki(l),
        gratis: esGratis(r, l),
        alt: r.altitud_base_m || 0,
        viaje: balance(r, i).viajando,
        nieve: (nieve(r.slug, state.v) || {}).cm ?? null,
        m2: (espacio(r.slug, l) || {}).m2 ?? null,
        pts: puntaje(r, i),
      });
    }));
    return rows;
  }

  function renderComparativo() {
    const f = [["soloSki", "⛷️ Solo ski-in/ski-out"], ["soloGratis", "👧 Niña esquía gratis"], ["soloPres", "💰 Hasta $8,000"]];
    $("#cmp-filtros").replaceChildren(...f.map(([k, txt]) => boton({ class: "filter" + (cmp[k] ? " on" : ""), "aria-pressed": String(cmp[k]), onclick: () => { cmp[k] = !cmp[k]; renderComparativo(); } }, txt)));

    let rows = filasComparativo();
    if (cmp.soloSki) rows = rows.filter((x) => x.ski === 2);
    if (cmp.soloGratis) rows = rows.filter((x) => x.gratis);
    if (cmp.soloPres) rows = rows.filter((x) => !x.t.sinHospedaje && x.t.total <= TOPE);
    const key = { total: (x) => (x.t.sinHospedaje ? 1e9 : x.t.total), hosp: (x) => x.hosp ?? 1e9, ski: (x) => -x.ski, gratis: (x) => (x.gratis ? 0 : 1), alt: (x) => x.alt, viaje: (x) => x.viaje ?? 1e9, nieve: (x) => -(x.nieve ?? -1), m2: (x) => -(x.m2 ?? -1), puntaje: (x) => -x.pts.score, nombre: (x) => x.r.nombre + x.l.nombre }[cmp.sort];
    rows.sort((a, b) => { const ka = key(a), kb = key(b); return (ka > kb ? 1 : ka < kb ? -1 : 0) * cmp.dir; });

    const conPrecio = rows.filter((x) => !x.t.sinHospedaje);
    const minTotal = Math.min(...conPrecio.map((x) => x.t.total));
    const minHosp = Math.min(...rows.map((x) => x.hosp ?? Infinity));
    const minAlt = Math.min(...rows.map((x) => x.alt || Infinity));
    const minViaje = Math.min(...rows.map((x) => x.viaje ?? Infinity));
    const maxNieve = Math.max(...rows.map((x) => x.nieve ?? -1));
    const maxM2 = Math.max(...rows.map((x) => x.m2 ?? -1));
    const maxPts = Math.max(...rows.map((x) => x.pts.score));
    const star = (c) => (c ? " ⭐" : "");

    // podio: las 3 con mejor puntaje familiar (precio, espacio, acceso, niña gratis, viaje)
    const podio = filasComparativo().filter((x) => !x.t.sinHospedaje).sort((a, b) => b.pts.score - a.pts.score).slice(0, 3);
    $("#cmp-podio").replaceChildren(...podio.map((x, n) => boton({ class: "podio-item", title: detallePuntaje(x.pts), onclick: () => elegir(x) },
      el("span", { class: "medal" }, MEDALLAS[n]),
      el("span", {}, el("strong", {}, x.r.nombre), el("small", {}, corto(x.l.nombre) + (x.m2 ? ` · 📐 ${x.m2} m²` : "") + ` · ⭐ ${x.pts.score}`)),
      el("span", { class: "podio-total " + level(x.t.total) }, money(x.t.total)))));

    const th = (k, txt) => el("th", { class: "sortable" + (cmp.sort === k ? " on" : ""), onclick: () => { cmp.dir = cmp.sort === k ? -cmp.dir : 1; cmp.sort = k; renderComparativo(); } }, txt, cmp.sort === k ? (cmp.dir > 0 ? " ▲" : " ▼") : "");
    const head = el("tr", {}, th("nombre", "Opción"), th("puntaje", "⭐ Puntaje"), th("total", "💰 Total del viaje"), th("hosp", "🏔️ Hospedaje"), th("m2", "📐 Espacio"), th("ski", "⛷️ Acceso a pista"), th("gratis", "👧 Niña gratis"), el("th", {}, "🏫 Escuela infantil"), el("th", {}, "🛏️ Cuartos / cocina"), th("alt", "📏 Altitud"), th("viaje", "🕒 Horas viajando"), th("nieve", "❄️ Nieve"), el("th", {}, ""));
    const sel = (x) => state.r === x.r.slug && state.l === x.i;
    const body = rows.map((x) => {
      const pct = x.t.sinHospedaje ? 0 : Math.min(100, (x.t.total / 12000) * 100);
      const color = COLOR_NIVEL[level(x.t.total)];
      return el("tr", { class: sel(x) ? "sel" : "" },
        el("td", { class: "opt" }, el("strong", {}, x.r.nombre), el("span", {}, corto(x.l.nombre))),
        el("td", { class: "n", title: detallePuntaje(x.pts) }, el("span", { class: "pts" }, `${x.pts.score}`), star(x.pts.score === maxPts)),
        el("td", { class: "tot" }, x.t.sinHospedaje ? el("span", { class: "missing" }, "sin disponibilidad") : [el("div", { class: "tot-n " + level(x.t.total) }, money(x.t.total) + star(x.t.total === minTotal)), el("div", { class: "mini-bar" }, el("i", { style: `width:${pct}%;background:${color}` }))]),
        el("td", { class: "n" }, money(x.hosp), " ", conf(x.conf), star(x.hosp === minHosp)),
        el("td", { class: "n" }, x.m2 ? `${x.m2} m²` + star(x.m2 === maxM2) : "—"),
        el("td", {}, ["🔴 Shuttle", "🟡 Caminando", "🟢 Ski-in/ski-out"][x.ski]),
        el("td", {}, x.gratis ? "✅ Sí" : "— Paga"),
        el("td", { class: "txt" }, el("div", { class: "clamp" }, corto(x.l.distancia_escuela) || "—")),
        el("td", { class: "txt" }, el("div", { class: "clamp" }, [corto(x.l.recamaras), x.l.cocina ? "con cocina" : "sin cocina"].filter(Boolean).join(" · "))),
        el("td", { class: "n" }, x.alt ? x.alt.toLocaleString("es-MX") + " m" + star(x.alt === minAlt) : "—"),
        el("td", { class: "n" }, fmtH(x.viaje) + star(x.viaje != null && x.viaje === minViaje)),
        el("td", { class: "n" }, x.nieve == null ? "—" : `❄️ ${x.nieve} cm` + star(x.nieve === maxNieve)),
        el("td", {}, boton({ class: "btn sm", onclick: () => elegir(x) }, sel(x) ? "✓" : "Elegir")));
    });
    $("#cmp").replaceChildren(el("thead", {}, head), el("tbody", {}, body.length ? body : [el("tr", {}, el("td", { colspan: 14, class: "muted" }, "Ninguna opción cumple esos filtros."))]));
  }

  function elegir(x) { state.r = x.r.slug; state.l = x.i; render(); $("#combo").scrollIntoView(); }

  // ---------- mapa y tiempos ----------
  const M = D.mapa || {};
  const DIAS_ESQUI = 5;
  const ICONO_MODO = { carro: "🚗", vuelo: "✈️", espera: "⏳", shuttle: "🚌", caminando: "🚶", gondola: "🚡" };
  const tramo = (id) => (M.tramos || []).find((x) => x.id === id);
  const punto = (id) => (M.puntos || []).find((x) => x.id === id);
  const fmtH = (h) => (h == null ? "—" : h < 1 ? Math.round(h * 60) + " min" : (Math.round(h * 10) / 10).toLocaleString("es-MX") + " h");

  function viaje(slug) {
    const it = ((M.itinerarios_por_ventana || {})[state.v] || {})[slug] || (M.itinerarios || {})[slug];
    if (!it) return null;
    const suma = (ids) => (ids || []).reduce((s, id) => s + ((tramo(id) || {}).horas || 0), 0);
    return { it, ida: suma(it.ida), regreso: suma(it.regreso) };
  }

  function balance(resort, li) {
    const l = (resort.alojamientos || [])[li] || {};
    const v = viaje(resort.slug);
    const pistas = (M.horario_pistas || {})[resort.slug] || {};
    const minEscuela = ((M.hospedaje_a_escuela_min || {})[resort.slug] || {})[l.nombre];
    const diario = minEscuela != null ? (minEscuela * 2 * DIAS_ESQUI) / 60 : null;
    const esqui = pistas.horas ? pistas.horas * DIAS_ESQUI : null;
    const viajando = v ? v.ida + v.regreso + (diario || 0) : null;
    return { v, diario, minEscuela, esqui, viajando };
  }

  let mapa = null, capa = null, mapaSlug = null;
  const COLOR_RESORT = { keystone: "#e0703a", breckenridge: "#7a4fd0", steamboat: "#2e8b57", snowmass: "#1d5fa8", purgatory: "#0e9f9a" };
  const COLOR_TIPO = { origen: "#c0392b", aeropuerto: "#12263a", resort: "#2e8b57", escuela: "#b7791f", hospedaje: "#7a4fd0" };

  function dibujarRuta(ids, colorTierra, grupo) {
    (ids || []).forEach((id) => {
      const x = tramo(id); const a = x && punto(x.de), b = x && punto(x.a);
      if (!a || !b || a.id === b.id || a.lat == null || b.lat == null) return;
      L.polyline([[a.lat, a.lng], [b.lat, b.lng]], { color: x.modo === "vuelo" ? "#1d5fa8" : colorTierra, weight: 3, opacity: .9, dashArray: x.modo === "vuelo" ? "6 8" : null })
        .bindTooltip(`${ICONO_MODO[x.modo] || ""} ${(a.nombre || "").split(" (")[0]} → ${(b.nombre || "").split(" (")[0]}: ${fmtH(x.horas)}`).addTo(grupo);
    });
  }

  function renderMapa() {
    if (!M.puntos || !M.puntos.length) { $("#mapa").hidden = true; return; }
    mapaSlug = mapaSlug || "todos";
    const todos = mapaSlug === "todos";
    $("#mapa-tabs").replaceChildren(
      boton({ class: todos ? "on" : "", onclick: () => { mapaSlug = "todos"; renderMapa(); } }, "🌎 Todos"),
      ...D.resorts.map((r) => boton({ class: mapaSlug === r.slug ? "on" : "", onclick: () => { mapaSlug = r.slug; renderMapa(); } }, el("span", { class: "sw", style: `background:${COLOR_RESORT[r.slug]}` }), r.nombre)));
    const v = todos ? null : viaje(mapaSlug);
    const r = D.resorts.find((x) => x.slug === mapaSlug);

    const pasos = (ids) => (ids || []).map((id) => tramo(id)).filter(Boolean).map((x) =>
      el("li", {}, el("span", { class: "modo" }, ICONO_MODO[x.modo] || "•"),
        el("span", { class: "desc" }, x.de === x.a || x.modo === "espera" ? "Espera en " + ((punto(x.de) || {}).nombre || x.de) : ((punto(x.de) || {}).nombre || x.de) + " → " + ((punto(x.a) || {}).nombre || x.a), x.nota ? el("small", {}, x.nota) : null),
        el("span", { class: "h" }, fmtH(x.horas), " ", conf(x.confianza))));

    if (todos) {
      $("#mapa-ruta").replaceChildren(
        el("h4", { style: "margin-top:0" }, `🌎 Los ${D.resorts.length} destinos de un vistazo`),
        ...D.resorts.map((rr) => {
          const vv = viaje(rr.slug); const b = balance(rr, defaultLodging(rr));
          return boton({ class: "dest-row", onclick: () => { mapaSlug = rr.slug; renderMapa(); } },
            el("span", { class: "sw big", style: `background:${COLOR_RESORT[rr.slug]}` }),
            el("span", { class: "dest-name" }, el("strong", {}, rr.nombre), el("small", {}, (() => { const id = vv && vv.it.ruta; const ru = (V.rutas || []).find((q) => q.id === id); return ru ? (ru.aerolinea || "") + " · " + (ru.descripcion || id).split("(")[0].trim() : id || ""; })())),
            el("span", { class: "dest-n" }, el("small", {}, "🛫 ida"), fmtH(vv && vv.ida)),
            el("span", { class: "dest-n" }, el("small", {}, "🛬 regreso"), fmtH(vv && vv.regreso)),
            el("span", { class: "dest-n" }, el("small", {}, "⛷️ pista"), fmtH(b.esqui)));
        }));
    } else {
      const pist = (M.horario_pistas || {})[mapaSlug] || {};
      const esc = (M.horario_escuela || {})[mapaSlug] || {};
      $("#mapa-ruta").replaceChildren(
        v ? el("div", { class: "ruta-tot" }, el("div", {}, el("small", {}, "Ida, puerta a puerta"), el("strong", {}, fmtH(v.ida))), el("div", {}, el("small", {}, "Regreso"), el("strong", {}, fmtH(v.regreso)))) : el("p", { class: "muted" }, "Sin itinerario."),
        v ? (() => { const b = balance(r, state.r === r.slug && state.l != null ? state.l : defaultLodging(r)); return el("div", { class: "ruta-tot" },
          el("div", {}, el("small", {}, "⛷️ Días esquiando"), el("strong", {}, DIAS_ESQUI + " días"), el("small", {}, fmtH(b.esqui) + " de pista")),
          el("div", {}, el("small", {}, "🕒 Horas viajando"), el("strong", {}, fmtH(b.viajando)), el("small", {}, (v.it.noche_denver ? "+ 1 noche en Denver · " : "") + "días de viaje: 2"))); })() : null,
        v ? el("h4", {}, "🛫 Ida") : null, v ? el("ol", { class: "pasos" }, pasos(v.it.ida)) : null,
        v ? el("h4", {}, "🛬 Regreso") : null, v ? el("ol", { class: "pasos" }, pasos(v.it.regreso)) : null,
        el("h4", {}, "⛷️ En la montaña"),
        el("p", { class: "meta" }, pist.abre ? `Telesillas ${pist.abre}–${pist.cierra} (${fmtH(pist.horas)} al día)` : "Horario de pistas por confirmar",
          esc.entrega ? el("br") : null, esc.entrega ? `Escuela de la niña: entrega ${esc.entrega}, recoge ${esc.recoge}` : null));
    }

    // mapa (OpenStreetMap)
    if (!window.L) { $("#map").replaceChildren(el("p", { class: "muted", style: "padding:16px" }, "No se pudo cargar el mapa.")); return; }
    if (!mapa) {
      mapa = L.map("map", { scrollWheelZoom: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 }).addTo(mapa);
    }
    if (capa) capa.remove();
    capa = L.layerGroup().addTo(mapa);
    const slugs = todos ? D.resorts.map((x) => x.slug) : [mapaSlug];
    // Solo ubicaciones en Colorado: sin trayectos largos desde México ni escalas.
    const enColorado = (p) => p && p.lat != null && p.lat > 36.9 && p.lat < 41.1 && p.lng < -102 && p.lng > -109.1;
    const usados = new Set();
    if (!todos) slugs.forEach((s) => { const vv = viaje(s); if (vv) [...vv.it.ida, ...vv.it.regreso].forEach((id) => { const x = tramo(id); if (x) { usados.add(x.de); usados.add(x.a); } }); });
    const visibles = (M.puntos || []).filter((p) => enColorado(p) && (p.resort ? slugs.includes(p.resort) : usados.has(p.id)));
    if (!todos) slugs.forEach((s) => { const vv = viaje(s); if (vv) dibujarRuta(vv.it.ida.filter((id) => { const x = tramo(id); return x && enColorado(punto(x.de)) && enColorado(punto(x.a)); }), "#e0703a", capa); });
    visibles.forEach((p) => {
      const rad = p.tipo === "hospedaje" ? 6 : p.tipo === "escuela" ? 7 : 9;
      const fill = todos && p.resort ? COLOR_RESORT[p.resort] : COLOR_TIPO[p.tipo] || "#555";
      const rn = p.resort ? (D.resorts.find((x) => x.slug === p.resort) || {}).nombre : "";
      const m = L.circleMarker([p.lat, p.lng], { radius: rad, color: "#fff", weight: 2, fillColor: fill, fillOpacity: 1 })
        .bindPopup(`<strong>${p.nombre}</strong><br>${rn ? rn + " · " : ""}${p.tipo}${p.precision === "aproximada" ? " · ubicación aproximada" : ""}`).addTo(capa);
      if (p.tipo === "resort" || (p.tipo !== "hospedaje" && p.tipo !== "escuela" && !p.resort)) m.bindTooltip(p.tipo === "resort" ? (D.resorts.find((x) => x.slug === p.resort) || {}).nombre || p.nombre : (p.nombre || "").split(" (")[0].split(" – ")[0], { permanent: p.tipo === "resort", direction: "right", className: "map-label" });
    });
    const pts = visibles.map((p) => [p.lat, p.lng]);
    if (pts.length) mapa.fitBounds(pts, { padding: [40, 40], maxZoom: todos ? 9 : 13 });

    setTimeout(() => mapa.invalidateSize(), 50);
  }

  function renderBalance() {
    if (!M.puntos || !M.puntos.length) return;
    const rows = [];
    D.resorts.forEach((r) => (r.alojamientos || []).forEach((l, i) => rows.push({ r, l, i, b: balance(r, i) })));
    rows.sort((a, b) => ((b.b.esqui || 0) / (b.b.viajando || 1e9)) - ((a.b.esqui || 0) / (a.b.viajando || 1e9)));
    $("#balance-top").replaceChildren(...rows.filter((x) => lodgingPrice(x.l, state.v).total != null).slice(0, 3).map((x, n) => boton({ class: "podio-item", onclick: () => { mapaSlug = x.r.slug; elegir(x); } },
      el("span", { class: "medal" }, MEDALLAS[n]),
      el("span", {}, el("strong", {}, x.r.nombre), el("small", {}, corto(x.l.nombre) + " · " + fmtH(x.b.viajando) + " viajando")),
      el("span", { class: "podio-total ok" }, "⛷️ " + fmtH(x.b.esqui)))));
    const head = el("tr", {}, el("th", {}, "Opción"), el("th", {}, "🛫 Ida"), el("th", {}, "🛬 Regreso"), el("th", {}, "🚶 Hotel ↔ escuela (5 días)"), el("th", {}, "🕒 Total viajando"), el("th", {}, "⛷️ Horas de pista (5 días)"), el("th", {}, "📊 Nieve por hora de viaje"), el("th", {}, ""));
    $("#balance").replaceChildren(el("thead", {}, head), el("tbody", {}, rows.map((x) => {
      const ratio = x.b.esqui && x.b.viajando ? x.b.esqui / x.b.viajando : null;
      return el("tr", { class: state.r === x.r.slug && state.l === x.i ? "sel" : "" },
        el("td", { class: "opt" }, el("strong", {}, x.r.nombre), el("span", {}, corto(x.l.nombre))),
        el("td", { class: "n" }, fmtH(x.b.v && x.b.v.ida)),
        el("td", { class: "n" }, fmtH(x.b.v && x.b.v.regreso)),
        el("td", { class: "n", title: x.b.minEscuela == null ? null : `${x.b.minEscuela} min × 2 × 5` }, fmtH(x.b.diario)),
        el("td", { class: "n" }, el("strong", {}, fmtH(x.b.viajando))),
        el("td", { class: "n" }, fmtH(x.b.esqui)),
        el("td", { class: "n" }, ratio ? el("span", { class: "tot-n " + (ratio >= 1.4 ? "ok" : ratio >= 1.1 ? "warn" : "bad") }, ratio.toFixed(1) + " h") : "—"),
        el("td", {}, boton({ class: "btn sm", onclick: () => { mapaSlug = x.r.slug; elegir(x); } }, "Elegir")));
    })));
    $("#balance-nota").textContent = `"Viajando" = ida + regreso + vueltas a la escuela.`;
  }

  // ---------- nieve estimada ----------
  const N = D.nieve || {};
  const nieve = (slug, v) => ((N.resorts || {})[slug] || {})[v] || null;
  const PROB = { alta: "Muy probable que esté bien", media: "Probable", baja: "Incierto" };

  function renderNieve() {
    if (!N.resorts) return;
    $("#nieve").hidden = false;
    const w = VENTANAS.find((x) => x.id === state.v);
    $("#nieve-titulo").textContent = `❄️ Nieve esperada · ${w.corto}`;
    let max = 50;
    D.resorts.forEach((r) => { const n = nieve(r.slug, state.v); if (n) max = Math.max(max, n.alto || n.cm || 0); });
    $("#nieve-chart").replaceChildren(...D.resorts.map((r) => {
      const n = nieve(r.slug, state.v);
      if (!n) return el("div", { class: "nv-row" }, el("div", { class: "nv-name" }, r.nombre), el("div", {}, "—"));
      const h = (n.cm / max) * 100, lo = ((n.bajo ?? n.cm) / max) * 100, hi = ((n.alto ?? n.cm) / max) * 100;
      return el("div", { class: "nv-row", title: n.nota || "" },
        el("div", { class: "nv-name" }, r.nombre),
        el("div", { class: "nv-track" },
          el("div", { class: "nv-range", style: `left:${lo}%;width:${Math.max(1, hi - lo)}%` }),
          el("div", { class: "nv-fill " + (n.prob_buena || "media"), style: `width:${h}%` })),
        el("div", { class: "nv-lbl" }, el("strong", {}, `${n.cm} cm`), el("span", {}, ` ${n.bajo}–${n.alto}`)));
    }));
    $("#nieve-nota").textContent = "Franja clara: de un año seco a uno bueno.";
  }

  let galSlug = null;
  const MAX_FOTOS = 10;
  function renderGallery() {
    galSlug = galSlug || state.r || (D.resorts[0] && D.resorts[0].slug);
    $("#gal-tabs").replaceChildren(...D.resorts.map((r) => boton({ class: galSlug === r.slug ? "on" : "", onclick: () => { galSlug = r.slug; renderGallery(); } }, r.nombre)));
    const r = D.resorts.find((x) => x.slug === galSlug);
    if (!r) return;
    const cats = [["ubicacion", "📍 El lugar"], ["pista", "⛷️ La pista"], ["alojamiento", "🏔️ Hospedaje"]];
    const box = $("#gallery");
    box.replaceChildren();
    let total = 0;
    const vacio = el("p", { class: "muted" }, "Cargando fotos…");
    box.append(vacio);
    cats.forEach(([c, titulo]) => {
      // solo fotos con imagen real; se muestran las primeras 10 que sí cargan
      const fs = (r.fotos || []).filter((f) => f.categoria === c && f.url_imagen);
      if (!fs.length) return;
      const head = el("div", { class: "gal-cat", hidden: true }, titulo);
      box.append(head);
      let visibles = 0;
      fs.forEach((f) => {
        const link = f.url_pagina || f.url_imagen;
        const img = el("img", { src: f.url_imagen, alt: f.descripcion || "", referrerpolicy: "no-referrer" });
        const fig = el("figure", { hidden: true }, ext(link, { class: "photo" }, img),
          f.credito ? el("figcaption", {}, f.credito) : null);
        box.append(fig);
        img.addEventListener("load", () => {
          if (visibles >= MAX_FOTOS || img.naturalWidth < 50) { fig.remove(); return; }
          visibles++; total++; fig.hidden = false; head.hidden = false; vacio.remove();
        });
        img.addEventListener("error", () => fig.remove());
      });
    });
    setTimeout(() => { if (!total) vacio.textContent = "Todavía no hay fotos disponibles para este lugar."; }, 8000);
  }

  // ---------- lista compartida (sin usuario ni contraseña) ----------
  // Se guarda en jsonblob.com con una liga secreta; también en este navegador como respaldo.
  const Nube = (() => {
    const API = "https://jsonblob.com/api/jsonBlob";
    const KID = "skiar-lista-id", KLOCAL = "skiar-todo";
    const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } } };
    let id = ls.get(KID) || null;
    let done = {};
    try { done = JSON.parse(ls.get(KLOCAL) || "{}"); } catch (e) { done = {}; }
    let status = id ? "cargando" : "local";
    const listeners = [];
    const emit = () => listeners.forEach((f) => f());
    const saveLocal = () => ls.set(KLOCAL, JSON.stringify(done));
    async function pull() {
      if (!id) return;
      try {
        const r = await fetch(API + "/" + id, { headers: { Accept: "application/json" }, cache: "no-store" });
        if (!r.ok) throw new Error(r.status);
        const remoto = await r.json();
        done = Object.assign({}, remoto.done || {});
        saveLocal(); status = "nube";
      } catch (e) { status = "error"; }
      emit();
    }
    async function push(key, val) {
      done[key] = val; saveLocal(); emit();
      try {
        if (!id) {
          const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ done }) });
          if (!r.ok) throw new Error(r.status);
          const loc = r.headers.get("Location") || r.headers.get("x-jsonblob-id") || "";
          const nuevo = loc.split("/").pop();
          if (!nuevo) throw new Error("sin id");
          id = nuevo; ls.set(KID, id); writeHash();
        } else {
          // traer lo último antes de escribir para no borrar lo que marcó la otra persona
          const r0 = await fetch(API + "/" + id, { headers: { Accept: "application/json" }, cache: "no-store" });
          const remoto = r0.ok ? await r0.json() : { done: {} };
          done = Object.assign({}, remoto.done || {}, { [key]: val });
          saveLocal();
          const r = await fetch(API + "/" + id, { method: "PUT", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ done }) });
          if (!r.ok) throw new Error(r.status);
        }
        status = "nube";
      } catch (e) { status = "error"; }
      emit();
    }
    return {
      id: () => id,
      setId: (x) => { if (x && x !== id) { id = x; ls.set(KID, x); status = "cargando"; } },
      done: () => done, status: () => status, pull, push,
      onChange: (f) => listeners.push(f),
    };
  })();

  function renderTodo() {
    const done = Nube.done();
    const general = D.pendientes || [];
    const r = currentResort();
    const list = [...general, ...((r && r.verificar) || []).map((t) => ({ texto: t, de: r.nombre, icono: "🔎" }))];
    const st = Nube.status();
    const liga = location.href;
    const aviso = {
      nube: ["ok", "☁️ Guardado y compartido. Ana y tú ven lo mismo en esta liga."],
      cargando: ["", "⏳ Cargando la lista compartida…"],
      local: ["", "💾 Marca algo y se crea su lista compartida automáticamente."],
      error: ["warn", "⚠️ No se pudo conectar; se guardó en este dispositivo y se reintentará."],
    }[st];
    const hechos = list.filter((t) => done[(t.de || "g") + ":" + (t.texto || t).slice(0, 60)]).length;
    const tc = $("#tab-count"); if (tc) tc.textContent = `${hechos}/${list.length}`;
    $("#todo").replaceChildren(
      el("div", { class: "sync " + aviso[0] }, el("span", {}, aviso[1], " ", el("strong", {}, `${hechos}/${list.length} listos`)),
        Nube.id() ? boton({ onclick: async () => { try { await navigator.clipboard.writeText(liga); alert("Liga copiada. Mándasela a Ana y guárdenla en favoritos."); } catch (e) { prompt("Copia esta liga para Ana:", liga); } } }, "📲 Copiar liga para Ana") : null),
      ...list.map((t) => {
        const id = (t.de || "g") + ":" + (t.texto || t).slice(0, 60);
        const cb = el("input", { type: "checkbox" });
        cb.checked = !!done[id];
        cb.addEventListener("change", () => Nube.push(id, cb.checked));
        return el("label", { class: cb.checked ? "hecho" : "" }, cb, el("span", { class: "ico" }, t.icono || "📌"), el("span", {}, t.texto || t, t.de ? el("span", { class: "src" }, " · " + t.de) : null, t.fecha ? el("strong", {}, " · " + t.fecha) : null));
      }));
  }

  function renderLinks() {
    const ls = [ext(REPO + "/reports/" + encodeURIComponent("Esquí familiar Colorado y alternativas.md"), { class: "btn ghost" }, "📖 Reporte completo de la investigación")];
    D.resorts.forEach((r) => ls.push(ext(REPO + "/book/" + r.slug + "/ficha.md", { class: "btn ghost" }, "🏔️ Ficha de " + r.nombre)));
    ls.push(ext(REPO + "/book/vuelos.md", { class: "btn ghost" }, "✈️ Vuelos y traslados"));
    const fechaPrecios = (D.generado_por_ventana || {})[state.v] || D.generado;
    if (fechaPrecios) ls.push(el("p", { class: "muted" }, "🕒 Precios de estas fechas: " + new Date(fechaPrecios + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })));
    $("#links").replaceChildren(...ls);
  }

  function renderTabs() {
    const otra = state.tab !== "decidir";
    $("#vista-decidir").hidden = otra;
    $("#vista-checklist").hidden = state.tab !== "checklist";
    $("#vista-pistas").hidden = state.tab !== "pistas";
    $("#fab").hidden = otra;
    document.querySelector(".hero .steps").hidden = otra;
    document.querySelectorAll(".tab").forEach((b) => { b.classList.toggle("on", b.dataset.tab === state.tab); b.setAttribute("aria-selected", String(b.dataset.tab === state.tab)); });
  }
  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => {
    state.tab = b.dataset.tab; renderTabs(); writeHash();
    if (state.tab === "decidir" && mapa) setTimeout(() => mapa.invalidateSize(), 50);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));

  function render() {
    if (state.r && !D.resorts.some((r) => r.slug === state.r)) state.r = null;
    renderTabs();
    renderPistas();
    renderVentanas();
    renderNieve();
    renderResorts();
    renderLodgings();
    renderCombo();
    renderComparativo();
    renderMapa();
    renderBalance();
    renderGallery();
    renderTodo();
    renderLinks();
    writeHash();
  }

  document.querySelectorAll("[data-food]").forEach((b) => b.addEventListener("click", () => { state.f = b.dataset.food; render(); }));
  $("#share-btn").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(location.href); $("#share-ok").hidden = false; setTimeout(() => ($("#share-ok").hidden = true), 2500); } catch (e) { prompt("Copia esta liga:", location.href); }
  });


  readHash();
  if (!state.r) state.r = [...D.resorts].sort((a, b) => puntaje(b, defaultLodging(b)).score - puntaje(a, defaultLodging(a)).score)[0].slug;
  Nube.onChange(() => { renderTodo(); writeHash(); });
  Nube.pull();
  window.addEventListener("focus", () => Nube.pull());
  setInterval(() => { if (document.visibilityState === "visible") Nube.pull(); }, 30000);
  render();
})();
