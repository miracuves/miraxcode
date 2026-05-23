/** Virtual OS IndexedDB + in-memory file tree */
import { uid, nowIso } from './utils.js';

const DB_NAME = 'hashui_void_studio_v1';
const STORE = 'projects';
const META_KEY = 'hashui_void_studio_meta_v1';
export const ROOT_ID = '__root__';
export const TRASH_ID = '__trash__';

const SYSTEM_ICON_FINDER = '__system_finder__';
const SYSTEM_ICON_SETTINGS = '__system_settings__';
const SYSTEM_ICON_TRASH = '__system_trash__';

/**
 * @param {{ state: { dbPromise: Promise<IDBDatabase>|null, projects: object[], activeProject: object|null, activeFolderId: string }, clampDesktopPosition?: (pos: object|null) => { x: number, y: number }, log?: (msg: string, kind?: string) => void }} ctx
 */
export function createVoidStorage(ctx) {
  const { state } = ctx;
  const clampDesktopPosition = ctx.clampDesktopPosition || (pos => pos || { x: 8, y: 8 });
  const log = ctx.log || (() => {});

  function openDb() {
    if (state.dbPromise) return state.dbPromise;
    state.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB failed'));
    });
    return state.dbPromise;
  }

  async function txStore(mode = 'readonly') {
    const db = await openDb();
    return db.transaction(STORE, mode).objectStore(STORE);
  }

  function requestToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
    });
  }

  async function loadProjects() {
    const store = await txStore('readonly');
    const all = await requestToPromise(store.getAll());
    if (!all.length) {
      state.activeProject = makeProject('Virtual OS');
      await saveProject();
    } else {
      all.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      state.activeProject = all[0];
      state.activeProject.name = 'Virtual OS';
    }
    state.projects = [state.activeProject];
    normalizeProject(state.activeProject);
  }

  async function saveProject() {
    if (!state.activeProject) return;
    state.activeProject.updatedAt = nowIso();
    normalizeProject(state.activeProject);
    const store = await txStore('readwrite');
    await requestToPromise(store.put(state.activeProject));
    const i = state.projects.findIndex(p => p.id === state.activeProject.id);
    if (i >= 0) state.projects[i] = state.activeProject;
    else state.projects.unshift(state.activeProject);
    try {
      localStorage.setItem(META_KEY, JSON.stringify({ activeId: state.activeProject.id }));
    } catch {}
  }

  function makeProject(name) {
    const t = nowIso();
    return {
      id: uid('project'),
      name: name || 'Untitled Project',
      createdAt: t,
      updatedAt: t,
      files: [],
      systemIconPositions: {},
    };
  }

  function normalizeProject(project) {
    project.files = Array.isArray(project.files) ? project.files.filter(Boolean) : [];
    project.systemIconPositions = project.systemIconPositions && typeof project.systemIconPositions === 'object'
      ? project.systemIconPositions
      : {};
    for (const id of [SYSTEM_ICON_FINDER, SYSTEM_ICON_SETTINGS, SYSTEM_ICON_TRASH]) {
      const pos = project.systemIconPositions[id];
      if (!pos || !Number.isFinite(Number(pos.x)) || !Number.isFinite(Number(pos.y))) {
        delete project.systemIconPositions[id];
      } else {
        project.systemIconPositions[id] = { x: Number(pos.x), y: Number(pos.y) };
      }
    }
    const seen = new Set();
    project.files = project.files.filter(item => {
      if (!item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      item.type = item.type === 'folder' ? 'folder' : 'file';
      item.parentId = item.parentId || ROOT_ID;
      item.name = safeName(item.name || (item.type === 'folder' ? 'folder' : 'file.txt'));
      item.updatedAt = item.updatedAt || nowIso();
      if (item.deletedAt) {
        item.deletedAt = String(item.deletedAt);
        item.trashParentId = item.trashParentId || item.parentId || ROOT_ID;
        item.trashPath = item.trashPath || item.path || item.name;
        item.trashRoot = !!item.trashRoot;
      } else {
        delete item.deletedAt;
        delete item.trashParentId;
        delete item.trashPath;
        delete item.trashRoot;
      }
      if (item.type === 'folder') item.content = '';
      else item.content = String(item.content ?? '');
      return true;
    });
    rebuildPaths();
  }

  function safeName(name) {
    return String(name || '')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'untitled';
  }

  function normalizeVirtualPath(path) {
    const clean = String(path || '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .split('/')
      .map(p => safeName(p))
      .filter(p => p && p !== '.' && p !== '..')
      .join('/');
    return clean || 'index.html';
  }

  function getItem(id) {
    if (!state.activeProject) return null;
    return state.activeProject.files.find(f => f.id === id) || null;
  }

  function childrenOf(parentId) {
    if (!state.activeProject) return [];
    if (parentId === TRASH_ID) {
      return state.activeProject.files
        .filter(f => f.deletedAt && f.trashRoot)
        .sort(fileSorter);
    }
    const parent = getItem(parentId);
    const wantsDeleted = !!parent?.deletedAt;
    return state.activeProject.files
      .filter(f => (f.parentId || ROOT_ID) === parentId && !!f.deletedAt === wantsDeleted)
      .sort(fileSorter);
  }

  function fileSorter(a, b) {
    return a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1;
  }

  function visibleProjectFiles() {
    return (state.activeProject?.files || []).filter(f => !f.deletedAt);
  }

  function trashedProjectFiles() {
    return (state.activeProject?.files || []).filter(f => f.deletedAt);
  }

  function descendantIds(rootId) {
    const ids = new Set([rootId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of state.activeProject?.files || []) {
        if (ids.has(item.parentId) && !ids.has(item.id)) {
          ids.add(item.id);
          changed = true;
        }
      }
    }
    return ids;
  }

  function parentPath(parentId) {
    if (!parentId || parentId === ROOT_ID) return '';
    const p = getItem(parentId);
    return p ? p.path : '';
  }

  function writableFolderId(id = state.activeFolderId) {
    if (!id || id === TRASH_ID) return ROOT_ID;
    if (id === ROOT_ID) return ROOT_ID;
    const item = getItem(id);
    return item?.type === 'folder' && !item.deletedAt ? item.id : ROOT_ID;
  }

  function rebuildPaths() {
    if (!state.activeProject) return;
    const byId = new Map(state.activeProject.files.map(f => [f.id, f]));
    const pathFor = (item, stack = new Set()) => {
      if (!item || stack.has(item.id)) return item?.name || '';
      if (item.parentId === ROOT_ID || !byId.has(item.parentId)) return item.name;
      stack.add(item.id);
      const p = byId.get(item.parentId);
      return `${pathFor(p, stack)}/${item.name}`;
    };
    state.activeProject.files.forEach(item => { item.path = normalizeVirtualPath(pathFor(item)); });
  }

  function ensureFolderPath(folderPath, baseParent = ROOT_ID) {
    const parts = normalizeVirtualPath(folderPath || '').split('/').filter(Boolean);
    let parentId = baseParent;
    for (const part of parts) {
      let folder = childrenOf(parentId).find(f => f.type === 'folder' && f.name === part);
      if (!folder) {
        folder = { id: uid('folder'), parentId, type: 'folder', name: part, path: '', content: '', mime: 'inode/directory', updatedAt: nowIso() };
        state.activeProject.files.push(folder);
        rebuildPaths();
      }
      parentId = folder.id;
    }
    return parentId;
  }

  function addFileByPath(path, content, mime = 'text/plain') {
    const clean = normalizeVirtualPath(path);
    const parts = clean.split('/');
    const name = safeName(parts.pop());
    const parentId = parts.length ? ensureFolderPath(parts.join('/')) : ROOT_ID;
    let existing = childrenOf(parentId).find(f => f.type === 'file' && f.name === name);
    if (!existing) {
      existing = { id: uid('file'), parentId, type: 'file', name, path: '', content: '', mime, updatedAt: nowIso() };
      state.activeProject.files.push(existing);
    }
    existing.content = String(content ?? '');
    existing.mime = mime;
    existing.updatedAt = nowIso();
    rebuildPaths();
    return existing;
  }

  function searchText(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[_\-./]+/g, ' ')
      .replace(/\b(file|folder|named|called|the|a|an|into|inside|to|in|put|move|rename|delete|remove|create|make)\b/g, ' ')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map(t => t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t)
      .join(' ');
  }

  function itemSearchText(item) {
    return searchText(`${item.name} ${item.path}`);
  }

  function findVirtualItem(query, type = '') {
    const q = searchText(query);
    if (!q) return null;
    const tokens = q.split(/\s+/).filter(Boolean);
    let best = null;
    let bestScore = 0;
    for (const item of state.activeProject.files) {
      if (item.deletedAt) continue;
      if (type && item.type !== type) continue;
      const hay = itemSearchText(item);
      let score = 0;
      for (const token of tokens) {
        if (hay === token) score += 8;
        else if (hay.split(/\s+/).includes(token)) score += 5;
        else if (hay.includes(token)) score += 2;
      }
      if (item.name.toLowerCase() === String(query).toLowerCase()) score += 10;
      if (score > bestScore) {
        best = item;
        bestScore = score;
      }
    }
    return bestScore > 0 ? best : null;
  }

  function cleanInstructionName(value) {
    return safeName(String(value || '')
      .replace(/[.!?]+$/g, '')
      .replace(/^["']|["']$/g, '')
      .replace(/\s+(?:folder|directory)$/i, '')
      .trim());
  }

  function trimInstructionTarget(value) {
    return String(value || '')
      .replace(/[.!?]+$/g, '')
      .replace(/^["']|["']$/g, '')
      .trim();
  }

  function moveItemToFolder(item, folderName) {
    if (!item) return false;
    const targetFolderName = cleanInstructionName(folderName);
    if (!targetFolderName) return false;
    const existingFolder = findVirtualItem(targetFolderName, 'folder');
    const folderId = existingFolder?.id || ensureFolderPath(targetFolderName);
    if (!canMoveToParent(item, folderId)) return false;
    item.parentId = folderId;
    item.desktopPosition = null;
    item.updatedAt = nowIso();
    rebuildPaths();
    state.activeFolderId = folderId;
    return true;
  }

  function canMoveToParent(item, parentId) {
    if (!item) return false;
    if (item.deletedAt) return false;
    if (!parentId || parentId === ROOT_ID) return true;
    const target = getItem(parentId);
    if (!target || target.deletedAt || target.type !== 'folder' || target.id === item.id) return false;
    let parent = target;
    while (parent) {
      if (parent.id === item.id) return false;
      if (parent.parentId === ROOT_ID) break;
      parent = getItem(parent.parentId);
    }
    return true;
  }

  async function moveItemToParent(itemId, parentId = ROOT_ID, desktopPosition = null) {
    const item = getItem(itemId);
    if (!item) return false;
    if (item.deletedAt) {
      log('Restore the item from Trash before moving it.', 'warn');
      return false;
    }
    const targetParentId = parentId || ROOT_ID;
    if (!canMoveToParent(item, targetParentId)) {
      log('Move was blocked to protect the virtual folder tree.', 'warn');
      return false;
    }
    item.parentId = targetParentId;
    item.desktopPosition = targetParentId === ROOT_ID ? clampDesktopPosition(desktopPosition) : null;
    item.updatedAt = nowIso();
    rebuildPaths();
    await saveProject();
    return true;
  }

  return {
    ROOT_ID,
    TRASH_ID,
    openDb,
    loadProjects,
    saveProject,
    makeProject,
    normalizeProject,
    safeName,
    normalizeVirtualPath,
    getItem,
    childrenOf,
    visibleProjectFiles,
    trashedProjectFiles,
    descendantIds,
    parentPath,
    writableFolderId,
    rebuildPaths,
    ensureFolderPath,
    addFileByPath,
    findVirtualItem,
    cleanInstructionName,
    trimInstructionTarget,
    moveItemToFolder,
    canMoveToParent,
    moveItemToParent,
  };
}
