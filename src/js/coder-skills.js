/**
 * Discover installed agent skills on the system (Cursor, Claude, agents dirs).
 * Loaded before code-mode.bundle.js — exposes window.HC.coderSkills
 */
(function () {
  "use strict";

  const STORAGE_KEY = "hc_coder_skills_cache_v1";
  const MAX_SKILLS = 200;
  const MAX_DEPTH = 6;

  const SKILL_ROOT_SUFFIXES = [
    ".cursor/skills",
    ".cursor/skills-cursor",
    ".claude/skills",
    ".agents/skills",
    ".codex/skills",
  ];

  let _cache = [];
  let _scanInflight = null;

  function parseSkillMd(text, fallbackName) {
    const lines = String(text || "").split("\n");
    let name = fallbackName;
    let description = "";
    for (const line of lines.slice(0, 40)) {
      const t = line.trim();
      if (t.startsWith("# ")) {
        name = t.slice(2).trim() || name;
        break;
      }
      const fm = t.match(/^name:\s*(.+)$/i);
      if (fm) name = fm[1].trim();
    }
    for (const line of lines.slice(0, 80)) {
      const t = line.trim();
      if (t && !t.startsWith("#") && !t.startsWith("---") && !/^name:/i.test(t)) {
        description = t.slice(0, 160);
        break;
      }
    }
    return { name, description };
  }

  async function listDirSafe(path) {
    if (!path || !window.HC?.invoke) return [];
    try {
      const entries = await HC.invoke("fs_list_dir", { path });
      return Array.isArray(entries) ? entries : [];
    } catch {
      return [];
    }
  }

  async function readFileSafe(path) {
    if (!path || !window.HC?.invoke) return "";
    try {
      return await HC.invoke("fs_read_file", { path }) || "";
    } catch {
      return "";
    }
  }

  async function walkForSkills(root, source, depth, out, seen) {
    if (depth > MAX_DEPTH || out.length >= MAX_SKILLS) return;
    const entries = await listDirSafe(root);
    for (const ent of entries) {
      if (out.length >= MAX_SKILLS) break;
      if (!ent?.path) continue;
      const base = ent.name || ent.path.split("/").pop();
      if (base.startsWith(".")) continue;

      if (!ent.is_dir && base === "SKILL.md") {
        const key = ent.path;
        if (seen.has(key)) continue;
        seen.add(key);
        const folder = ent.path.replace(/\/SKILL\.md$/i, "");
        const folderName = folder.split("/").filter(Boolean).pop() || "skill";
        const text = await readFileSafe(ent.path);
        const meta = parseSkillMd(text, folderName);
        out.push({
          id: `${source}:${folderName}`,
          name: meta.name,
          description: meta.description,
          path: ent.path,
          dir: folder,
          source,
        });
        continue;
      }

      if (ent.is_dir) {
        if (base === "node_modules" || base === ".git" || base === "dist" || base === "target") continue;
        const skillMd = `${ent.path}/SKILL.md`;
        if (!seen.has(skillMd)) {
          const subEntries = await listDirSafe(ent.path);
          const hasSkill = subEntries.some(e => !e.is_dir && e.name === "SKILL.md");
          if (hasSkill) {
            seen.add(skillMd);
            const text = await readFileSafe(skillMd);
            const meta = parseSkillMd(text, base);
            out.push({
              id: `${source}:${base}`,
              name: meta.name,
              description: meta.description,
              path: skillMd,
              dir: ent.path,
              source,
            });
          }
        }
        await walkForSkills(ent.path, source, depth + 1, out, seen);
      }
    }
  }

  function skillRoots(homeDir) {
    const home = (homeDir || "").replace(/\/$/, "");
    if (!home) return [];
    return SKILL_ROOT_SUFFIXES.map(s => `${home}${s.startsWith("/") ? "" : "/"}${s.replace(/^\//, "")}`);
  }

  async function discoverInstalledSkills(homeDir, { force = false } = {}) {
    if (_scanInflight) return _scanInflight;
    if (!force && _cache.length) return _cache.slice();

    const p = (async () => {
      const roots = skillRoots(homeDir);
      const out = [];
      const seen = new Set();
      for (const root of roots) {
        const source = root.split("/").slice(-2).join("/") || root;
        const exists = await listDirSafe(root);
        if (!exists.length) continue;
        await walkForSkills(root, source, 0, out, seen);
      }
      out.sort((a, b) => a.name.localeCompare(b.name));
      _cache = out.slice(0, MAX_SKILLS);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ at: Date.now(), skills: _cache }));
      } catch {}
      return _cache.slice();
    })();

    _scanInflight = p.finally(() => { _scanInflight = null; });
    return _scanInflight;
  }

  function loadCachedSkills() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const j = JSON.parse(raw);
      if (Array.isArray(j?.skills)) {
        _cache = j.skills;
        return _cache.slice();
      }
    } catch {}
    return [];
  }

  function formatSkillsForPrompt(skills) {
    if (!skills?.length) return "";
    const lines = skills.slice(0, 48).map(s =>
      `- ${s.name} (${s.source}): ${s.path}${s.description ? " — " + s.description : ""}`
    );
    const more = skills.length > 48 ? `\n… and ${skills.length - 48} more skills on disk.` : "";
    return (
      `Installed agent skills (${skills.length}) — auto-discovered on this machine:\n` +
      lines.join("\n") +
      more +
      "\nWhen a task matches a skill, read_file its SKILL.md path before acting.\n"
    );
  }

  loadCachedSkills();

  window.HC = window.HC || {};
  window.HC.coderSkills = {
    discoverInstalledSkills,
    formatSkillsForPrompt,
    getCached: () => _cache.slice(),
    refresh: (homeDir) => discoverInstalledSkills(homeDir, { force: true }),
  };
})();
