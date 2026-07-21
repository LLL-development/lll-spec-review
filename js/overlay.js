// ============================================================
// lll-spec-review — js/overlay.js
// Injected into every uploaded doc, runs INSIDE the sandboxed
// iframe, talks to the viewer only via postMessage.
//
// Two anchor kinds:
//   element : a clicked element (selector + text snippet + rx/ry)
//   range   : a highlighted text range (quote + prefix/suffix for
//             re-finding after edits)
//
// iframe → viewer:  {ns:'lllsr', t:'ready'|'place'|'open'}
// viewer → iframe:  {ns:'lllsr-host', t:'state'|'focus'|'diffmarks'}
// ============================================================
(function () {
  if (window.__lllsrLoaded) return;
  window.__lllsrLoaded = true;

  var pins = [];
  var mode = "browse";
  var layer = document.createElement("div");
  layer.id = "lllsr-layer";
  layer.style.cssText =
    "position:absolute;left:0;top:0;width:100%;pointer-events:none;z-index:2147483000;";
  var hlLayer = document.createElement("div");
  hlLayer.id = "lllsr-hl";
  hlLayer.style.cssText =
    "position:absolute;left:0;top:0;width:100%;pointer-events:none;z-index:2147482999;";

  function post(m) { m.ns = "lllsr"; parent.postMessage(m, "*"); }
  function docHeight() {
    return Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
  }

  var mounted = false;
  function mount() {
    if (mounted || !document.body) return;
    mounted = true;
    document.body.appendChild(hlLayer);
    document.body.appendChild(layer);
    sizeLayers();
    post({ t: "ready" });
  }
  function sizeLayers() { layer.style.height = hlLayer.style.height = docHeight() + "px"; }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();

  function cssPath(el) {
    if (el && el.id) {
      try { if (document.querySelectorAll("#" + CSS.escape(el.id)).length === 1) return "#" + CSS.escape(el.id); }
      catch (e) {}
    }
    var path = [];
    while (el && el.nodeType === 1) {
      var tag = el.tagName.toLowerCase();
      if (tag === "body" || tag === "html") break;
      var p = el.parentNode; if (!p) break;
      var seg = tag, sibs = Array.prototype.filter.call(p.children, function (c) { return c.tagName === el.tagName; });
      if (sibs.length > 1) seg += ":nth-of-type(" + (sibs.indexOf(el) + 1) + ")";
      path.unshift(seg); el = p;
    }
    return "body > " + path.join(" > ");
  }
  function snippet(el) { return (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80); }

  function resolveEl(anchor) {
    if (!anchor) return null;
    if (anchor.selector) {
      try { var el = document.querySelector(anchor.selector); if (el) return el; } catch (e) {}
    }
    if (anchor.text && anchor.text.length >= 4) {
      var best = null, bestLen = Infinity, all = document.body.getElementsByTagName("*");
      for (var i = 0; i < all.length; i++) {
        var cand = all[i];
        if (layer.contains(cand) || hlLayer.contains(cand)) continue;
        var t = (cand.textContent || "").replace(/\s+/g, " ");
        if (t.indexOf(anchor.text) !== -1 && t.length < bestLen) { best = cand; bestLen = t.length; }
      }
      return best;
    }
    return null;
  }

  function textNodes() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (layer.contains(n.parentNode) || hlLayer.contains(n.parentNode)) return NodeFilter.FILTER_REJECT;
        var tn = n.parentNode.tagName;
        if (tn === "SCRIPT" || tn === "STYLE") return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [], full = "", n;
    while ((n = walker.nextNode())) { nodes.push({ node: n, start: full.length }); full += n.nodeValue; }
    return { nodes: nodes, full: full };
  }
  function rangeAt(charStart, charEnd, tn) {
    var nodes = tn.nodes, s = null, e = null;
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i].node, ns = nodes[i].start, ne = ns + node.nodeValue.length;
      if (s === null && charStart >= ns && charStart <= ne) s = { node: node, off: charStart - ns };
      if (charEnd >= ns && charEnd <= ne) { e = { node: node, off: charEnd - ns }; break; }
    }
    if (!s || !e) return null;
    var r = document.createRange();
    try { r.setStart(s.node, s.off); r.setEnd(e.node, e.off); return r; } catch (x) { return null; }
  }
  function resolveRange(anchor) {
    if (!anchor || anchor.kind !== "range" || !anchor.quote) return null;
    var tn = textNodes(), full = tn.full.replace(/\s+/g, " "), q = anchor.quote;
    var idx = -1, from = 0;
    while (true) {
      var hit = full.indexOf(q, from);
      if (hit === -1) break;
      var pre = full.slice(Math.max(0, hit - 20), hit);
      var suf = full.slice(hit + q.length, hit + q.length + 20);
      var pOk = !anchor.prefix || pre.slice(-Math.min(20, anchor.prefix.length)) === anchor.prefix.slice(-Math.min(20, anchor.prefix.length));
      var sOk = !anchor.suffix || suf.slice(0, Math.min(20, anchor.suffix.length)) === anchor.suffix.slice(0, Math.min(20, anchor.suffix.length));
      if (pOk && sOk) { idx = hit; break; }
      if (idx === -1) idx = hit;
      from = hit + 1;
    }
    if (idx === -1) return null;
    // map normalized offset back onto raw text (approx: raw≈normalized for our purposes)
    return rangeAt(idx, idx + q.length, textNodes());
  }

  document.addEventListener("mouseup", function () {
    if (mode !== "comment") return;
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return;
    var quote = sel.toString().replace(/\s+/g, " ").trim();
    if (quote.length < 2) return;
    var full = textNodes().full.replace(/\s+/g, " ");
    var at = full.indexOf(quote);
    var anchor = {
      kind: "range", quote: quote,
      prefix: at > 0 ? full.slice(Math.max(0, at - 20), at) : "",
      suffix: at >= 0 ? full.slice(at + quote.length, at + quote.length + 20) : "",
      selector: cssPath((sel.anchorNode && sel.anchorNode.parentNode) || document.body),
    };
    sel.removeAllRanges();
    post({ t: "place", anchor: anchor });
  });

  document.addEventListener("click", function (e) {
    if (mode !== "comment") return;
    if (layer.contains(e.target) || hlLayer.contains(e.target)) return;
    if (window.getSelection && !window.getSelection().isCollapsed) return;
    e.preventDefault(); e.stopPropagation();
    var el = e.target, r = el.getBoundingClientRect();
    post({
      t: "place",
      anchor: {
        kind: "element", selector: cssPath(el), text: snippet(el),
        rx: r.width ? +((e.clientX - r.left) / r.width).toFixed(4) : 0.5,
        ry: r.height ? +((e.clientY - r.top) / r.height).toFixed(4) : 0.5,
      },
    });
  }, true);

  function anchorPoint(p) {
    if (p.anchor && p.anchor.kind === "range") {
      var r = resolveRange(p.anchor);
      if (r) { var rect = r.getBoundingClientRect(); return { x: rect.left + window.scrollX, y: rect.top + window.scrollY, range: r }; }
    }
    var el = resolveEl(p.anchor);
    if (!el) return null;
    var b = el.getBoundingClientRect();
    var rx = (p.anchor && p.anchor.rx != null) ? p.anchor.rx : 0.5;
    var ry = (p.anchor && p.anchor.ry != null) ? p.anchor.ry : 0.5;
    return { x: b.left + window.scrollX + rx * b.width, y: b.top + window.scrollY + ry * b.height, el: el };
  }

  function drawRangeMarks(range, color) {
    var rects = range.getClientRects();
    for (var i = 0; i < rects.length; i++) {
      var rc = rects[i], m = document.createElement("div");
      m.style.cssText =
        "position:absolute;pointer-events:none;border-radius:2px;background:" + color + ";mix-blend-mode:multiply;" +
        "left:" + (rc.left + window.scrollX) + "px;top:" + (rc.top + window.scrollY) + "px;" +
        "width:" + rc.width + "px;height:" + rc.height + "px;";
      hlLayer.appendChild(m);
    }
  }

  function render() {
    if (!mounted) return;
    layer.innerHTML = ""; hlLayer.innerHTML = "";
    sizeLayers();
    pins.forEach(function (p) {
      var pt = anchorPoint(p);
      if (!pt) return;
      if (pt.range) drawRangeMarks(pt.range, p.resolved ? "rgba(154,151,140,.28)" : "rgba(178,58,42,.20)");
      var b = document.createElement("button");
      b.textContent = p.draft ? "+" : p.n;
      b.style.cssText =
        "position:absolute;pointer-events:auto;transform:translate(-50%,-100%);" +
        "width:28px;height:28px;border-radius:50% 50% 50% 4px;border:2px solid #fff;cursor:pointer;" +
        "font:700 12px/1 sans-serif;color:#fff;padding:0;box-shadow:0 1px 5px rgba(0,0,0,.35);" +
        "background:" + (p.draft ? "#23486B" : p.resolved ? "#9a978c" : "#B23A2A") + ";" +
        "left:" + pt.x + "px;top:" + pt.y + "px;z-index:2147483001;";
      b.addEventListener("click", function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        if (!p.draft) post({ t: "open", id: p.id });
      });
      layer.appendChild(b);
      if (p.focus) { p.focus = false; scrollToPoint(pt); }
    });
  }

  function scrollToPoint(pt) {
    var target = pt.y - window.innerHeight * 0.35;
    try { window.scrollTo({ top: Math.max(0, target), behavior: "smooth" }); }
    catch (e) { window.scrollTo(0, Math.max(0, target)); }
    if (pt.el) flash(pt.el);
    else if (pt.range) flashRect(pt.range.getBoundingClientRect());
  }
  function flash(el) {
    var o = el.style.outline, oo = el.style.outlineOffset;
    el.style.outline = "2px solid #B23A2A"; el.style.outlineOffset = "2px";
    setTimeout(function () { el.style.outline = o; el.style.outlineOffset = oo; }, 1600);
  }
  function flashRect(rc) {
    var f = document.createElement("div");
    f.style.cssText = "position:absolute;pointer-events:none;z-index:2147483002;border:2px solid #B23A2A;border-radius:3px;transition:opacity .3s;" +
      "left:" + (rc.left + window.scrollX - 2) + "px;top:" + (rc.top + window.scrollY - 2) + "px;width:" + (rc.width + 4) + "px;height:" + (rc.height + 4) + "px;";
    layer.appendChild(f);
    setTimeout(function () { f.style.opacity = "0"; }, 1200);
    setTimeout(function () { f.remove(); }, 1600);
  }

  var raf = null;
  function schedule() { if (raf) return; raf = requestAnimationFrame(function () { raf = null; render(); }); }
  window.addEventListener("resize", schedule);
  var ticks = 0, iv = setInterval(function () { schedule(); if (++ticks > 10) clearInterval(iv); }, 500);

  window.addEventListener("message", function (e) {
    var m = e.data || {};
    if (m.ns !== "lllsr-host") return;
    if (m.t === "state") {
      mode = m.mode || "browse"; pins = m.pins || [];
      document.documentElement.style.cursor = mode === "comment" ? "crosshair" : "";
      schedule();
    }
    if (m.t === "focus") {
      var found = false;
      pins.forEach(function (p) { if (p.id === m.id) { p.focus = true; found = true; } });
      schedule();
      if (!found && m.anchor) {
        setTimeout(function () { var pt = anchorPoint({ anchor: m.anchor }); if (pt) scrollToPoint(pt); }, 60);
      }
    }
    if (m.t === "diffmarks") {
      schedule();
      setTimeout(function () {
        var tn = textNodes();
        (m.marks || []).forEach(function (mk) {
          var r = rangeAt(mk.start, mk.end, tn);
          if (r) drawRangeMarks(r, mk.type === "add" ? "rgba(84,130,53,.30)" : "rgba(178,58,42,.28)");
        });
        if (m.marks && m.marks.length) {
          var first = rangeAt(m.marks[0].start, m.marks[0].end, tn);
          if (first) scrollToPoint({ x: 0, y: first.getBoundingClientRect().top + window.scrollY, range: first });
        }
      }, 100);
    }
  });
})();
