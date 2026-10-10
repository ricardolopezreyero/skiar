(function () {
  "use strict";

  const D = window.SKIAR || { resorts: [], vuelos: {} };
  const V = D.vuelos || {};
  const REPO = "https://github.com/ricardolopezreyero/skiar/blob/" + (D.rama || "main");
  const PRESUPUESTO = 6000;
  const TOPE = 8000;

  const VENTANAS = [
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
      else if (k === "html") n.innerHTML = v;
      else if (k === "href") n.setAttribute("href", Array.isArray(v) ? v[0] : String(v).split(/[ ,;]+(?=https?:)/)[0]);
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : String(kid));
    return n;
  };
  const money = (n) => (n == null || isNaN(n) ? "—" : "$" + Math.round(n).toLocaleString("en-US"));
  const conf = (c) => el("span", { class: "dot " + (c || "baja"), title: "Confianza: " + (c || "baja / estimado") });
  const num = (x) => (typeof x === "number" && isFinite(x) ? x : null);

  // ---------- estado (se guarda en la URL para compartir) ----------
  const state = { v: "B", r: null, l: null, f: "cocinando", tab: "decidir" };
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
  function lodgingPrice(l, v) {
    const p = (l.precios || {})[v] || {};
    const total = num(p.total_6_noches_con_impuestos_usd);
    const noche = num(p.noche_usd);
    if (total != null) return { total, noche, conf: p.confianza, src: p.fuente, nota: p.nota };
    if (noche != null) return { total: noche * 6, noche, conf: "baja", src: p.fuente, nota: "6 × tarifa por noche, sin impuestos" };
    return { total: null, noche: null, conf: null, src: p.fuente };
  }

  function route(resort, v) {
    const rec = (V.recomendado || {})[resort.slug] || {};
    const ruta = (V.rutas || []).find((r) => r.id === rec.ruta);
    const tras = (V.traslados || []).find((t) => t.id === rec.traslado);
    let vuelo = null;
    if (ruta) {
      const p = (ruta.precios || {})[v] || {};
      const total = num(p.total_3_usd) ?? (num(p.por_persona_usd) != null ? p.por_persona_usd * 3 : null);
      vuelo = { total, conf: p.confianza, src: p.fuente, ruta, fechas: p.fechas_reales };
    }
    return { vuelo, tras, desdeMty: ruta ? /^mty/i.test(ruta.id) : false };
  }

  function defaultLodging(resort, v) {
    const ls = resort.alojamientos || [];
    let best = null, bestTotal = Infinity;
    ls.forEach((l, i) => {
      const t = lodgingPrice(l, v).total;
      const ski = l.ski_in_out === "verdadero";
      const score = (t == null ? 1e9 : t) + (ski ? 0 : 1e6);
      if (score < bestTotal) { bestTotal = score; best = i; }
    });
    return best ?? 0;
  }

  function items(resort, li, v, food) {
    const l = (resort.alojamientos || [])[li] || {};
    const out = [];
    const r = route(resort, v);
    if (r.vuelo) out.push({ label: "✈️ Vuelos redondos (3 personas)", amount: r.vuelo.total, conf: r.vuelo.conf, src: r.vuelo.src, note: [r.vuelo.ruta.descripcion, r.vuelo.fechas].filter(Boolean).join(" · ") });
    else out.push({ label: "✈️ Vuelos redondos (3 personas)", amount: null, note: "Falta dato" });
    if (r.vuelo && num(r.vuelo.ruta.equipaje_total_usd) != null) out.push({ label: "🧳 Equipaje documentado", amount: r.vuelo.ruta.equipaje_total_usd, conf: r.vuelo.ruta.equipaje_confianza || "baja", note: r.vuelo.ruta.equipaje_total_nota });
    if (r.vuelo && /den/i.test(r.vuelo.ruta.id) && num(V.hotel_denver_usd) != null) out.push({ label: "🏨 Primera noche en Denver (aclimatación)", amount: V.hotel_denver_usd, conf: "baja", note: V.hotel_denver_nota });
    if (r.desdeMty) {
      const g = num(V.gasolina_casetas_trc_mty_redondo_usd), e = num(V.estacionamiento_mty_usd);
      out.push({ label: "🚗 Torreón ↔ Monterrey en carro + estacionamiento", amount: g == null && e == null ? null : (g || 0) + (e || 0), conf: "media", note: "Gasolina, casetas y estacionamiento en el aeropuerto" });
    }
    if (r.tras) out.push({ label: "🚙 Traslado aeropuerto ↔ montaña", amount: num(r.tras.total_usd), conf: r.tras.confianza, src: r.tras.fuente, note: r.tras.descripcion });
    const lp = lodgingPrice(l, v);
    out.push({ label: "🏔️ Hospedaje 6 noches · " + (l.nombre || ""), amount: lp.total, conf: lp.conf, src: lp.src, note: lp.nota });
    const f = resort.forfaits || {};
    out.push({ label: "🎟️ Forfaits adultos (5 días × 2)", amount: num(f.adultos_total_usd), conf: f.confianza, src: f.fuente, note: f.como_comprar });
    const ninaGratis = l.nina_gratis !== false;
    const nina = ninaGratis ? num(f.nina_total_usd) : num(f.nina_total_sin_programa_usd) ?? num(f.nina_total_usd);
    out.push({ label: "👧 Forfait de la niña", amount: nina, conf: f.confianza, note: nina === 0 ? "Gratis: " + (resort.ninos_gratis || "") : (ninaGratis ? "" : "Este hospedaje no califica para el programa de niños gratis") });
    const e = resort.escuela || {};
    out.push({ label: "⛷️ Escuela de esquí (5 días) · " + (e.programa || ""), amount: num(e.total_5_dias_usd), conf: e.confianza, src: e.fuente, note: e.incluye });
    out.push({ label: "🎿 Renta de equipo (3 personas)", amount: num(resort.renta_equipo_total_usd), conf: "media" });
    const c = resort.comida_total_usd || {};
    const modo = food === "restaurantes" || l.cocina === false ? "restaurantes" : "cocinando";
    out.push({ label: "🍽️ Comida 6 días (" + (modo === "cocinando" ? "cocinando + algunas salidas" : "restaurantes") + ")", amount: num(c[modo]), conf: "baja", note: l.cocina === false && food === "cocinando" ? "Este hospedaje no tiene cocina" : "" });
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

  // ---------- render ----------
  function firstPhoto(resort, cats) {
    const f = (resort.fotos || []).find((p) => p.url_imagen && (!cats || cats.includes(p.categoria)));
    return f && f.url_imagen;
  }

  function renderVentanas() {
    const box = $("#ventanas");
    box.replaceChildren(...VENTANAS.map((w) =>
      el("button", { type: "button", class: "chip" + (state.v === w.id ? " on" : ""), role: "radio", "aria-checked": String(state.v === w.id), onclick: () => { state.v = w.id; render(); } },
        el("strong", {}, w.titulo + " 2027"), el("span", {}, w.nota))));
  }

  function renderResorts() {
    const list = [...D.resorts].sort((a, b) => (b.costo_beneficio || 0) - (a.costo_beneficio || 0));
    $("#resorts").replaceChildren(...list.map((r) => {
      const li = defaultLodging(r, state.v);
      const t = tripTotal(r, li, state.v, state.f);
      const ph = firstPhoto(r, ["ubicacion", "pista"]);
      const badges = [];
      if (r.forfaits && r.forfaits.nina_total_usd === 0) badges.push(el("span", { class: "badge ok" }, "Niña esquía gratis"));
      if ((r.alojamientos || []).some((l) => l.ski_in_out === "verdadero")) badges.push(el("span", { class: "badge ok" }, "Ski-in/ski-out"));
      if (r.altitud_base_m) badges.push(el("span", { class: "badge" + (r.altitud_base_m > 2800 ? " warn" : "") }, "Base " + r.altitud_base_m.toLocaleString("es-MX") + " m"));
      if (r.aeropuerto) badges.push(el("span", { class: "badge" }, "✈ " + r.aeropuerto));
      const nv = nieve(r.slug, state.v);
      if (nv) badges.push(el("span", { class: "badge " + (nv.prob_buena === "alta" ? "ok" : nv.prob_buena === "baja" ? "warn" : ""), title: nv.nota || "" }, `❄️ ~${nv.cm} cm de base`));
      return el("button", { type: "button", class: "resort" + (state.r === r.slug ? " on" : ""), onclick: () => { state.r = r.slug; state.l = null; render(); $("#hospedaje").scrollIntoView(); } },
        el("div", { class: "ph" }, ph ? el("div", { class: "ph-img photo-tone", style: `background-image:url("${ph}")` }) : null, el("span", { class: "score" }, "Costo-beneficio " + (r.costo_beneficio ?? "—") + "/10")),
        el("div", { class: "body" },
          el("h3", {}, r.nombre),
          el("p", { class: "lead" }, r.resumen || ""),
          el("div", { class: "badges" }, badges),
          el("ul", {}, (r.magia || []).slice(0, 3).map((m) => el("li", {}, m))),
          el("div", { class: "total" }, el("small", {}, "Total del viaje estimado"), t.sinHospedaje ? "—" : money(t.total), t.faltan ? el("small", { class: "missing" }, t.faltan + " concepto(s) sin dato") : null),
          t.sinHospedaje ? el("span", { class: "badge warn" }, "Falta precio de hospedaje en estas fechas") :
          el("span", { class: "badge " + level(t.total) }, t.total <= PRESUPUESTO ? "Cabe en $6,000" : t.total <= TOPE ? "Cabe en $8,000" : "Arriba de $8,000")));
    }));
  }

  function currentResort() { return D.resorts.find((r) => r.slug === state.r) || D.resorts[0]; }

  function renderLodgings() {
    const r = currentResort();
    if (!r) return;
    if (state.r == null) state.r = r.slug;
    if (state.l == null) state.l = defaultLodging(r, state.v);
    $("#hospedaje-hint").textContent = `Opciones en ${r.nombre} para las fechas elegidas. Elige una para ver el presupuesto completo.`;
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
          l.nina_gratis ? el("span", { class: "badge ok" }, "Niña gratis") : null,
          l.cocina ? el("span", { class: "badge" }, "Cocina") : null,
          l.tipo ? el("span", { class: "badge" }, l.tipo) : null),
        el("p", { class: "meta" }, [l.recamaras, l.distancia_escuela ? "Escuela infantil: " + l.distancia_escuela : null].filter(Boolean).join(" · ")),
        el("div", { class: "price" }, money(p.total), " ", el("small", {}, "6 noches", p.noche ? ` · ${money(p.noche)}/noche` : ""), " ", conf(p.conf)),
        p.nota ? el("p", { class: "meta" }, p.nota) : null,
        el("details", {}, el("summary", {}, "Pros, contras y detalles"),
          l.detalle_acceso ? el("p", {}, l.detalle_acceso) : null,
          (l.pros || []).length ? el("ul", {}, l.pros.map((x) => el("li", {}, "👍 " + x))) : null,
          (l.contras || []).length ? el("ul", {}, l.contras.map((x) => el("li", {}, "👎 " + x))) : null,
          l.ideal_si ? el("p", {}, el("strong", {}, "Ideal si: "), l.ideal_si) : null,
          (l.amenidades || []).length ? el("p", { class: "meta" }, l.amenidades.join(" · ")) : null,
          p.src ? el("p", { class: "meta" }, "Fuente del precio: ", el("a", { href: p.src, target: "_blank", rel: "noopener" }, "ver")) : null),
        el("div", { class: "row" },
          el("button", { type: "button", class: "btn", onclick: () => { state.l = i; render(); $("#combo").scrollIntoView(); } }, state.l === i ? "Elegido ✓" : "Elegir"),
          l.link ? el("a", { class: "btn ghost", href: l.link, target: "_blank", rel: "noopener" }, "Sitio oficial") : null,
          l.galeria ? el("a", { class: "btn ghost", href: l.galeria, target: "_blank", rel: "noopener" }, "Fotos") : null));
    }));
  }

  function renderCombo() {
    const r = currentResort();
    if (!r) return;
    const w = VENTANAS.find((x) => x.id === state.v);
    const l = (r.alojamientos || [])[state.l] || {};
    $("#combo-title").textContent = `${r.nombre} · ${l.nombre || "—"} · ${w.titulo} 2027`;
    document.querySelectorAll("[data-food]").forEach((b) => b.classList.toggle("on", b.dataset.food === state.f));
    const its = items(r, state.l, state.v, state.f);
    const total = sum(its);
    $("#combo-table").replaceChildren(
      ...its.map((i) => el("tr", {},
        el("td", {}, i.label, i.note ? el("span", { class: "note" }, i.note) : null),
        el("td", {}, i.amount == null ? el("span", { class: "missing" }, "sin dato") : [money(i.amount), " ", conf(i.conf), i.src ? [" ", el("a", { href: i.src, target: "_blank", rel: "noopener", title: "Fuente" }, "↗")] : null]))),
      el("tr", { class: "sum" }, el("td", {}, "Total estimado"), el("td", {}, money(total))));
    const pct = Math.min(100, (total / 10000) * 100);
    const lv = level(total);
    const color = { ok: "var(--ok)", warn: "var(--warn)", bad: "var(--bad)" }[lv];
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

  // ---------- cuadro comparativo ----------
  const cmp = { sort: "total", dir: 1, soloSki: false, soloPres: false, soloGratis: false };
  const corto = (x) => (x || "").split(/[;(]| — /)[0].trim();

  function filasComparativo() {
    const rows = [];
    D.resorts.forEach((r) => (r.alojamientos || []).forEach((l, i) => {
      const t = tripTotal(r, i, state.v, state.f);
      const lp = lodgingPrice(l, state.v);
      rows.push({
        r, l, i, t,
        porFecha: VENTANAS.map((w) => tripTotal(r, i, w.id, state.f)),
        hosp: lp.total, conf: lp.conf,
        ski: l.ski_in_out === "verdadero" ? 2 : l.ski_in_out === "caminando" ? 1 : 0,
        gratis: l.nina_gratis !== false && r.forfaits && r.forfaits.nina_total_usd === 0,
        alt: r.altitud_base_m || 0,
        cb: r.costo_beneficio || 0,
        viaje: balance(r, i).viajando,
        nieve: (nieve(r.slug, state.v) || {}).cm ?? null,
      });
    }));
    return rows;
  }

  function renderComparativo() {
    $("#cmp-ventana").replaceChildren(...VENTANAS.map((w) => el("button", { type: "button", class: state.v === w.id ? "on" : "", onclick: () => { state.v = w.id; render(); } }, "📅 " + w.corto)));
    const f = [["soloSki", "⛷️ Solo ski-in/ski-out"], ["soloGratis", "👧 Niña esquía gratis"], ["soloPres", "💰 Hasta $8,000"]];
    $("#cmp-filtros").replaceChildren(...f.map(([k, txt]) => el("button", { type: "button", class: "filter" + (cmp[k] ? " on" : ""), "aria-pressed": String(cmp[k]), onclick: () => { cmp[k] = !cmp[k]; renderComparativo(); } }, txt)));

    let rows = filasComparativo();
    if (cmp.soloSki) rows = rows.filter((x) => x.ski === 2);
    if (cmp.soloGratis) rows = rows.filter((x) => x.gratis);
    if (cmp.soloPres) rows = rows.filter((x) => !x.t.sinHospedaje && x.t.total <= TOPE);
    const key = { total: (x) => (x.t.sinHospedaje ? 1e9 : x.t.total), hosp: (x) => x.hosp ?? 1e9, ski: (x) => -x.ski, gratis: (x) => (x.gratis ? 0 : 1), alt: (x) => x.alt, cb: (x) => -x.cb, viaje: (x) => x.viaje ?? 1e9, nieve: (x) => -(x.nieve ?? -1), nombre: (x) => x.r.nombre + x.l.nombre }[cmp.sort];
    rows.sort((a, b) => { const ka = key(a), kb = key(b); return (ka > kb ? 1 : ka < kb ? -1 : 0) * cmp.dir; });

    const conPrecio = rows.filter((x) => !x.t.sinHospedaje);
    const minTotal = Math.min(...conPrecio.map((x) => x.t.total));
    const minHosp = Math.min(...rows.map((x) => x.hosp ?? Infinity));
    const minAlt = Math.min(...rows.map((x) => x.alt || Infinity));
    const maxCb = Math.max(...rows.map((x) => x.cb));
    const minViaje = Math.min(...rows.map((x) => x.viaje ?? Infinity));
    const maxNieve = Math.max(...rows.map((x) => x.nieve ?? -1));
    const star = (c) => (c ? " ⭐" : "");

    // podio: las 3 más baratas con ski-in/ski-out real
    const podio = filasComparativo().filter((x) => x.ski === 2 && !x.t.sinHospedaje).sort((a, b) => a.t.total - b.t.total).slice(0, 3);
    $("#cmp-podio").replaceChildren(...podio.map((x, n) => el("button", { type: "button", class: "podio-item", onclick: () => elegir(x) },
      el("span", { class: "medal" }, ["🥇", "🥈", "🥉"][n]),
      el("span", {}, el("strong", {}, x.r.nombre), el("small", {}, corto(x.l.nombre))),
      el("span", { class: "podio-total " + level(x.t.total) }, money(x.t.total)))));

    const th = (k, txt) => el("th", { class: "sortable" + (cmp.sort === k ? " on" : ""), onclick: () => { cmp.dir = cmp.sort === k ? -cmp.dir : 1; cmp.sort = k; renderComparativo(); } }, txt, cmp.sort === k ? (cmp.dir > 0 ? " ▲" : " ▼") : "");
    const head = el("tr", {}, th("nombre", "Opción"), th("total", "💰 Total del viaje"), el("th", {}, "📅 Las 3 fechas"), th("hosp", "🏔️ Hospedaje"), th("ski", "⛷️ Acceso a pista"), th("gratis", "👧 Niña gratis"), el("th", {}, "🏫 Escuela infantil"), el("th", {}, "🛏️ Cuartos / cocina"), th("alt", "📏 Altitud"), th("cb", "✨ Costo-beneficio"), th("viaje", "🕒 Horas viajando"), th("nieve", "❄️ Nieve"), el("th", {}, ""));
    const sel = (x) => state.r === x.r.slug && state.l === x.i;
    const body = rows.map((x) => {
      const pct = x.t.sinHospedaje ? 0 : Math.min(100, (x.t.total / 12000) * 100);
      const color = { ok: "var(--ok)", warn: "var(--warn)", bad: "var(--bad)" }[level(x.t.total)];
      return el("tr", { class: sel(x) ? "sel" : "" },
        el("td", { class: "opt" }, el("strong", {}, x.r.nombre), el("span", {}, corto(x.l.nombre))),
        el("td", { class: "tot" }, x.t.sinHospedaje ? el("span", { class: "missing" }, "sin precio") : [el("div", { class: "tot-n " + level(x.t.total) }, money(x.t.total) + star(x.t.total === minTotal)), el("div", { class: "mini-bar" }, el("i", { style: `width:${pct}%;background:${color}` }))]),
        el("td", { class: "fechas" }, VENTANAS.map((w, n) => el("span", { class: "f " + (x.porFecha[n].sinHospedaje ? "" : level(x.porFecha[n].total)) + (w.id === state.v ? " cur" : ""), title: w.titulo }, x.porFecha[n].sinHospedaje ? "—" : "$" + (x.porFecha[n].total / 1000).toFixed(1) + "k"))),
        el("td", { class: "n" }, money(x.hosp), " ", conf(x.conf), star(x.hosp === minHosp)),
        el("td", {}, ["🔴 Shuttle", "🟡 Caminando", "🟢 Ski-in/ski-out"][x.ski]),
        el("td", {}, x.gratis ? "✅ Sí" : "— Paga"),
        el("td", { class: "txt" }, el("div", { class: "clamp" }, corto(x.l.distancia_escuela) || "—")),
        el("td", { class: "txt" }, el("div", { class: "clamp" }, [corto(x.l.recamaras), x.l.cocina ? "con cocina" : "sin cocina"].filter(Boolean).join(" · "))),
        el("td", { class: "n" }, x.alt ? x.alt.toLocaleString("es-MX") + " m" + star(x.alt === minAlt) : "—"),
        el("td", { class: "n" }, x.cb + "/10" + star(x.cb === maxCb)),
        el("td", { class: "n" }, fmtH(x.viaje) + star(x.viaje != null && x.viaje === minViaje)),
        el("td", { class: "n" }, x.nieve == null ? "—" : `❄️ ${x.nieve} cm` + star(x.nieve === maxNieve)),
        el("td", {}, el("button", { type: "button", class: "btn sm", onclick: () => elegir(x) }, sel(x) ? "✓" : "Elegir")));
    });
    $("#cmp").replaceChildren(el("thead", {}, head), el("tbody", {}, body.length ? body : [el("tr", {}, el("td", { colspan: 13, class: "muted" }, "Ninguna opción cumple esos filtros."))]));
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
    const it = (M.itinerarios || {})[slug];
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
    return { v, diario, minEscuela, esqui, viajando, pistas, noche: v && v.it.noche_denver };
  }

  let mapa = null, capa = null, mapaSlug = null;
  const COLOR_RESORT = { keystone: "#e0703a", breckenridge: "#7a4fd0", steamboat: "#2e8b57", snowmass: "#1d5fa8" };
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
      el("button", { type: "button", class: todos ? "on" : "", onclick: () => { mapaSlug = "todos"; renderMapa(); } }, "🌎 Todos"),
      ...D.resorts.map((r) => el("button", { type: "button", class: mapaSlug === r.slug ? "on" : "", onclick: () => { mapaSlug = r.slug; renderMapa(); } }, el("span", { class: "sw", style: `background:${COLOR_RESORT[r.slug]}` }), r.nombre)));
    const v = todos ? null : viaje(mapaSlug);
    const r = D.resorts.find((x) => x.slug === mapaSlug);

    const pasos = (ids) => (ids || []).map((id) => tramo(id)).filter(Boolean).map((x) =>
      el("li", {}, el("span", { class: "modo" }, ICONO_MODO[x.modo] || "•"),
        el("span", { class: "desc" }, x.de === x.a || x.modo === "espera" ? "Espera en " + ((punto(x.de) || {}).nombre || x.de) : ((punto(x.de) || {}).nombre || x.de) + " → " + ((punto(x.a) || {}).nombre || x.a), x.nota ? el("small", {}, x.nota) : null),
        el("span", { class: "h" }, fmtH(x.horas), " ", conf(x.confianza))));

    if (todos) {
      $("#mapa-ruta").replaceChildren(
        el("h4", { style: "margin-top:0" }, "🌎 Los 4 destinos de un vistazo"),
        el("p", { class: "meta" }, "Toca un destino para ver su ruta paso a paso."),
        ...D.resorts.map((rr) => {
          const vv = viaje(rr.slug); const b = balance(rr, defaultLodging(rr, state.v));
          return el("button", { type: "button", class: "dest-row", onclick: () => { mapaSlug = rr.slug; renderMapa(); } },
            el("span", { class: "sw big", style: `background:${COLOR_RESORT[rr.slug]}` }),
            el("span", { class: "dest-name" }, el("strong", {}, rr.nombre), el("small", {}, (() => { const id = (M.itinerarios[rr.slug] || {}).ruta; const ru = (V.rutas || []).find((q) => q.id === id); return ru ? (ru.aerolinea || "") + " · " + (ru.descripcion || id).split("(")[0].trim() : id || ""; })())),
            el("span", { class: "dest-n" }, el("small", {}, "🛫 ida"), fmtH(vv && vv.ida)),
            el("span", { class: "dest-n" }, el("small", {}, "🛬 regreso"), fmtH(vv && vv.regreso)),
            el("span", { class: "dest-n" }, el("small", {}, "⛷️ pista"), fmtH(b.esqui)));
        }));
    } else {
      const pist = (M.horario_pistas || {})[mapaSlug] || {};
      const esc = (M.horario_escuela || {})[mapaSlug] || {};
      $("#mapa-ruta").replaceChildren(
        v ? el("div", { class: "ruta-tot" }, el("div", {}, el("small", {}, "Ida, puerta a puerta"), el("strong", {}, fmtH(v.ida))), el("div", {}, el("small", {}, "Regreso"), el("strong", {}, fmtH(v.regreso)))) : el("p", { class: "muted" }, "Sin itinerario."),
        v ? (() => { const b = balance(r, state.r === r.slug && state.l != null ? state.l : defaultLodging(r, state.v)); return el("div", { class: "ruta-tot" },
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
    const usados = new Set();
    slugs.forEach((s) => { const vv = viaje(s); if (vv) [...vv.it.ida, ...vv.it.regreso].forEach((id) => { const x = tramo(id); if (x) { usados.add(x.de); usados.add(x.a); } }); });
    const visibles = (M.puntos || []).filter((p) => p.lat != null && p.lng != null && (p.resort ? slugs.includes(p.resort) : usados.has(p.id)));
    slugs.forEach((s) => { const vv = viaje(s); if (vv) dibujarRuta(vv.it.ida, todos ? COLOR_RESORT[s] : "#e0703a", capa); });
    visibles.forEach((p) => {
      const rad = p.tipo === "hospedaje" ? 6 : p.tipo === "escuela" ? 7 : 9;
      const fill = todos && p.resort ? COLOR_RESORT[p.resort] : COLOR_TIPO[p.tipo] || "#555";
      const rn = p.resort ? (D.resorts.find((x) => x.slug === p.resort) || {}).nombre : "";
      const m = L.circleMarker([p.lat, p.lng], { radius: rad, color: "#fff", weight: 2, fillColor: fill, fillOpacity: 1 })
        .bindPopup(`<strong>${p.nombre}</strong><br>${rn ? rn + " · " : ""}${p.tipo}${p.precision === "aproximada" ? " · ubicación aproximada" : ""}`).addTo(capa);
      if (p.tipo === "resort" || (p.tipo !== "hospedaje" && p.tipo !== "escuela" && !p.resort)) m.bindTooltip((p.nombre || "").split(" (")[0].split(" – ")[0], { permanent: todos || p.tipo === "resort", direction: "right", className: "map-label" });
    });
    const pts = visibles.map((p) => [p.lat, p.lng]);
    if (pts.length) mapa.fitBounds(pts, { padding: [30, 30] });
    const co = visibles.filter((p) => p.lat > 36.5 && p.lng < -104).map((p) => [p.lat, p.lng]);
    if (!mapa._zoomCO) {
      mapa._zoomCO = L.control({ position: "topright" });
      mapa._zoomCO.onAdd = () => { const d = L.DomUtil.create("div", "map-btns"); d.innerHTML = '<button type="button" data-z="co">🏔️ Colorado</button><button type="button" data-z="all">🌎 Todo el viaje</button>'; L.DomEvent.disableClickPropagation(d); d.addEventListener("click", (e) => { const z = e.target.dataset.z; if (z === "co" && mapa._co.length) mapa.fitBounds(mapa._co, { padding: [30, 30] }); if (z === "all" && mapa._all.length) mapa.fitBounds(mapa._all, { padding: [30, 30] }); }); return d; };
      mapa._zoomCO.addTo(mapa);
    }
    mapa._co = co; mapa._all = pts;
    setTimeout(() => mapa.invalidateSize(), 50);
  }

  function renderBalance() {
    if (!M.puntos || !M.puntos.length) return;
    const rows = [];
    D.resorts.forEach((r) => (r.alojamientos || []).forEach((l, i) => rows.push({ r, l, i, b: balance(r, i) })));
    rows.sort((a, b) => ((b.b.esqui || 0) / (b.b.viajando || 1e9)) - ((a.b.esqui || 0) / (a.b.viajando || 1e9)));
    const head = el("tr", {}, el("th", {}, "Opción"), el("th", {}, "🛫 Ida"), el("th", {}, "🛬 Regreso"), el("th", {}, "🚶 Hotel ↔ escuela (5 días)"), el("th", {}, "🕒 Total viajando"), el("th", {}, "⛷️ Horas de pista (5 días)"), el("th", {}, "📊 Nieve por hora de viaje"), el("th", {}, ""));
    $("#balance").replaceChildren(el("thead", {}, head), el("tbody", {}, rows.map((x) => {
      const ratio = x.b.esqui && x.b.viajando ? x.b.esqui / x.b.viajando : null;
      return el("tr", { class: state.r === x.r.slug && state.l === x.i ? "sel" : "" },
        el("td", { class: "opt" }, el("strong", {}, x.r.nombre), el("span", {}, corto(x.l.nombre))),
        el("td", { class: "n" }, fmtH(x.b.v && x.b.v.ida)),
        el("td", { class: "n" }, fmtH(x.b.v && x.b.v.regreso)),
        el("td", { class: "n" }, x.b.minEscuela == null ? "—" : `${x.b.minEscuela} min × 2 × 5 = ${fmtH(x.b.diario)}`),
        el("td", { class: "n" }, el("strong", {}, fmtH(x.b.viajando))),
        el("td", { class: "n" }, fmtH(x.b.esqui)),
        el("td", { class: "n" }, ratio ? el("span", { class: "tot-n " + (ratio >= 1.4 ? "ok" : ratio >= 1.1 ? "warn" : "bad") }, ratio.toFixed(1) + " h") : "—"),
        el("td", {}, el("button", { type: "button", class: "btn sm", onclick: () => { mapaSlug = x.r.slug; elegir(x); } }, "Elegir")));
    })));
    $("#balance-nota").textContent = `Cuenta: ${DIAS_ESQUI} días de esquí con las telesillas abiertas todo el día; "viajando" suma la ida, el regreso y las vueltas diarias del hospedaje a la escuela de la niña. Ordenado de más a menos nieve por cada hora de viaje.`;
  }

  // ---------- nieve estimada ----------
  const N = D.nieve || {};
  const nieve = (slug, v) => ((N.resorts || {})[slug] || {})[v] || null;
  const PROB = { alta: "Muy probable que esté bien", media: "Probable", baja: "Incierto" };

  function renderNieve() {
    if (!N.resorts) return;
    $("#nieve").hidden = false;
    let max = 0;
    D.resorts.forEach((r) => VENTANAS.forEach((w) => { const n = nieve(r.slug, w.id); if (n) max = Math.max(max, n.alto || n.cm || 0); }));
    max = Math.max(max, 50);
    $("#nieve-chart").replaceChildren(...D.resorts.map((r) => el("div", { class: "nv-row" },
      el("div", { class: "nv-name" }, r.nombre),
      el("div", { class: "nv-bars" }, VENTANAS.map((w) => {
        const n = nieve(r.slug, w.id);
        if (!n) return el("div", { class: "nv-bar" }, "—");
        const h = (n.cm / max) * 100, lo = ((n.bajo ?? n.cm) / max) * 100, hi = ((n.alto ?? n.cm) / max) * 100;
        return el("div", { class: "nv-bar" + (w.id === state.v ? " cur" : ""), title: `${w.titulo}: ${n.cm} cm (rango ${n.bajo}–${n.alto} cm). ${n.nota || ""}` },
          el("div", { class: "nv-track" },
            el("div", { class: "nv-range", style: `left:${lo}%;width:${Math.max(1, hi - lo)}%` }),
            el("div", { class: "nv-fill " + (n.prob_buena || "media"), style: `width:${h}%` })),
          el("div", { class: "nv-lbl" }, el("strong", {}, `❄️ ${n.cm} cm`), el("span", {}, ` ${w.corto} · ${n.bajo}–${n.alto} cm`)));
      })))));
    $("#nieve-nota").textContent = (N.metodo || "") + (N.enso ? " " + N.enso : "") + " La barra es el estimado central; la franja clara, el rango entre un año seco y uno bueno.";
  }

  let galSlug = null;
  const MAX_FOTOS = 10;
  function renderGallery() {
    galSlug = galSlug || state.r || (D.resorts[0] && D.resorts[0].slug);
    $("#gal-tabs").replaceChildren(...D.resorts.map((r) => el("button", { type: "button", class: galSlug === r.slug ? "on" : "", onclick: () => { galSlug = r.slug; renderGallery(); } }, r.nombre)));
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
        const img = el("img", { src: f.url_imagen, alt: f.descripcion || "", loading: "lazy", referrerpolicy: "no-referrer" });
        const fig = el("figure", { hidden: true }, el("a", { class: "photo", href: link, target: "_blank", rel: "noopener" }, img),
          el("figcaption", {}, f.descripcion || "", f.credito ? el("span", { class: "note" }, " · " + f.credito) : null));
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
    let id = D.lista_id || ls.get(KID) || null;
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
        Nube.id() ? el("button", { type: "button", onclick: async () => { try { await navigator.clipboard.writeText(liga); alert("Liga copiada. Mándasela a Ana y guárdenla en favoritos."); } catch (e) { prompt("Copia esta liga para Ana:", liga); } } }, "📲 Copiar liga para Ana") : null),
      ...list.map((t) => {
        const id = (t.de || "g") + ":" + (t.texto || t).slice(0, 60);
        const cb = el("input", { type: "checkbox" });
        cb.checked = !!done[id];
        cb.addEventListener("change", () => Nube.push(id, cb.checked));
        return el("label", { class: cb.checked ? "hecho" : "" }, cb, el("span", { class: "ico" }, t.icono || "📌"), el("span", {}, t.texto || t, t.de ? el("span", { class: "src" }, " · " + t.de) : null, t.fecha ? el("strong", {}, " · " + t.fecha) : null));
      }));
  }

  function renderLinks() {
    const ls = [el("a", { class: "btn ghost", href: REPO + "/reports/" + encodeURIComponent("Esquí familiar Colorado y alternativas.md"), target: "_blank", rel: "noopener" }, "📖 Reporte completo de la investigación")];
    D.resorts.forEach((r) => ls.push(el("a", { class: "btn ghost", href: REPO + "/book/" + r.slug + "/ficha.md", target: "_blank", rel: "noopener" }, "🏔️ Ficha de " + r.nombre)));
    ls.push(el("a", { class: "btn ghost", href: REPO + "/book/vuelos.md", target: "_blank", rel: "noopener" }, "✈️ Vuelos y traslados"));
    if (D.generado) ls.push(el("p", { class: "muted" }, "🕒 Precios actualizados el " + new Date(D.generado + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })));
    $("#links").replaceChildren(...ls);
  }

  function renderTabs() {
    const check = state.tab === "checklist";
    $("#vista-decidir").hidden = check;
    $("#vista-checklist").hidden = !check;
    $("#fab").hidden = check;
    document.querySelector(".hero .steps").hidden = check;
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
  Nube.onChange(() => { renderTodo(); writeHash(); });
  Nube.pull();
  window.addEventListener("focus", () => Nube.pull());
  setInterval(() => { if (document.visibilityState === "visible") Nube.pull(); }, 30000);
  if (!D.resorts.length) {
    $("#destinos .hint").textContent = "Estamos terminando de juntar los precios por fecha. Vuelve en un rato.";
  }
  render();
})();
