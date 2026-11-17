(function () {
  "use strict";
  var CFG = window.SNOW_CONFIG, $ = function (id) { return document.getElementById(id); };
  var COL = { c: "#1e88ff", s: "#f2b600", p: "#e5392f" };
  var kind = "c", shape = "l", type = "home";
  var shapes = [], draft = [], preset = [], place = null, clientName = "";
  var HINT = {
    l: "Tap the start and the end of a sidewalk, then press Finish.",
    r: "Tap one corner of the area, then the opposite corner.",
    p: "Tap each corner of the area, then press Finish."
  };

  // ---------- map ----------
  var map = L.map("map", { zoomControl: true, maxZoom: 21, doubleClickZoom: false }).setView([CFG.start.lat, CFG.start.lng], CFG.start.zoom);
  if (CFG.mapboxToken) {
    L.tileLayer("https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=" + CFG.mapboxToken, {
      maxZoom: 21, maxNativeZoom: 20, tileSize: 256,
      attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © Maxar'
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
  var layer = L.layerGroup().addTo(map), draftLayer = L.layerGroup().addTo(map), pin = null;

  // ---------- geometry ----------
  var FT = 3.28084;
  function polyAreaSqFt(pts) {
    if (pts.length < 3) return 0;
    var R = 6378137, lat0 = pts[0][0] * Math.PI / 180, a = 0, xy = pts.map(function (p) {
      return [R * (p[1] * Math.PI / 180) * Math.cos(lat0), R * (p[0] * Math.PI / 180)];
    });
    for (var i = 0; i < xy.length; i++) { var q = xy[i], n = xy[(i + 1) % xy.length]; a += q[0] * n[1] - n[0] * q[1]; }
    return Math.abs(a) / 2 * FT * FT;
  }
  function lineFt(pts) {
    var d = 0; for (var i = 1; i < pts.length; i++) d += map.distance(pts[i - 1], pts[i]);
    return d * FT;
  }
  function rectPts(a, b) { return [[a[0], a[1]], [a[0], b[1]], [b[0], b[1]], [b[0], a[1]]]; }
  function area(s) {
    if (s.k === "l") return lineFt(s.p) * CFG.sidewalkFt;
    if (s.k === "r") return polyAreaSqFt(rectPts(s.p[0], s.p[1]));
    return polyAreaSqFt(s.p);
  }
  function sum(t) { return shapes.filter(function (s) { return s.t === t; }).reduce(function (a, s) { return a + area(s); }, 0); }

  // ---------- drawing ----------
  function toLayer(s, opts) {
    var o = Object.assign({ color: COL[s.t], weight: 3, fillColor: COL[s.t], fillOpacity: 0.4 }, opts || {});
    if (s.k === "l") return L.polyline(s.p, Object.assign({}, o, { weight: 9, opacity: 0.85 }));
    if (s.k === "r") return L.polygon(rectPts(s.p[0], s.p[1]), o);
    return L.polygon(s.p, o);
  }
  function render() {
    layer.clearLayers(); draftLayer.clearLayers();
    shapes.forEach(function (s) { toLayer(s).addTo(layer); });
    if (draft.length) {
      if (draft.length > 1) toLayer({ t: kind, k: shape === "p" ? (draft.length > 2 ? "p" : "l") : "l", p: draft }, { dashArray: "6 6", fillOpacity: 0.25 }).addTo(draftLayer);
      draft.forEach(function (p) { L.circleMarker(p, { radius: 6, color: "#fff", fillColor: COL[kind], fillOpacity: 1, weight: 2 }).addTo(draftLayer); });
    }
    $("finish").hidden = !((shape === "l" && draft.length >= 2) || (shape === "p" && draft.length >= 3));
  }
  function commit() {
    if (shape === "l" && draft.length >= 2) shapes.push({ t: kind, k: "l", p: draft });
    else if (shape === "p" && draft.length >= 3) shapes.push({ t: kind, k: "p", p: draft });
    draft = []; $("hint").textContent = HINT[shape]; $("hint").className = "hint"; render(); stats();
  }
  map.on("click", function (e) {
    var p = [+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)];
    if (map.getZoom() < 17) { $("hint").textContent = "Type your address first, or zoom in to your property."; $("hint").className = "hint err"; return; }
    draft.push(p);
    if (shape === "r" && draft.length === 2) { shapes.push({ t: kind, k: "r", p: draft }); draft = []; stats(); }
    else if (shape === "p") $("hint").textContent = draft.length < 3 ? "Tap each corner of the area." : 'Keep tapping corners, then press "Finish shape".';
    else if (shape === "l" && draft.length >= 2) $("hint").textContent = 'Tap more points to follow the sidewalk, or press "Finish shape".';
    $("hint").className = "hint"; render();
  });

  function press(sel, attr, val) {
    document.querySelectorAll(sel).forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute(attr) === val); });
  }
  document.querySelectorAll("[data-kind]").forEach(function (b) { b.onclick = function () { kind = b.dataset.kind; press("[data-kind]", "data-kind", kind); render(); }; });
  document.querySelectorAll("[data-shape]").forEach(function (b) { b.onclick = function () { shape = b.dataset.shape; draft = []; press("[data-shape]", "data-shape", shape); $("hint").textContent = HINT[shape]; $("hint").className = "hint"; render(); }; });
  document.querySelectorAll("[data-type]").forEach(function (b) { b.onclick = function () { type = b.dataset.type; press("[data-type]", "data-type", type); stats(); }; });
  $("finish").onclick = commit;
  $("undo").onclick = function () { if (draft.length) draft.pop(); else shapes.pop(); render(); stats(); };
  $("erase").onclick = function () { shapes = []; draft = []; render(); stats(); };
  $("suggest").onclick = function () { shapes = JSON.parse(JSON.stringify(preset)); draft = []; render(); stats(); };

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
      showPlace(p); m.textContent = "Found it. Now mark what you need cleared."; m.className = "hint ok";
    }).catch(function () {
      $("go").disabled = false; m.textContent = "Address search is not responding. Zoom the map to your property, or text us at " + CFG.phone + "."; m.className = "hint err";
    });
  });

  // ---------- share link (also used for quotes we prepare for a client) ----------
  function encode() {
    var c = map.getCenter();
    var d = { v: 1, a: $("address").value.trim(), n: clientName, t: type, c: [+c.lat.toFixed(6), +c.lng.toFixed(6), map.getZoom()], s: shapes.map(function (s) { return [s.t, s.k].concat(s.p.reduce(function (a, p) { return a.concat(p); }, [])); }) };
    return btoa(unescape(encodeURIComponent(JSON.stringify(d)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decode(str) {
    try {
      var d = JSON.parse(decodeURIComponent(escape(atob(str.replace(/-/g, "+").replace(/_/g, "/")))));
      var sh = (d.s || []).filter(function (a) { return Array.isArray(a) && a.length >= 6; }).map(function (a) {
        var p = []; for (var i = 2; i + 1 < a.length; i += 2) p.push([a[i], a[i + 1]]);
        return { t: a[0], k: a[1], p: p };
      });
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
        $("lead").textContent = "We already marked our best guess on your property. If it looks right, just send it. To change it, draw your own.";
        $("hint").textContent = "Blue = we clear it. Yellow = salt. Red = where the snow gets piled. Add or change anything.";
        $("suggest").hidden = false; $("searchPanel").hidden = true;
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
  render(); stats();
})();
