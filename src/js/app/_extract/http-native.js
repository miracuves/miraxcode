async function nativeHttpRequest(url, init = {}) {
  const method = (init.method || "GET").toUpperCase();
  const hdr = headersToObject(init.headers);
  const body = typeof init.body === "string" ? init.body : init.body ? JSON.stringify(init.body) : null;
  const result = await HC.invoke("provider_http_request", {
    url,
    method,
    headers: hdr,
    body,
    timeoutMs: 120_000,
  });
  return {
    ok: !!result.ok,
    status: result.status || 0,
    headers: { get: (name) => null },
    text: async () => result.body || result.body_preview || "",
    json: async () => JSON.parse(result.body || "{}"),
  };
}

/** Native SSE/streaming fetch — WebView fetch often fails with "Load failed" for cloud APIs. */
async function nativeHttpStream(url, init = {}) {
  const ChannelCtor = typeof Channel !== "undefined" ? Channel : window.__TAURI__?.core?.Channel;
  if (!ChannelCtor || !HC?.invoke) {
    throw new Error("Native streaming requires the MiraXcode desktop app (Tauri).");
  }
  const method = (init.method || "POST").toUpperCase();
  const hdr = headersToObject(init.headers);
  const body = typeof init.body === "string" ? init.body : init.body ? JSON.stringify(init.body) : null;

  const pending = [];
  let settled = false;
  let httpStatus = 0;
  let httpOk = false;
  let errorText = "";

  const channel = new ChannelCtor();
  channel.onmessage = (chunk) => {
    pending.push(chunk);
    if (chunk.kind === "error") {
      httpStatus = chunk.status || 500;
      httpOk = false;
      errorText = chunk.data || "";
      settled = true;
    } else if (chunk.kind === "done") {
      httpStatus = chunk.status || httpStatus || 200;
      httpOk = httpStatus >= 200 && httpStatus < 300;
      settled = true;
    }
  };

  if (init.signal) {
    init.signal.addEventListener("abort", () => {
      settled = true;
      httpOk = false;
      errorText = "Aborted";
    }, { once: true });
  }

  const invokeP = HC.invoke("provider_http_stream", {
    url,
    method,
    headers: hdr,
    body,
    timeoutMs: 120_000,
    onChunk: channel,
  });

  const bodyStream = new ReadableStream({
    async pull(controller) {
      if (init.signal?.aborted) {
        controller.close();
        return;
      }
      while (pending.length === 0 && !settled) {
        if (init.signal?.aborted) {
          controller.close();
          return;
        }
        await new Promise((r) => setTimeout(r, 8));
      }
      if (pending.length === 0 && settled) {
        controller.close();
        return;
      }
      const chunk = pending.shift();
      if (!chunk) {
        if (settled) controller.close();
        return;
      }
      if (chunk.kind === "error") {
        controller.error(new Error(errorText || chunk.data || `HTTP ${chunk.status || 500}`));
        return;
      }
      if (chunk.kind === "data" && chunk.data) {
        controller.enqueue(new TextEncoder().encode(chunk.data));
      }
    },
  });

  let result;
  try {
    result = await invokeP;
  } catch (invokeErr) {
    const msg = invokeErr?.message || String(invokeErr);
    return {
      ok: false,
      status: 500,
      headers: { get: () => null },
      body: null,
      text: async () => msg,
    };
  }
  while (!settled) await new Promise((r) => setTimeout(r, 8));
  httpStatus = result?.status || httpStatus;
  httpOk = result?.ok ?? httpOk;

  if (!httpOk) {
    const txt = errorText || result?.error || result?.body_preview || result?.body || "";
    return {
      ok: false,
      status: httpStatus,
      headers: { get: () => null },
      body: null,
      text: async () => txt,
    };
  }

  return {
    ok: true,
    status: httpStatus,
    headers: { get: () => null },
    body: bodyStream,
    text: async () => {
      const reader = bodyStream.getReader();
      const dec = new TextDecoder();
      let out = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        out += dec.decode(value, { stream: true });
      }
      return out;
    },
  };
}
