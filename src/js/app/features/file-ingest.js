/**
 * Image compression, PDF/text file ingestion, and attachment context for prompts.
 */

function readAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

/**
 * @param {{
 *   state: object,
 *   addToRAG: (title: string, text: string, source: string) => void,
 *   renderPending: () => void,
 *   txtInput: HTMLInputElement,
 *   imgInput: HTMLInputElement,
 * }} deps
 */
export function createFileIngestApi(deps) {
  const { state, addToRAG, renderPending, txtInput, imgInput } = deps;

  async function ingestImagesFromList(fileList) {
    const out = [];
    for (const f of fileList) {
      const dataUrl = await compressImage(f, 1280, 0.82);
      const base64 = dataUrl.split(",")[1];
      out.push({ name: f.name, dataUrl, base64 });
    }
    return out;
  }

  async function handleImages(fileList) {
    state.pendingImages.push(...(await ingestImagesFromList(fileList)));
    renderPending();
    imgInput.value = "";
  }

  // Resize + JPEG-compress an image file before sending to the vision model.
  // Full-resolution photos (3–8 MB) cause Ollama to hang; 1280px / 85% is
  // more than enough for OCR and visual Q&A at a fraction of the payload.
  function compressImage(file, maxPx, quality) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width: w, height: h } = img;
        if (w > maxPx || h > maxPx) {
          if (w >= h) { h = Math.round(h * maxPx / w); w = maxPx; }
          else        { w = Math.round(w * maxPx / h); h = maxPx; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); readAsDataURL(file).then(resolve); };
      img.src = url;
    });
  }

  async function waitForPdfJs(timeoutMs = 6000) {
    if (window.pdfjsLib) return window.pdfjsLib;
    const started = Date.now();
    while (!window.pdfjsLib && Date.now() - started < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    if (!window.pdfjsLib) throw new Error("pdf.js did not finish loading");
    return window.pdfjsLib;
  }

  async function extractPdfText(file) {
    const pdfjs = await waitForPdfJs();
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    const chunks = [];
    const maxPages = Math.min(doc.numPages, 120);
    for (let i = 1; i <= maxPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(it => ("str" in it ? it.str : "")).join(" ");
      chunks.push(`--- Page ${i} ---\n${pageText}`);
    }
    const trailing = doc.numPages > maxPages ? `\n\n[… ${doc.numPages - maxPages} more pages truncated …]` : "";
    const text = chunks.join("\n\n").trim();
    if (!text) {
      return {
        text: `[PDF attached: ${file.name} — no selectable text was found. This is probably a scanned/image-only PDF and needs OCR.]`,
        pages: doc.numPages,
        extracted: false,
      };
    }
    return { text: text + trailing, pages: doc.numPages, extracted: true };
  }

  function looksTextLike(file) {
    if (file.type.startsWith("text/")) return true;
    if (/\.(txt|md|markdown|csv|tsv|log|json|yml|yaml|xml|html|css|js|ts|jsx|tsx|py|rb|go|rs|java|c|h|cpp|sh|toml|ini|env)$/i.test(file.name)) return true;
    return false;
  }

  function fileCharLabel(chars) {
    const n = Number(chars) || 0;
    if (!n) return "";
    return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k chars` : `${n} chars`;
  }

  function fileKindIcon(kind) {
    const k = kind || "file";
    if (k === "pdf") {
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/><path d="M8 15h8"/><path d="M8 18h5"/><path d="M8 11h2"/></svg>`;
    }
    if (k === "binary") {
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`;
    }
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/><path d="M8 13h8"/><path d="M8 17h6"/></svg>`;
  }

  function buildAttachedFileContext(files, maxChars = 28000) {
    if (!files?.length) return "";
    const perFileBudget = Math.max(1800, Math.floor(maxChars / files.length));
    const sections = files.map((f, i) => {
      const raw = String(f.text || "").trim() || "[No extracted text available for this attachment.]";
      const clipped = raw.length > perFileBudget;
      const text = clipped
        ? raw.slice(0, perFileBudget) + `\n\n[Attachment truncated for context: ${raw.length - perFileBudget} chars omitted.]`
        : raw;
      const meta = [
        `name: ${f.name || `attachment-${i + 1}`}`,
        `kind: ${f.kind || "file"}`,
        f.pages ? `pages: ${f.pages}` : "",
        `extracted_chars: ${raw.length}`,
        clipped ? `sent_chars: ${perFileBudget}` : "",
      ].filter(Boolean).join(", ");
      return `--- Attachment ${i + 1} (${meta}) ---\n${text}`;
    });
    return [
      "",
      "[ATTACHED FILES - use this content when answering]",
      "The user attached the following file text. Treat it as part of the current user message.",
      sections.join("\n\n"),
      "[END ATTACHED FILES]",
    ].join("\n");
  }

  async function ingestFilesFromList(fileList, { addToRag = true } = {}) {
    const out = [];
    for (const f of fileList) {
      try {
        if (f.type.startsWith("image/")) continue;
        if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
          try {
            const { text, pages, extracted } = await extractPdfText(f);
            const entry = {
              name: f.name, kind: "pdf", pages,
              chars: text.trim().length,
              extracted,
              text: text.slice(0, 400_000),
            };
            out.push(entry);
            if (addToRag) {
              for (let ci = 0; ci < Math.min(text.length, 12000); ci += 1200) {
                addToRAG(f.name, text.slice(ci, ci + 1200), `file:${f.name}:p${Math.floor(ci/1200)}`);
              }
            }
          } catch (err) {
            console.warn("[pdf] extract failed:", err);
            out.push({
              name: f.name, kind: "pdf",
              chars: 0,
              extracted: false,
              text: `[PDF attached: ${f.name} — text extraction failed: ${err.message}]`,
            });
          }
          continue;
        }
        if (looksTextLike(f)) {
          const text = await f.text();
          out.push({
            name: f.name,
            kind: "text",
            chars: text.trim().length,
            extracted: true,
            text: text.slice(0, 200_000),
          });
          if (addToRag) {
            for (let ci = 0; ci < Math.min(text.length, 12000); ci += 1200) {
              addToRAG(f.name, text.slice(ci, ci + 1200), `file:${f.name}:c${Math.floor(ci/1200)}`);
            }
          }
          continue;
        }
        out.push({
          name: f.name, kind: "binary",
          chars: 0,
          extracted: false,
          text: `[Binary file attached: ${f.name} (${Math.round(f.size / 1024)} KB, type ${f.type || "unknown"}) — contents not sent to the model.]`,
        });
      } catch (err) {
        console.warn("[file] failed:", f.name, err);
      }
    }
    return out;
  }

  async function handleFiles(fileList) {
    const imgs = [];
    const docs = [];
    for (const f of fileList) {
      if (f.type.startsWith("image/")) imgs.push(f);
      else docs.push(f);
    }
    if (imgs.length) await handleImages(imgs);
    state.pendingFiles.push(...(await ingestFilesFromList(docs)));
    renderPending();
    txtInput.value = "";
  }

  return {
    ingestImagesFromList,
    handleImages,
    compressImage,
    waitForPdfJs,
    extractPdfText,
    looksTextLike,
    fileCharLabel,
    fileKindIcon,
    buildAttachedFileContext,
    ingestFilesFromList,
    handleFiles,
  };
}
