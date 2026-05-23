/** Tauri system stats widget in Coder mode header */

let _statsInterval = null;

export function startStatsPolling() {
  if (!window.__TAURI__) return;
  const widget = document.getElementById('cdrStatsWidget');
  if (!widget) return;
  widget.style.display = 'flex';
  updateStats();
  if (_statsInterval) clearInterval(_statsInterval);
  _statsInterval = setInterval(updateStats, 2000);
}

export function stopStatsPolling() {
  if (_statsInterval) {
    clearInterval(_statsInterval);
    _statsInterval = null;
  }
}

async function updateStats() {
  if (!window.__TAURI__) return;
  try {
    const s = await window.__TAURI__.core.invoke('system_stats');
    const cpuEl = document.getElementById('cdrStatCpu');
    const ramEl = document.getElementById('cdrStatRam');
    const gpuEl = document.getElementById('cdrStatGpu');
    if (cpuEl) {
      const cpuColor = s.cpu_avg > 80 ? 'var(--rose)' : s.cpu_avg > 50 ? '#eab308' : 'var(--muted)';
      cpuEl.style.color = cpuColor;
      cpuEl.textContent = `CPU ${s.cpu_avg.toFixed(0)}%`;
    }
    if (ramEl) {
      const ramColor = s.ram_pct > 90 ? 'var(--rose)' : s.ram_pct > 70 ? '#eab308' : 'var(--muted)';
      ramEl.style.color = ramColor;
      ramEl.textContent = `RAM ${s.ram_used_gb.toFixed(1)}/${s.ram_total_gb.toFixed(0)}G`;
    }
    if (gpuEl && s.gpu_name) {
      gpuEl.style.display = '';
      const vram = s.gpu_vram_used_gb != null ? ` ${s.gpu_vram_used_gb.toFixed(1)}/${s.gpu_vram_total_gb?.toFixed(0) || '?'}G` : '';
      gpuEl.textContent = `GPU${vram}`;
    }
  } catch {}
}
