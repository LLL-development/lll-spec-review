// ============================================================
// lll-spec-review — js/overlay.js
// Injected into every uploaded document just before </body>.
// Runs INSIDE the sandboxed iframe (opaque origin), talks to
// the viewer exclusively via postMessage. It never sees the
// session cookie and can't touch the app.
//
// iframe → viewer:  {ns:'lllsr', t:'ready' | 'place' | 'open'}
// viewer → iframe:  {ns:'lllsr-host', t:'state' | 'focus'}
// ============================================================
(function () {
  if (window.__lllsrLoaded) return;
  window.__lllsrLoaded = true;

  var pins = [];        // [{id, n, resolved, draft, anchor:{selector,text,rx,ry}}]
  var mode = "browse";  // 'browse' | 'comment'
  var layer = document.createElement("div");
  layer.id = "lllsr-layer";
  layer.style.cssText =
    "position:absolute;left:0;top:0;width:100%;pointer-events:none;z-index:2147483000;";

  function post(m) { m.ns = "lllsr"; parent.postMessage(m, "*"); }
  function docHeight() {
    return Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
  }

  var mounted = false;
  function mount() {
    if (mounted || !document.body) return;
    mounted = true;
    document.body.appendChild(layer);
    layer.style.height = docHeight() + "px";
    post({ t: "ready" });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else { mount(); }

  // ---------- anchor generation ----------
  // Prefer a unique #id; otherwise build an nth-of-type path.
  // Works for HTML and SVG elements alike.
  function cssPath(el) {
    if (el.id) {
      try {
        var idSel = "#" + CSS.escape(el.id);
        if (document.querySelectorAll(idSel).length === 1) return idSel;
      } catch (e) {}
    }
    var path = [];
    while (el && el.nodeType === 1) {
      var tag = el.tagName.toLowerCase();
      if (tag === "body" || tag === "html") break;
      var p = el.parentNode;
      if (!p) break;
      var seg = tag;
      var sibs = Array.prototype.filter.call(p.children, function (c) {
        return c.tagName === el.tagName;
      });
      if (sibs.length > 1) seg += ":nth-of-type(" + (sibs.indexOf(el) + 1) + ")";
      path.unshift(seg);
      el = p;
    }
    return "body > " + path.join(" > ");
  }

  function snippet(el) {
    var t = (el.textContent || "").trim().replace(/\s+/g, " ");
    return t.slice(0, 80);
  }

  // ---------- anchor resolution ----------
  // 1) exact selector  2) fallback: smallest element containing
  // the saved text snippet (survives structural edits)
  function resolveEl(anchor) {
    if (!anchor) return null;
    if (anchor.selector) {
      try {
        var el = document.querySelector(anchor.selector);
        if (el) return el;
      } catch (e) {}
    }
    if (anchor.text && anchor.text.length >= 4) {
      var best = null, bestLen = Infinity;
      var all = document.body.getElementsByTagName("*");
      for (var i = 0; i < all.length; i++) {
        var cand = all[i];
        if (layer.contains(cand)) continue;
        var t = (cand.textContent || "").replace(/\s+/g, " ");
        if (t.indexOf(anchor.text) !== -1 && t.length < bestLen) {
          best = cand; bestLen = t.length;
        }
      }
      return best;
    }
    return null;
  }

  // ---------- comment-mode click capture ----------
  // Capture phase + preventDefault so interactive docs (our own
  // mocks!) don't react while placing a pin.
  document.addEventListener("click", function (e) {
    if (mode !== "comment") return;
    if (layer.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    var el = e.target;
    var r = el.getBoundingClientRect();
    post({
      t: "place",
      anchor: {
        selector: cssPath(el),
        text: snippet(el),
        rx: r.width ? +((e.clientX - r.left) / r.width).toFixed(4) : 0.5,
        ry: r.height ? +((e.clientY - r.top) / r.height).toFixed(4) : 0.5,
      },
    });
  }, true);

  // ---------- pin rendering ----------
  function render() {
    if (!mounted) return;
    layer.innerHTML = "";
    layer.style.height = docHeight() + "px";
    pins.forEach(function (p) {
      var el = resolveEl(p.anchor);
      if (!el) return; // unanchored — still visible in the sidebar
      var r = el.getBoundingClientRect();
      var x = r.left + window.scrollX + (p.anchor.rx != null ? p.anchor.rx : 0.5) * r.width;
      var y = r.top + window.scrollY + (p.anchor.ry != null ? p.anchor.ry : 0.5) * r.height;

      var b = document.createElement("button");
      b.textContent = p.draft ? "+" : p.n;
      b.title = p.draft ? "新しいコメント" : "コメント #" + p.n;
      b.style.cssText =
        "position:absolute;pointer-events:auto;transform:translate(-50%,-100%);" +
        "width:28px;height:28px;border-radius:50% 50% 50% 4px;border:2px solid #fff;" +
        "cursor:pointer;font:700 12px/1 sans-serif;color:#fff;" +
        "box-shadow:0 1px 5px rgba(0,0,0,.35);padding:0;" +
        "background:" + (p.draft ? "#23486B" : p.resolved ? "#9a978c" : "#B23A2A") + ";" +
        "left:" + x + "px;top:" + y + "px;z-index:2147483001;";
      b.addEventListener("click", function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        if (!p.draft) post({ t: "open", id: p.id });
      });
      layer.appendChild(b);

      if (p.focus) {
        p.focus = false;
        try { el.scrollIntoView({ block: "center", behavior: "smooth" }); }
        catch (e) { el.scrollIntoView(); }
        flash(el);
      }
    });
  }

  function flash(el) {
    var o = el.style.outline, oo = el.style.outlineOffset;
    el.style.outline = "2px solid #B23A2A";
    el.style.outlineOffset = "2px";
    setTimeout(function () { el.style.outline = o; el.style.outlineOffset = oo; }, 1600);
  }

  var raf = null;
  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(function () { raf = null; render(); });
  }
  window.addEventListener("resize", schedule);
  // Docs with webfonts/lazy layout settle late — re-render a few times
  var ticks = 0;
  var iv = setInterval(function () { schedule(); if (++ticks > 10) clearInterval(iv); }, 500);

  // ---------- messages from the viewer ----------
  window.addEventListener("message", function (e) {
    var m = e.data || {};
    if (m.ns !== "lllsr-host") return;
    if (m.t === "state") {
      mode = m.mode || "browse";
      pins = m.pins || [];
      document.documentElement.style.cursor = mode === "comment" ? "crosshair" : "";
      schedule();
    }
    if (m.t === "focus") {
      pins.forEach(function (p) { if (p.id === m.id) p.focus = true; });
      schedule();
    }
  });
})();
