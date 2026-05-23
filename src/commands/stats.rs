use serde::Serialize;
use std::sync::Mutex;
use sysinfo::{System, ProcessesToUpdate};

#[derive(Serialize, Clone)]
pub struct SystemStats {
    cpu_usage: Vec<f32>,
    cpu_avg: f32,
    cpu_count: usize,
    ram_total_gb: f64,
    ram_used_gb: f64,
    ram_pct: f32,
    swap_total_gb: f64,
    swap_used_gb: f64,
    swap_pct: f32,
    gpu_name: String,
    gpu_usage_pct: Option<f32>,
    gpu_vram_total_gb: Option<f64>,
    gpu_vram_used_gb: Option<f64>,
    gpu_vram_pct: Option<f32>,
    uptime_secs: u64,
    process_count: usize,
}

static SYS: once_cell::sync::Lazy<Mutex<System>> = once_cell::sync::Lazy::new(|| {
    Mutex::new(System::new())
});

#[tauri::command]
pub fn system_stats() -> SystemStats {
    let mut sys = SYS.lock().unwrap_or_else(|e| e.into_inner());
    sys.refresh_cpu_usage();
    sys.refresh_memory();

    let cpus = sys.cpus();
    let cpu_usage: Vec<f32> = cpus.iter().map(|c| c.cpu_usage()).collect();
    let cpu_avg = if cpu_usage.is_empty() { 0.0 } else { cpu_usage.iter().sum::<f32>() / cpu_usage.len() as f32 };
    let cpu_count = cpus.len();

    let ram_total = sys.total_memory() as f64 / 1_073_741_824.0;
    let ram_used = sys.used_memory() as f64 / 1_073_741_824.0;
    let ram_pct = if ram_total > 0.0 { (ram_used / ram_total * 100.0) as f32 } else { 0.0 };

    let swap_total = sys.total_swap() as f64 / 1_073_741_824.0;
    let swap_used = sys.used_swap() as f64 / 1_073_741_824.0;
    let swap_pct = if swap_total > 0.0 { (swap_used / swap_total * 100.0) as f32 } else { 0.0 };

    let uptime_secs = sysinfo::System::uptime();

    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let process_count = sys.processes().len();

    let mut gpu_name = String::new();
    let mut gpu_usage_pct = None;
    let mut gpu_vram_total_gb = None;
    let mut gpu_vram_used_gb = None;
    let mut gpu_vram_pct = None;

    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = std::process::Command::new("system_profiler")
            .args(["SPDisplaysDataType"])
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout);
            if let Some(line) = text.lines().find(|l| l.contains("Chipset Model") || l.contains("Model:")) {
                gpu_name = line.split(':').nth(1).unwrap_or("").trim().to_string();
                if gpu_name.is_empty() {
                    gpu_name = line.split(':').nth(1).unwrap_or("").trim().to_string();
                }
            }
        }
        if let Ok(output) = std::process::Command::new("ioreg")
            .args(["-l", "-w0", "-r", "-c", "IOGPUDevice"])
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout);
            let mut found_vram = false;
            for line in text.lines() {
                if let Some(rest) = line.strip_suffix("bytes") {
                    if rest.contains("\"IOGPUVRAMSize\"") || (rest.contains("VRAM") && rest.contains("=")) {
                        if let Some(num_str) = rest.split('=').nth(1) {
                            if let Ok(bytes) = num_str.trim().trim_end_matches(' ').parse::<f64>() {
                                gpu_vram_total_gb = Some(bytes / 1_073_741_824.0);
                                found_vram = true;
                            }
                        }
                    }
                }
            }
            if found_vram {
                if let Ok(mem_output) = std::process::Command::new("memory_pressure")
                    .output()
                {
                    let mem_text = String::from_utf8_lossy(&mem_output.stdout);
                    for line in mem_text.lines() {
                        if line.contains("System-wide memory free") {
                            if let Some(p) = line.split(':').nth(1) {
                                let free_pct: f32 = p.trim().trim_end_matches('%').trim().parse().unwrap_or(100.0);
                                let used_pct = 100.0 - free_pct;
                                gpu_vram_pct = Some(used_pct);
                                if let Some(total) = gpu_vram_total_gb {
                                    gpu_vram_used_gb = Some(total * used_pct as f64 / 100.0);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    SystemStats {
        cpu_usage,
        cpu_avg,
        cpu_count,
        ram_total_gb: (ram_total * 100.0).round() / 100.0,
        ram_used_gb: (ram_used * 100.0).round() / 100.0,
        ram_pct,
        swap_total_gb: (swap_total * 100.0).round() / 100.0,
        swap_used_gb: (swap_used * 100.0).round() / 100.0,
        swap_pct,
        gpu_name,
        gpu_usage_pct,
        gpu_vram_total_gb,
        gpu_vram_used_gb,
        gpu_vram_pct,
        uptime_secs,
        process_count,
    }
}
