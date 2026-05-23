/**
 * MCP server scan, tool discovery, settings panel, and agent tool bridge.
 */

export const MCP_PREFS_KEY = 'miraxcode_mcp_prefs';

/** Sanitize MCP tool name for OpenAI-compatible function calling. */
export function mcpSafeToolName(serverName, toolName) {
  return `mcp_${String(serverName).replace(/[^a-z0-9]/gi, '_')}_${String(toolName).replace(/[^a-z0-9]/gi, '_')}`;
}

/**
 * @param {{ escapeHtml: (s: string) => string }} deps
 */
export function createMcpApi(deps) {
  const { escapeHtml } = deps;

  function loadMcpPrefs() {
    try {
      return JSON.parse(localStorage.getItem(MCP_PREFS_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveMcpPrefs(prefs) {
    try {
      localStorage.setItem(MCP_PREFS_KEY, JSON.stringify(prefs));
    } catch {}
  }

  let _mcpServersCache = null;
  let _mcpToolsCache = {};
  let _mcpToolServerMap = {};

  async function scanMcpServers() {
    if (!window.__TAURI__) return [];
    try {
      const result = await window.__TAURI__.core.invoke('mcp_scan_servers');
      if (result.errors?.length) console.warn('[MCP] scan errors:', result.errors);
      _mcpServersCache = result.servers || [];
      return _mcpServersCache;
    } catch (e) {
      console.warn('[MCP] scan failed:', e);
      return [];
    }
  }

  async function discoverMcpTools(serverName, url) {
    if (_mcpToolsCache[serverName]) return _mcpToolsCache[serverName];
    if (!window.__TAURI__) return [];
    try {
      const resp = await window.__TAURI__.core.invoke('mcp_connect_sse', { url });
      const tools = resp?.result?.tools || [];
      _mcpToolsCache[serverName] = tools;
      return tools;
    } catch (e) {
      console.warn(`[MCP] connect ${serverName}:`, e);
      _mcpToolsCache[serverName] = [];
      return [];
    }
  }

  function renderMcpPanel() {
    const panel = document.getElementById('mcpPanel');
    if (!panel) return;
    if (!_mcpServersCache || !_mcpServersCache.length) {
      panel.innerHTML =
        '<div style="font-size:12px;color:var(--muted);padding:8px">No MCP servers found. Install MCP servers in Claude Desktop, Cursor, or VS Code and restart.</div>';
      return;
    }
    const prefs = loadMcpPrefs();
    let html = '';
    _mcpServersCache.forEach((srv) => {
      const enabled = prefs[srv.name] !== false;
      const url = srv.url || '';
      const hasUrl = !!url;
      const statusIcon = hasUrl ? (enabled ? '&#9679;' : '&#9675;') : '&#9675;';
      const statusColor = hasUrl && enabled ? 'var(--hc-accent)' : 'var(--muted)';
      html += `<div style="border:1px solid rgba(239,68,68,0.08);border-radius:6px;padding:8px 10px;margin-bottom:6px;background:rgba(0,0,0,0.15)">`;
      html += `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">`;
      html += `<div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0">`;
      html += `<span style="color:${statusColor};font-size:10px">${statusIcon}</span>`;
      html += `<span style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(srv.name)}</span>`;
      html += `<span style="font-size:10px;color:var(--muted);background:rgba(255,255,255,0.05);padding:1px 5px;border-radius:3px">${escapeHtml(srv.source)}</span>`;
      html += `<span style="font-size:10px;color:var(--muted)">${srv.transport}</span>`;
      html += `</div>`;
      html += `<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text);cursor:pointer;white-space:nowrap"><input type="checkbox" data-mcp-server="${escapeHtml(srv.name)}" ${enabled ? 'checked' : ''} style="accent-color:var(--hc-accent)"/> On</label>`;
      html += `</div>`;
      if (hasUrl) {
        html += `<div style="font-size:10px;color:var(--muted);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(url)}</div>`;
      }
      if (enabled && _mcpToolsCache[srv.name]?.length) {
        const tools = _mcpToolsCache[srv.name];
        html += `<div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:3px">`;
        tools.forEach((t) => {
          html += `<span style="font-size:10px;color:var(--hc-accent);background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.12);padding:1px 5px;border-radius:3px">${escapeHtml(t.name || t)}</span>`;
        });
        html += `</div>`;
      }
      html += `</div>`;
    });
    panel.innerHTML = html;
    panel.querySelectorAll('input[type=checkbox][data-mcp-server]').forEach((cb) => {
      cb.addEventListener('change', async () => {
        const prefs2 = loadMcpPrefs();
        prefs2[cb.dataset.mcpServer] = cb.checked;
        saveMcpPrefs(prefs2);
        if (cb.checked) {
          const srv = _mcpServersCache.find((s) => s.name === cb.dataset.mcpServer);
          if (srv?.url) await discoverMcpTools(srv.name, srv.url);
        }
        renderMcpPanel();
      });
    });
  }

  function collectMcpToolDefinitions() {
    const prefs = loadMcpPrefs();
    const servers = _mcpServersCache || [];
    const defs = [];
    _mcpToolServerMap = {};
    for (const srv of servers) {
      if (prefs[srv.name] === false) continue;
      if (!srv.url) continue;
      const tools = _mcpToolsCache[srv.name] || [];
      for (const t of tools) {
        const safeName = mcpSafeToolName(srv.name, t.name);
        _mcpToolServerMap[safeName] = { url: srv.url, rawName: t.name, server: srv.name };
        const inputSchema = t.inputSchema || t.parameters || { type: 'object', properties: {} };
        defs.push({
          type: 'function',
          function: {
            name: safeName,
            description: `[MCP:${srv.name}] ${t.description || t.name}`,
            parameters: inputSchema,
          },
        });
      }
    }
    return defs;
  }

  async function callMcpTool(serverUrl, toolName, args) {
    if (!window.__TAURI__) throw new Error('MCP requires Tauri runtime');
    const result = await window.__TAURI__.core.invoke('mcp_call_tool', {
      url: serverUrl,
      toolName,
      arguments: args,
    });
    const content = result?.result?.content;
    if (Array.isArray(content)) {
      return content.map((c) => c.text || JSON.stringify(c)).join('\n');
    }
    return result?.result || result?.error || JSON.stringify(result);
  }

  async function initMcpOnBoot() {
    try {
      await scanMcpServers();
      const prefs = loadMcpPrefs();
      const enabledServers = (_mcpServersCache || []).filter((s) => prefs[s.name] !== false && s.url);
      for (const srv of enabledServers) {
        await discoverMcpTools(srv.name, srv.url);
      }
      collectMcpToolDefinitions();
    } catch (e) {
      console.warn('[MCP] boot init failed:', e);
    }
  }

  /** Refresh scan + tools when the MCP settings tab is shown. */
  async function showMcpPane() {
    try {
      await scanMcpServers();
      const prefs = loadMcpPrefs();
      const enabledServers = (_mcpServersCache || []).filter((s) => prefs[s.name] !== false && s.url);
      for (const srv of enabledServers) {
        await discoverMcpTools(srv.name, srv.url);
      }
      renderMcpPanel();
    } catch (e) {
      console.warn('[MCP] pane refresh failed:', e);
      renderMcpPanel();
    }
  }

  function getMcpToolServerMap() {
    return _mcpToolServerMap;
  }

  return {
    initMcpOnBoot,
    showMcpPane,
    scanMcpServers,
    discoverMcpTools,
    renderMcpPanel,
    collectMcpToolDefinitions,
    callMcpTool,
    getMcpToolServerMap,
    loadMcpPrefs,
    saveMcpPrefs,
  };
}
