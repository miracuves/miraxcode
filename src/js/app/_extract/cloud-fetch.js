async function cloudFetch(provider, url, init) {
  if (HC?.providerUsage?.waitForCapacity) {
    await HC.providerUsage.waitForCapacity(provider);
  }
  const method = (init?.method || "GET").toUpperCase();
  const bodyStr = typeof init?.body === "string" ? init.body : "";
  const accept = (init?.headers?.Accept || init?.headers?.accept || "");
  const isStream =
    accept.includes("event-stream") ||
    (bodyStr.includes("stream") && /"stream"\s*:\s*true/.test(bodyStr));
  if (HC?.isTauri && HC?.invoke) {
    const res = isStream
      ? await nativeHttpStream(url, init)
      : await nativeHttpRequest(url, init);
    HC?.providerUsage?.handleResponse?.(provider, res);
    return res;
  }
  if (HC?.providerUsage?.fetchCloud) return HC.providerUsage.fetchCloud(provider, url, init);
  return fetch(url, init);
}
function cloudRecord(provider, meta) {
  HC?.providerUsage?.recordRequest?.(provider, meta);
  updateCloudUsageChip();
}
function getProviderKey(providerId) {
  const map = {
    groq: groqKeyEl, gemini: geminiKeyEl, openrouter: openRouterKeyEl,
    cerebras: cerebrasKeyEl, samba: sambaKeyEl, openai: openaiKeyEl,
    anthropic: anthropicKeyEl, moonshot: moonshotKeyEl, deepseek: deepseekKeyEl,
    mistral: mistralKeyEl, minimax: minimaxKeyEl, glm: glmKeyEl, nvidia: nvidiaKeyEl,
  };
  const el = map[providerId];
  return (el?.value || "").trim();
}
const cloudUsageChipEl = $("cloudUsageChip");
function updateCloudUsageChip() {
  if (!cloudUsageChipEl || !HC?.providerUsage) return;
  const parsed = parseCloudModel(modelEl?.value || "");
  if (!parsed) {
    cloudUsageChipEl.classList.remove("visible");
    cloudUsageChipEl.textContent = "";
    return;
  }
  const summary = HC.providerUsage.getSummary(parsed.provider);
  if (!summary) {
    cloudUsageChipEl.classList.remove("visible");
    return;
  }
  cloudUsageChipEl.textContent = summary;
  cloudUsageChipEl.classList.add("visible");
  cloudUsageChipEl.title = `${parsed.provider} usage — open Settings → APIs for details`;
  if (HC.providerUsage.isRateLimited(parsed.provider)) {
    cloudUsageChipEl.classList.add("limited");
  } else {
    cloudUsageChipEl.classList.remove("limited");
  }
}
