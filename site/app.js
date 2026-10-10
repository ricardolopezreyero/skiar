(function () {
  "use strict";

  const D = window.SKIAR || { resorts: [], vuelos: {} };
  const V = D.vuelos || {};
  const REPO = "https://github.com/ricardolopezreyero/skiar/blob/" + (D.rama || "main");
  const PRESUPUESTO = 6000;
  const TOPE = 8000;

  const VENTANAS = [
    { id: "A", titulo: "Dom 10 – Sáb 16 enero", nota: "Lo más barato y con menos gente · el más frío" },
    { id: "B", titulo: "Dom 24 – Sáb 30 enero", nota: "Mejor equilibrio entre precio, nieve y poca gente" },
    { id: "C", titulo: "Dom 28 feb – Sáb 6 marzo", nota: "La mejor nieve y días menos fríos · precio medio" },
  ];

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : String(kid));
    return n;
  };
  const money = (n) => (n == null || isNaN(n) ? "—" : "$" + Math.round(n).toLocaleString("en-US"));
  const conf = (c) => el("span", { class: "dot " + (c || "baja"), title: "Confianza: " + (c || "baja / estimado") });
  const num = (x) => (typeof x === "number" && isFinite(x) ? x : null);

  // ---------- estado (se guarda en la URL para compartir) ----------
  const state = { v: "B", r: null, l: null, f: "cocinando" };
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    if (p.get("v")) state.v = p.get("v");
    if (p.get("r")) state.r = p.get("r");
    if (p.get("l") != null) state.l = Number(p.get("l"));
    if (p.get("f")) state.f = p.get("f");
  }
  function writeHash() {
    const p = new URLSearchParams({ v: state.v, r: state.r || "", l: state.l ?? "", f: state.f });
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
    if (r.vuelo) out.push({ label: "Vuelos redondos (3 personas)", amount: r.vuelo.total, conf: r.vuelo.conf, src: r.vuelo.src, note: [r.vuelo.ruta.descripcion, r.vuelo.fechas].filter(Boolean).join(" · ") });
    else out.push({ label: "Vuelos redondos (3 personas)", amount: null, note: "Falta dato" });
    if (r.vuelo && num(r.vuelo.ruta.equipaje_total_usd) != null) out.push({ label: "Equipaje documentado", amount: r.vuelo.ruta.equipaje_total_usd, conf: r.vuelo.ruta.equipaje_confianza || "baja", note: r.vuelo.ruta.equipaje_total_nota });
    if (r.vuelo && /den/i.test(r.vuelo.ruta.id) && num(V.hotel_denver_usd) != null) out.push({ label: "Primera noche en Denver (aclimatación)", amount: V.hotel_denver_usd, conf: "baja", note: V.hotel_denver_nota });
    if (r.desdeMty) {
      const g = num(V.gasolina_casetas_trc_mty_redondo_usd), e = num(V.estacionamiento_mty_usd);
      out.push({ label: "Torreón ↔ Monterrey en carro + estacionamiento", amount: g == null && e == null ? null : (g || 0) + (e || 0), conf: "media", note: "Gasolina, casetas y estacionamiento en el aeropuerto" });
    }
    if (r.tras) out.push({ label: "Traslado aeropuerto ↔ montaña", amount: num(r.tras.total_usd), conf: r.tras.confianza, src: r.tras.fuente, note: r.tras.descripcion });
    const lp = lodgingPrice(l, v);
    out.push({ label: "Hospedaje 6 noches · " + (l.nombre || ""), amount: lp.total, conf: lp.conf, src: lp.src, note: lp.nota });
    const f = resort.forfaits || {};
    out.push({ label: "Forfaits adultos (5 días × 2)", amount: num(f.adultos_total_usd), conf: f.confianza, src: f.fuente, note: f.como_comprar });
    const ninaGratis = l.nina_gratis !== false;
    const nina = ninaGratis ? num(f.nina_total_usd) : num(f.nina_total_sin_programa_usd) ?? num(f.nina_total_usd);
    out.push({ label: "Forfait de la niña", amount: nina, conf: f.confianza, note: nina === 0 ? "Gratis: " + (resort.ninos_gratis || "") : (ninaGratis ? "" : "Este hospedaje no califica para el programa de niños gratis") });
    const e = resort.escuela || {};
    out.push({ label: "Escuela de esquí (5 días) · " + (e.programa || ""), amount: num(e.total_5_dias_usd), conf: e.confianza, src: e.fuente, note: e.incluye });
    out.push({ label: "Renta de equipo (3 personas)", amount: num(resort.renta_equipo_total_usd), conf: "media" });
    const c = resort.comida_total_usd || {};
    const modo = food === "restaurantes" || l.cocina === false ? "restaurantes" : "cocinando";
    out.push({ label: "Comida 6 días (" + (modo === "cocinando" ? "cocinando + algunas salidas" : "restaurantes") + ")", amount: num(c[modo]), conf: "baja", note: l.cocina === false && food === "cocinando" ? "Este hospedaje no tiene cocina" : "" });
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
      el("button", { type: "button", class: "chip" + (state.v === w.id ? " on" : ""), role: "radio", "aria-checked": String(state.v === w.id), onclick: () => { state.v = w.id; state.l = null; render(); } },
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
      return el("button", { type: "button", class: "resort" + (state.r === r.slug ? " on" : ""), onclick: () => { state.r = r.slug; state.l = null; render(); $("#hospedaje").scrollIntoView(); } },
        el("div", { class: "ph", style: ph ? `background-image:url("${ph}")` : null }, el("span", { class: "score" }, "Costo-beneficio " + (r.costo_beneficio ?? "—") + "/10")),
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
      return el("article", { class: "lodging" + (state.l === i ? " on" : "") },
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

  function renderMatrix() {
    const head = el("tr", {}, el("th", {}, "Destino / hospedaje"), ...VENTANAS.map((w) => el("th", {}, w.titulo)));
    const rows = [];
    D.resorts.forEach((r) => {
      rows.push(el("tr", { class: "grp" }, el("td", { colspan: 4 }, r.nombre)));
      (r.alojamientos || []).forEach((l, i) => {
        rows.push(el("tr", {}, el("td", {}, l.nombre, l.ski_in_out === "verdadero" ? " ⛷" : ""),
          ...VENTANAS.map((w) => {
            const t = tripTotal(r, i, w.id, state.f);
            const sel = state.r === r.slug && state.l === i && state.v === w.id;
            const cls = t.sinHospedaje ? "" : level(t.total);
            return el("td", { class: "n " + cls, style: sel ? "outline:2px solid var(--accent)" : null, title: t.sinHospedaje ? "Sin precio de hospedaje para estas fechas" : t.faltan ? t.faltan + " concepto(s) sin dato" : "Elegir esta combinación", onclick: () => { state.r = r.slug; state.l = i; state.v = w.id; render(); $("#combo").scrollIntoView(); } }, t.sinHospedaje ? "sin precio" : money(t.total) + (t.faltan ? "*" : ""));
          })));
      });
    });
    $("#matrix").replaceChildren(el("thead", {}, head), el("tbody", {}, rows));
  }

  let galSlug = null;
  function renderGallery() {
    galSlug = galSlug || state.r || (D.resorts[0] && D.resorts[0].slug);
    $("#gal-tabs").replaceChildren(...D.resorts.map((r) => el("button", { type: "button", class: galSlug === r.slug ? "on" : "", onclick: () => { galSlug = r.slug; renderGallery(); } }, r.nombre)));
    const r = D.resorts.find((x) => x.slug === galSlug);
    if (!r) return;
    const cats = [["ubicacion", "El lugar"], ["pista", "La pista"], ["alojamiento", "Hospedaje"]];
    const kids = [];
    cats.forEach(([c, t]) => {
      const fs = (r.fotos || []).filter((f) => f.categoria === c);
      if (!fs.length) return;
      kids.push(el("div", { class: "gal-cat" }, t));
      fs.forEach((f) => {
        const cap = el("figcaption", {}, [f.opcion, f.descripcion].filter(Boolean).join(" — "), f.credito || f.licencia ? el("span", { class: "note" }, " · " + [f.credito, f.licencia].filter(Boolean).join(", ")) : null);
        const link = f.url_pagina || f.url_imagen;
        if (f.url_imagen) {
          const img = el("img", { src: f.url_imagen, alt: f.descripcion || "", loading: "lazy", referrerpolicy: "no-referrer" });
          img.addEventListener("error", () => img.replaceWith(el("div", { class: "linkonly" }, el("a", { href: link, target: "_blank", rel: "noopener" }, "Ver foto ↗"))));
          kids.push(el("figure", {}, el("a", { href: link, target: "_blank", rel: "noopener" }, img), cap));
        } else if (link) {
          kids.push(el("figure", {}, el("div", { class: "linkonly" }, el("a", { href: link, target: "_blank", rel: "noopener" }, "Ver galería ↗")), cap));
        }
      });
    });
    $("#gallery").replaceChildren(...(kids.length ? kids : [el("p", { class: "muted" }, "Sin fotos todavía.")]));
  }

  function renderTodo() {
    const KEY = "skiar-todo";
    let done = {};
    try { done = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { done = {}; }
    const general = D.pendientes || [];
    const r = currentResort();
    const list = [...general, ...((r && r.verificar) || []).map((t) => ({ texto: t, de: r.nombre }))];
    $("#todo").replaceChildren(...list.map((t, i) => {
      const id = (t.de || "g") + ":" + (t.texto || t).slice(0, 60);
      const cb = el("input", { type: "checkbox" });
      cb.checked = !!done[id];
      cb.addEventListener("change", () => { done[id] = cb.checked; try { localStorage.setItem(KEY, JSON.stringify(done)); } catch (e) { /* sin almacenamiento */ } });
      return el("label", {}, cb, el("span", {}, t.texto || t, t.de ? el("span", { class: "src" }, " · " + t.de) : null, t.fecha ? el("strong", {}, " · " + t.fecha) : null));
    }));
  }

  function renderLinks() {
    const ls = [el("a", { href: REPO + "/reports/" + encodeURIComponent("Esquí familiar Colorado y alternativas.md") }, "Reporte completo de la investigación")];
    D.resorts.forEach((r) => ls.push(" · ", el("a", { href: REPO + "/book/" + r.slug + "/ficha.md" }, "Ficha " + r.nombre)));
    if (D.generado) ls.push(el("br"), "Datos actualizados: " + D.generado);
    $("#links").replaceChildren(...ls);
  }

  function render() {
    if (state.r && !D.resorts.some((r) => r.slug === state.r)) state.r = null;
    renderVentanas();
    renderResorts();
    renderLodgings();
    renderCombo();
    renderMatrix();
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
  if (!D.resorts.length) {
    $("#destinos .hint").textContent = "Estamos terminando de juntar los precios por fecha. Vuelve en un rato.";
  }
  render();
})();
