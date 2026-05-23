/**
 * NVIDIA NIM streaming chat completions (SSE).
 */

/**
 * @param {object} deps
 */
export function createNvidiaStreamApi(deps) {
  const { cloudFetch, cloudRecord, nvidiaKeyEl, nvidiaModelEl } = deps;

  async function nvidiaStreamChat({ messages, model, temperature, onToken, signal }) {
    const key = (nvidiaKeyEl.value || '').trim();
    if (!key) throw new Error('Missing NVIDIA API key');
    const res = await cloudFetch('nvidia', 'https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      referrerPolicy: 'no-referrer',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: typeof temperature === 'number' ? temperature : 0.7,
        stream: true,
      }),
      signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`NVIDIA HTTP ${res.status}: ${txt.slice(0, 200)}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    const parseNvidiaLine = (line) => {
      const s = line.trim();
      if (!s.startsWith('data:')) return;
      const payload = s.slice(5).trim();
      if (!payload || payload === '[DONE]') return;
      try {
        const evt = JSON.parse(payload);
        const delta = evt.choices?.[0]?.delta?.content;
        if (delta) onToken(delta);
      } catch {}
    };
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) parseNvidiaLine(line);
    }
    parseNvidiaLine(buf);
    cloudRecord('nvidia', { model });
  }

  return { nvidiaStreamChat };
}
