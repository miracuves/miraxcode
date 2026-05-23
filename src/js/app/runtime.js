document.documentElement.dataset.theme = "dark";
  (function prepareLogoFont() {
    var root = document.documentElement;
    var markReady = function () { root.classList.add("logo-font-ready"); };
    if (!document.fonts || !document.fonts.load) {
      markReady();
      return;
    }
    document.fonts.load('1em "Great Vibes"').then(markReady, markReady);
  })();
  window.MiraXcodeRuntime = {
    getHost: function () {
      var raw = "";
      var inp = document.getElementById("host");
      if (inp && inp.value) raw = String(inp.value);
      if (!raw) {
        try {
          var saved = JSON.parse(localStorage.getItem("atelier") || "{}");
          if (saved && saved.host) raw = String(saved.host);
        } catch {}
      }
      raw = raw.trim().replace(/\/$/, "");
      if (!raw) raw = "http://localhost:11434";
      if (!/^https?:\/\//i.test(raw)) raw = "http://" + raw;
      return /^https?:\/\//i.test(raw) ? raw : "http://localhost:11434";
    },
    makeSignal: function (ms) {
      if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
      var ctrl = new AbortController();
      setTimeout(function () { ctrl.abort(); }, ms);
      return ctrl.signal;
    },
    fmtGB: function (bytes) {
      if (!bytes) return "0 GB";
      var gb = bytes / 1073741824;
      return gb.toFixed(gb < 10 ? 1 : 0) + " GB";
    },
    readOllamaStatus: async function (host, timeoutMs) {
      host = host || this.getHost();
      var t0 = performance.now();
      var tagsRes = await fetch(host + "/api/tags", { cache: "no-store", signal: this.makeSignal(timeoutMs || 3000) });
      var pingMs = Math.round(performance.now() - t0);
      if (!tagsRes.ok) throw new Error("HTTP " + tagsRes.status);
      var tags = await tagsRes.json().catch(function () { return {}; });
      var models = Array.isArray(tags.models) ? tags.models : [];
      var loaded = [];
      try {
        var psRes = await fetch(host + "/api/ps", { cache: "no-store", signal: this.makeSignal(timeoutMs || 3000) });
        if (psRes.ok) {
          var ps = await psRes.json();
          loaded = Array.isArray(ps.models) ? ps.models : Array.isArray(ps.processes) ? ps.processes : Array.isArray(ps) ? ps : [];
        }
      } catch {}
      var totalLoadedBytes = loaded.reduce(function (sum, m) { return sum + (Number(m.size) || 0); }, 0);
      return { host: host, pingMs: pingMs, models: models, modelCount: models.length, loaded: loaded, totalLoadedBytes: totalLoadedBytes };
    }
  };
