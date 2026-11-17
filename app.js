(function () {
  "use strict";
  var CFG = window.SNOW_CONFIG, $ = function (id) { return document.getElementById(id); };
  var COL = { c: "#1e88ff", s: "#f2b600", p: "#e5392f" };
  var NAME = { c: "everything you want cleared", s: "where you want salt", p: "where the snow can be piled" };
  var BRUSH_FT = 7, FT = 3.28084;
  var kind = "c", type = "home", moving = false;
  var shapes = [], preset = [], place = null, clientName = "";

  // ---------- map ----------
  var map = L.map("map", { zoomControl: true, maxZoom: 21, doubleClickZoom: false }).setView([CFG.start.lat, CFG.start.lng], CFG.start.zoom);
  if (CFG.mapboxToken) {
    L.tileLayer("https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=" + CFG.mapboxToken, {
      maxZoom: 21, maxNativeZoom: 20, tileSize: 256, attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © Maxar'
    }).addTo(map);
  } else {
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 21, maxNativeZoom: 19, attribution: "Imagery © Esri, Maxar, Earthstar Geographics"
    }).addTo(map);
  }
  // Newer public imagery for the Twin Cities metro: spring 2025 1-foot everywhere,
  // with the sharper Hennepin 2022 6-inch on top, kept away from the county edge where it has gaps.
  var WMS = "https://imageserver.gisdata.mn.gov/cgi-bin/wms?";
  L.tileLayer.wms(WMS, { layers: "met25", format: "image/jpeg", version: "1.1.1", maxZoom: 21, minZoom: 15,
    bounds: [[44.47, -94.02], [45.42, -92.73]], attribution: "Imagery: MnGeo, Metropolitan Council, Hennepin County" }).addTo(map);
  L.tileLayer.wms(WMS, { layers: "hen22", format: "image/jpeg", version: "1.1.1", maxZoom: 21, minZoom: 15,
    bounds: [[44.80, -93.74], [45.23, -93.225]] }).addTo(map);
  var layer = L.layerGroup().addTo(map), pin = null;

  // ---------- geometry ----------
  // Painted area = union of everything of one kind, measured by drawing it on a hidden canvas (so overlaps count once).
  function rectPts(a, b) { return [[a[0], a[1]], [a[0], b[1]], [b[0], b[1]], [b[0], a[1]]]; }
  function sum(t) {
    var list = shapes.filter(function (s) { return s.t === t; }); if (!list.length) return 0;
    var lat0 = list[0].p[0][0], R = 6378137, k = Math.PI / 180, cos = Math.cos(lat0 * k);
    function xy(p) { return [R * p[1] * k * cos * FT, -R * p[0] * k * FT]; }
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    list.forEach(function (s) { s.p.forEach(function (p) { var q = xy(p); minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]); minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]); }); });
    var pad = BRUSH_FT, w = maxX - minX + pad * 2, h = maxY - minY + pad * 2, sc = Math.min(2, 1400 / Math.max(w, h));
    var c = document.createElement("canvas"); c.width = Math.max(1, Math.ceil(w * sc)); c.height = Math.max(1, Math.ceil(h * sc));
    var g = c.getContext("2d"); g.lineCap = "round"; g.lineJoin = "round"; g.fillStyle = g.strokeStyle = "#000";
    function pt(p) { var q = xy(p); return [(q[0] - minX + pad) * sc, (q[1] - minY + pad) * sc]; }
    list.forEach(function (s) {
      var pts = (s.k === "r" ? rectPts(s.p[0], s.p[1]) : s.p).map(pt);
      g.beginPath(); pts.forEach(function (q, i) { if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); });
      if (s.k === "r" || s.k === "p") { g.closePath(); g.fill(); }
      else { g.lineWidth = (s.k === "b" ? BRUSH_FT : CFG.sidewalkFt) * sc; if (pts.length === 1) g.lineTo(pts[0][0] + 0.01, pts[0][1]); g.stroke(); }
    });
    var d = g.getImageData(0, 0, c.width, c.height).data, nPx = 0;
    for (var i = 3; i < d.length; i += 4) if (d[i] > 127) nPx++;
    return nPx / (sc * sc);
  }

  // ---------- painting ----------
  function ftToPx(ft) { var c = map.getCenter(); return ft / FT / (40075016.686 * Math.cos(c.lat * Math.PI / 180) / Math.pow(2, map.getZoom() + 8)); }
  function toLayer(s) {
    var o = { color: COL[s.t], weight: 3, fillColor: COL[s.t], fillOpacity: 0.45, interactive: false };
    if (s.k === "b") return L.polyline(s.p.length > 1 ? s.p : [s.p[0], s.p[0]], Object.assign({}, o, { weight: Math.max(6, ftToPx(BRUSH_FT)), opacity: 0.6, lineCap: "round", lineJoin: "round" }));
    if (s.k === "l") return L.polyline(s.p, Object.assign({}, o, { weight: Math.max(6, ftToPx(CFG.sidewalkFt)), opacity: 0.6 }));
    if (s.k === "r") return L.polygon(rectPts(s.p[0], s.p[1]), o);
    return L.polygon(s.p, o);
  }
  var live = null, liveLayer = null, pointers = 0;
  function render() { layer.clearLayers(); shapes.forEach(function (s) { toLayer(s).addTo(layer); }); }
  function canPaint() { return !moving && map.getZoom() >= 17; }
  function baseHint() {
    if (map.getZoom() < 17) return "Type your address above to see your property.";
    return moving ? "Move the map with your finger. Press Paint when you are ready." : "Paint with your finger (or mouse) over " + NAME[kind] + ".";
  }
  function setHint(t, cls) { $("hint").textContent = t || baseHint(); $("hint").className = "hint" + (cls ? " " + cls : ""); }
  function syncMode() {
    if (canPaint()) map.dragging.disable(); else map.dragging.enable();
    $("map").style.cursor = canPaint() ? "crosshair" : "grab";
    $("move").setAttribute("aria-pressed", moving); $("move").textContent = moving ? "Paint" : "Move map";
    setHint();
  }
  function evLatLng(e) { var ll = map.mouseEventToLatLng(e); return [+ll.lat.toFixed(6), +ll.lng.toFixed(6)]; }
  var el = $("map");
  el.addEventListener("pointerdown", function (e) {
    if (e.target.closest(".leaflet-control")) return;
    pointers++;
    if (pointers > 1) { if (liveLayer) { liveLayer.remove(); liveLayer = null; } live = null; return; }   // second finger: let the map zoom
    if (!canPaint() || (e.pointerType === "mouse" && e.button !== 0)) return;
    live = { t: kind, k: "b", p: [evLatLng(e)] }; liveLayer = toLayer(live).addTo(map);
  });
  el.addEventListener("pointermove", function (e) {
    if (!live) return;
    var p = evLatLng(e), last = live.p[live.p.length - 1];
    if (map.distance(last, p) * FT < 2) return;
    live.p.push(p); liveLayer.setLatLngs(live.p);
  });
  function endStroke() {
    pointers = Math.max(0, pointers - 1);
    if (!live) return;
    if (liveLayer) { liveLayer.remove(); liveLayer = null; }
    shapes.push(live); live = null; render(); stats();
    setHint(kind === "c" ? "Nice. Keep painting, or pick Salt or Pile snow." : "", "");
  }
  window.addEventListener("pointerup", endStroke); window.addEventListener("pointercancel", endStroke);
  map.on("zoomend", function () { render(); syncMode(); });

  function press(sel, attr, val) {
    document.querySelectorAll(sel).forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute(attr) === val); });
  }
  document.querySelectorAll("[data-kind]").forEach(function (b) { b.onclick = function () { kind = b.dataset.kind; moving = false; press("[data-kind]", "data-kind", kind); syncMode(); }; });
  document.querySelectorAll("[data-type]").forEach(function (b) { b.onclick = function () { type = b.dataset.type; press("[data-type]", "data-type", type); stats(); }; });
  $("move").onclick = function () { moving = !moving; syncMode(); };
  $("undo").onclick = function () { shapes.pop(); render(); stats(); };
  $("erase").onclick = function () { shapes = []; render(); stats(); };
  $("suggest").onclick = function () { shapes = JSON.parse(JSON.stringify(preset)); render(); stats(); };

  // ---------- pricing ----------
  function quote() {
    var a = sum("c"); if (a <= 0) return null;
    var tiers = CFG.pricing[type];
    for (var i = 0; i < tiers.length; i++) if (a <= tiers[i].max) return tiers[i];
    return { plan: type === "home" ? "Large property" : "Large lot", custom: true };
  }
  function n(x) { return Math.round(x).toLocaleString("en-US"); }
  function usd(x) { return "$" + n(x); }
  function stats() {
    var a = sum("c"), s = sum("s"), q = quote();
    $("aC").textContent = n(a) + " sq ft"; $("aS").textContent = s > 0 ? n(s) + " sq ft" : "none";
    $("pSalt").textContent = s > 0 ? usd(CFG.saltPerApplication) + " per application" : "not selected";
    if (!q) { $("planName").textContent = "Seasonal plan (Nov 15 – Apr 15)"; $("pSeason").textContent = "—"; $("pMonth").textContent = "—"; $("pVisit").textContent = "—"; }
    else if (q.custom) { $("planName").textContent = q.plan; $("pSeason").textContent = "Custom"; $("pMonth").textContent = "we will email you"; $("pVisit").textContent = "—"; }
    else { $("planName").textContent = q.plan + " · season"; $("pSeason").textContent = usd(q.season); $("pMonth").textContent = usd(q.month) + " / month"; $("pVisit").textContent = usd(q.visit); }
  }

  // ---------- address search ----------
  function geocode(q) {
    if (CFG.mapboxToken) {
      return fetch("https://api.mapbox.com/geocoding/v5/mapbox.places/" + encodeURIComponent(q) + ".json?country=us&limit=1&proximity=-93.265,44.9778&access_token=" + CFG.mapboxToken)
        .then(function (r) { return r.json(); })
        .then(function (j) { var f = j.features && j.features[0]; return f ? { lat: f.center[1], lng: f.center[0], label: f.place_name } : null; });
    }
    return fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=" + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (j) { return j[0] ? { lat: +j[0].lat, lng: +j[0].lon, label: j[0].display_name } : null; });
  }
  function showPlace(p) {
    place = p; map.setView([p.lat, p.lng], 20);
    if (pin) pin.remove();
    pin = L.circleMarker([p.lat, p.lng], { radius: 5, color: "#fff", fillColor: "#0b3d73", fillOpacity: 1, weight: 2 }).addTo(map);
  }
  $("searchForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var q = $("address").value.trim(), m = $("searchMsg");
    if (!q) { m.textContent = "Type the property address first."; m.className = "hint err"; return; }
    m.textContent = "Finding your property…"; m.className = "hint"; $("go").disabled = true;
    geocode(q).then(function (p) {
      $("go").disabled = false;
      if (!p) { m.textContent = "We could not find that address. Add the city and state, or zoom the map to your property."; m.className = "hint err"; return; }
      showPlace(p); m.textContent = "Found it. Now paint over what you need cleared."; m.className = "hint ok";
    }).catch(function () {
      $("go").disabled = false; m.textContent = "Address search is not responding. Zoom the map to your property, or text us at " + CFG.phone + "."; m.className = "hint err";
    });
  });

  // ---------- share link (also used for quotes we prepare for a client) ----------
  // Brush strokes are stored as a start point plus small integer steps (millionths of a degree) to keep links short.
  function packShape(s) {
    if (s.k !== "b") return [s.t, s.k].concat(s.p.reduce(function (a, p) { return a.concat(p); }, []));
    var o = [s.t, "b", s.p[0][0], s.p[0][1]];
    for (var i = 1; i < s.p.length; i++) o.push(Math.round((s.p[i][0] - s.p[i - 1][0]) * 1e6), Math.round((s.p[i][1] - s.p[i - 1][1]) * 1e6));
    return o;
  }
  function unpackShape(a) {
    var p = [], i;
    if (a[1] === "b") {
      p.push([a[2], a[3]]);
      for (i = 4; i + 1 < a.length; i += 2) { var l = p[p.length - 1]; p.push([+(l[0] + a[i] / 1e6).toFixed(6), +(l[1] + a[i + 1] / 1e6).toFixed(6)]); }
    } else for (i = 2; i + 1 < a.length; i += 2) p.push([a[i], a[i + 1]]);
    return { t: a[0], k: a[1], p: p };
  }
  function encode() {
    var c = map.getCenter();
    var d = { v: 2, a: $("address").value.trim(), n: clientName, t: type, c: [+c.lat.toFixed(6), +c.lng.toFixed(6), map.getZoom()], s: shapes.map(packShape) };
    return btoa(unescape(encodeURIComponent(JSON.stringify(d)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decode(str) {
    try {
      var d = JSON.parse(decodeURIComponent(escape(atob(str.replace(/-/g, "+").replace(/_/g, "/")))));
      var sh = (d.s || []).filter(function (a) { return Array.isArray(a) && a.length >= 4 && COL[a[0]]; }).map(unpackShape);
      return { a: d.a || "", name: d.n || "", t: d.t === "business" ? "business" : "home", c: d.c, s: sh };
    } catch (e) { return null; }
  }
  function linkFor() { return location.origin + location.pathname + "?q=" + encode(); }

  var qs = new URLSearchParams(location.search).get("q");
  if (qs) {
    var d = decode(qs);
    if (d && d.c) {
      type = d.t; clientName = d.name; press("[data-type]", "data-type", type);
      $("address").value = d.a; map.setView([d.c[0], d.c[1]], d.c[2] || 19);
      shapes = d.s; preset = JSON.parse(JSON.stringify(d.s));
      if (d.s.length) {
        $("title").textContent = "Your snow removal plan" + (d.name ? " for " + d.name : "");
        $("lead").textContent = "We already marked our best guess on your property. If it looks right, just send it. To change it, paint over the photo.";
        window.__presetHint = "Blue = we clear it. Yellow = salt. Red = snow pile. Paint to add more, or press Erase all to start over.";
        $("suggest").hidden = false; $("searchPanel").hidden = true; $("how").hidden = true;
      }
    }
  }

  // ---------- send ----------
  function summary() {
    var q = quote();
    return {
      "Address": $("address").value.trim() || (place && place.label) || "(not typed)",
      "Name": $("who").value.trim() || "-",
      "Email": $("email").value.trim() || "-",
      "Phone": $("phone").value.trim() || "-",
      "Property type": type,
      "Area to clear": n(sum("c")) + " sq ft",
      "Salt": sum("s") > 0 ? "yes, " + n(sum("s")) + " sq ft" : "no",
      "Snow pile spot": shapes.some(function (s) { return s.t === "p"; }) ? "marked" : "not marked",
      "Estimate shown": !q ? "nothing drawn" : q.custom ? q.plan + " (custom quote)" : q.plan + ": " + usd(q.season) + " season / " + usd(q.month) + " month / " + usd(q.visit) + " visit",
      "Map": linkFor()
    };
  }
  $("send").onclick = function () {
    var m = $("sendMsg"), em = $("email").value.trim(), ph = $("phone").value.trim();
    if (!$("address").value.trim() && !shapes.length) { m.textContent = "Type your address first."; m.className = "hint err"; $("address").focus(); return; }
    if (!em && !ph) { m.textContent = "Add your email or your phone so we can send your quote."; m.className = "hint err"; $("email").focus(); return; }
    var data = summary(), body = Object.assign({ _subject: "Snow quote request: " + data.Address, _template: "table", _captcha: "false" }, data);
    $("send").disabled = true; m.textContent = "Sending…"; m.className = "hint";
    fetch("https://formsubmit.co/ajax/" + CFG.email, { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (r) {
        $("send").disabled = false;
        if (!r.ok || String(r.j.success) !== "true") throw new Error((r.j && r.j.message) || "rejected");
        m.textContent = "Sent! We will reply the same day with your written quote."; m.className = "hint ok"; $("out").hidden = true;
      })
      .catch(function (err) {
        $("send").disabled = false;
        if (window.console) console.warn("Quote request not sent:", err && err.message);
        $("out").title = (err && err.message) || "";
        var t = Object.keys(data).map(function (k) { return k + ": " + data[k]; }).join("\n");
        $("out").value = "MN Snow Removal quote request\n" + t; $("out").hidden = false;
        m.textContent = "We could not send it automatically. Copy the text below and email it to " + CFG.email + " or text it to " + CFG.phone + "."; m.className = "hint err";
      });
  };

  // expose for building client links from the console
  window.snowQuote = { link: linkFor, setName: function (name) { clientName = String(name || ""); return linkFor(); } };
  render(); stats(); syncMode();
  if (window.__presetHint) setHint(window.__presetHint);
})();
