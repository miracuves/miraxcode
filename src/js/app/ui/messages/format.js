/** Chat message markdown formatting (Wave 18). */

export function createMessagesFormatApi(deps) {
  const { escapeHtml, msgs } = deps;

  function safeMarkdownHref(raw) {
    const s = String(raw || "").trim();
    if (!s) return null;
    try {
      const u = new URL(s);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      if (u.username !== "" || u.password !== "") return null;
      return u.href;
    } catch {
      return null;
    }
  }

  function extractMarkedLinkArgs(args) {
    const first = args[0];
    if (first && typeof first === "object" && !Array.isArray(first)) {
      const label = first.tokens?.map(t => t.raw || t.text || "").join("") || first.text || first.href || "";
      return { href: first.href || "", title: first.title || "", text: label };
    }
    return {
      href: first || "",
      title: args[1] || "",
      text: args[2] || first || "",
    };
  }

  function extractMarkedCodeArgs(args) {
    const first = args[0];
    if (first && typeof first === "object" && !Array.isArray(first)) {
      return { text: first.text || "", lang: first.lang || "" };
    }
    return { text: first || "", lang: args[1] || "" };
  }

  function decodeHtmlEntities(s) {
    let t = String(s || "");
    if (!t) return "";
    t = t.replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const c = parseInt(hex, 16);
      return Number.isFinite(c) && c >= 0 && c <= 0x10ffff ? String.fromCodePoint(c) : _;
    });
    t = t.replace(/&#(\d+);/g, (_, dec) => {
      const c = parseInt(dec, 10);
      return Number.isFinite(c) && c >= 0 && c <= 0x10ffff ? String.fromCodePoint(c) : _;
    });
    t = t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'");
    t = t.replace(/&amp;/g, "&");
    return t;
  }

  const markdownRenderer = (() => {
    if (typeof window === "undefined" || !window.marked?.Renderer) return null;
    const renderer = new window.marked.Renderer();
    renderer.link = function(...args) {
      const { href, title, text } = extractMarkedLinkArgs(args);
      const resolved = safeMarkdownHref(href);
      const label = escapeHtml(text || href || "");
      if (!resolved) {
        return `<span class="md-link-blocked" title="Only http(s) links are allowed">${label}</span>`;
      }
      const safeHref = escapeHtml(resolved);
      const safeTitle = title ? ` title="${escapeHtml(title)}"` : "";
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer"${safeTitle}>${escapeHtml(text || href || "")}</a>`;
    };
    renderer.code = function(...args) {
      const { text, lang } = extractMarkedCodeArgs(args);
      const src = decodeHtmlEntities(text).replace(/\n$/, "");
      const label = (lang || "").trim().split(/\s+/)[0];
      if (label.toLowerCase() === "mermaid") {
        return `<div class="mermaid-wrap"><div class="mermaid">${escapeHtml(src)}</div></div>`;
      }
      let html = escapeHtml(src);
      if (window.hljs) {
        try {
          html = label && window.hljs.getLanguage(label)
            ? window.hljs.highlight(src, { language: label, ignoreIllegals: true }).value
            : window.hljs.highlightAuto(src).value;
        } catch {}
      }
      const langBadge = label ? `<span class="code-lang">${escapeHtml(label)}</span>` : "";
      return `<div class="code-block">${langBadge}<button class="copy-btn" data-action="copy-code">Copy</button><pre><code class="hljs${label ? ` language-${escapeHtml(label)}` : ""}">${html}</code></pre></div>`;
    };
    return renderer;
  })();

  function fallbackFormatContent(text) {
    return escapeHtml(text).replace(/\n/g, "<br>");
  }

  function formatContent(text) {
    if (typeof window === "undefined" || !window.marked || !markdownRenderer) return fallbackFormatContent(text);
    const safe = String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    try {
      const raw = `<div class="markdown-body">${window.marked.parse(safe, {
        gfm: true,
        breaks: true,
        silent: true,
        renderer: markdownRenderer,
      })}</div>`;
      if (window.DOMPurify) {
        return window.DOMPurify.sanitize(raw, {
          ADD_ATTR: ["target", "rel", "data-action", "data-processed", "data-language"],
          FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form", "input", "meta", "link", "base"],
          FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur", "onkeydown", "onkeyup", "onsubmit", "action", "formaction"],
        });
      }
      return raw;
    } catch {
      return fallbackFormatContent(text);
    }
  }

  const _htmlCache = new WeakMap();

  function cachedFormatContent(message, displayContent, isStreaming) {
    if (isStreaming) return formatContent(displayContent);
    if (!_htmlCache.has(message)) _htmlCache.set(message, formatContent(displayContent));
    return _htmlCache.get(message);
  }

  function renderMermaidDiagrams() {
    if (typeof window === "undefined" || !window.mermaid || !msgs) return;
    try {
      window.mermaid.run({ nodes: msgs.querySelectorAll(".mermaid:not([data-processed='true'])") });
    } catch (err) {
      console.warn("[mermaid] render failed:", err);
    }
  }

  function wireCopyCodeButtons() {
    if (!msgs || msgs.dataset.formatCopyWired) return;
    msgs.dataset.formatCopyWired = "1";
    msgs.addEventListener("click", (e) => {
      const btn = e.target.closest('[data-action="copy-code"]');
      if (!btn) return;
      const codeEl = btn.parentElement.querySelector("pre code");
      if (!codeEl) return;
      const text = codeEl.textContent;
      const done = () => {
        const old = btn.textContent;
        btn.textContent = "Copied";
        btn.classList.add("copied");
        setTimeout(() => { btn.textContent = old || "Copy"; btn.classList.remove("copied"); }, 1400);
      };
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => {
          const ta = document.createElement("textarea");
          ta.value = text; document.body.appendChild(ta);
          ta.select(); try { document.execCommand("copy"); done(); } catch {}
          document.body.removeChild(ta);
        });
      } else {
        const ta = document.createElement("textarea");
        ta.value = text; document.body.appendChild(ta);
        ta.select(); try { document.execCommand("copy"); done(); } catch {}
        document.body.removeChild(ta);
      }
    });
  }

  return {
    formatContent,
    cachedFormatContent,
    renderMermaidDiagrams,
    wireCopyCodeButtons,
  };
}
