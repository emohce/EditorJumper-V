const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { getCacheRootDir, getSharedAppsPath } = require('./cachePaths');
const { defaultJetbrainsApps, defaultVscodeApps, toAppEntries } = require('./defaultAppCatalog');

let cachedApps = null;
let cachedMtimeMs = 0;
let watcher = null;
let changeListeners = [];

function nowIso() {
	return new Date().toISOString();
}

function ensureCacheDir() {
	const dir = getCacheRootDir();
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	return dir;
}

function atomicWriteJson(filePath, data) {
	ensureCacheDir();
	const tmp = `${filePath}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
	fs.renameSync(tmp, filePath);
}

function readJsonFileSafe(filePath) {
	try {
		if (!fs.existsSync(filePath)) {
			return null;
		}
		return JSON.parse(fs.readFileSync(filePath, 'utf8'));
	} catch (e) {
		const bak = `${filePath}.bak`;
		try {
			fs.copyFileSync(filePath, bak);
		} catch (_) { /* ignore */ }
		console.warn('globalConfigStore: corrupt shared-apps, using defaults', e.message);
		return null;
	}
}

function emptyJumperExtras() {
	return {
		shortcutSlot1: '',
		shortcutSlot2: '',
		shortcutSlot3: '',
		selectedEditorType: ''
	};
}

function mergeJumperExtras(base, patch) {
	const result = { ...emptyJumperExtras(), ...(base || {}) };
	if (!patch) {
		return result;
	}
	if (patch.shortcutSlot1) {
		result.shortcutSlot1 = patch.shortcutSlot1;
	}
	if (patch.shortcutSlot2) {
		result.shortcutSlot2 = patch.shortcutSlot2;
	}
	if (patch.shortcutSlot3) {
		result.shortcutSlot3 = patch.shortcutSlot3;
	}
	if (patch.selectedEditorType) {
		result.selectedEditorType = patch.selectedEditorType;
	}
	return result;
}

function createDefaultApps() {
	return {
		version: 1,
		revision: 0,
		jetbrainsApps: defaultJetbrainsApps(),
		vscodeApps: defaultVscodeApps(),
		jumperExtras: emptyJumperExtras()
	};
}

function readLegacyConfigArray(config, key) {
	const inspected = config.inspect(key);
	if (inspected) {
		if (Array.isArray(inspected.globalValue) && inspected.globalValue.length > 0) {
			return inspected.globalValue;
		}
		if (Array.isArray(inspected.workspaceValue) && inspected.workspaceValue.length > 0) {
			return inspected.workspaceValue;
		}
		if (Array.isArray(inspected.workspaceFolderValue) && inspected.workspaceFolderValue.length > 0) {
			return inspected.workspaceFolderValue;
		}
	}
	const val = config.get(key);
	return Array.isArray(val) ? val : [];
}

function mergeAppEntry(existing, incoming) {
	if (!existing) {
		return { ...incoming, updatedAt: incoming.updatedAt || nowIso() };
	}
	const merged = { ...existing, ...incoming };
	const exPath = existing.commandPath;
	const inPath = incoming.commandPath;
	if (exPath && inPath && exPath !== inPath) {
		const exTime = existing.updatedAt ? Date.parse(existing.updatedAt) : 0;
		const inTime = incoming.updatedAt ? Date.parse(incoming.updatedAt) : 0;
		merged.commandPath = inTime >= exTime ? inPath : exPath;
	} else {
		merged.commandPath = inPath || exPath || null;
	}
	merged.hidden = !!incoming.hidden;
	merged.isCustom = !!(existing.isCustom || incoming.isCustom);
	return merged;
}

function mergeAppArrays(existingArr, incomingArr) {
	const map = new Map();
	(existingArr || []).forEach((item) => map.set(item.name, item));
	(incomingArr || []).forEach((item) => {
		map.set(item.name, mergeAppEntry(map.get(item.name), item));
	});
	return Array.from(map.values());
}

function mergeApps(base, patch) {
	return {
		version: 1,
		revision: Math.max(base.revision || 0, patch.revision || 0) + 1,
		jetbrainsApps: mergeAppArrays(base.jetbrainsApps, patch.jetbrainsApps),
		vscodeApps: mergeAppArrays(base.vscodeApps, patch.vscodeApps),
		jumperExtras: mergeJumperExtras(base.jumperExtras, patch.jumperExtras)
	};
}

function buildLegacyAppsPatch(config) {
	const ideConfigurations = readLegacyConfigArray(config, 'ideConfigurations');
	const vscodeAppConfigurations = readLegacyConfigArray(config, 'vscodeAppConfigurations');
	if (ideConfigurations.length === 0 && vscodeAppConfigurations.length === 0) {
		return null;
	}
	return {
		jetbrainsApps: toAppEntries(ideConfigurations).map((item) => ({ ...item, updatedAt: nowIso() })),
		vscodeApps: toAppEntries(vscodeAppConfigurations).map((item) => ({ ...item, updatedAt: nowIso() }))
	};
}

function migrateFromLegacyUserSettings() {
	const config = vscode.workspace.getConfiguration('editorjumper');
	const patch = buildLegacyAppsPatch(config);
	const defaults = createDefaultApps();
	if (!patch) {
		return defaults;
	}
	return mergeApps(defaults, patch);
}

function importLegacyUserSettings() {
	const config = vscode.workspace.getConfiguration('editorjumper');
	const patch = buildLegacyAppsPatch(config);
	if (!patch) {
		return false;
	}
	writeApps(patch);
	console.log('globalConfigStore: imported legacy user settings');
	return true;
}

function invalidateCache() {
	cachedApps = null;
	cachedMtimeMs = 0;
}

function readApps(forceReload = false) {
	const filePath = getSharedAppsPath();
	if (!forceReload && cachedApps && fs.existsSync(filePath)) {
		const stat = fs.statSync(filePath);
		if (stat.mtimeMs === cachedMtimeMs) {
			return cachedApps;
		}
	}
	let data = readJsonFileSafe(filePath);
	if (!data) {
		data = migrateFromLegacyUserSettings();
		atomicWriteJson(filePath, data);
		console.log('globalConfigStore: migrated from legacy user settings');
	}
	cachedApps = data;
	if (fs.existsSync(filePath)) {
		cachedMtimeMs = fs.statSync(filePath).mtimeMs;
	}
	return cachedApps;
}

function writeApps(nextApps, options = {}) {
	const filePath = getSharedAppsPath();
	const current = readApps(true);
	const merged = mergeApps(current, nextApps);
	const replaceKeys = options.replaceKeys || [];
	for (const key of replaceKeys) {
		if (Object.prototype.hasOwnProperty.call(nextApps, key) && nextApps[key] !== undefined) {
			merged[key] = nextApps[key];
		}
	}
	merged.revision = (current.revision || 0) + 1;
	atomicWriteJson(filePath, merged);
	cachedApps = merged;
	if (fs.existsSync(filePath)) {
		cachedMtimeMs = fs.statSync(filePath).mtimeMs;
	}
	return merged;
}

function ensureDefaultJetbrainsApps() {
	const apps = readApps(true);
	const defaults = defaultJetbrainsApps();
	const existingNames = new Set((apps.jetbrainsApps || []).map((item) => item.name));
	const missing = defaults.filter((item) => !existingNames.has(item.name));
	if (missing.length === 0) {
		return apps;
	}
	return writeApps({ jetbrainsApps: [...(apps.jetbrainsApps || []), ...missing] });
}

function getIdeConfigurations() {
	const apps = readApps();
	return apps.jetbrainsApps || [];
}

function getVscodeAppConfigurations() {
	const apps = readApps();
	return apps.vscodeApps || [];
}

function setCommandPath(name, kind, commandPath) {
	const apps = readApps(true);
	const key = kind === 'jetbrains' ? 'jetbrainsApps' : 'vscodeApps';
	const list = [...(apps[key] || [])];
	const idx = list.findIndex((item) => item.name === name);
	const entry = idx >= 0 ? { ...list[idx] } : { name, isCustom: false, hidden: false, commandPath: null, updatedAt: null };
	entry.commandPath = commandPath || null;
	entry.updatedAt = nowIso();
	if (idx >= 0) {
		list[idx] = entry;
	} else {
		list.push(entry);
	}
	return writeApps({ [key]: list });
}

function upsertApp(kind, app) {
	const apps = readApps(true);
	const key = kind === 'jetbrains' ? 'jetbrainsApps' : 'vscodeApps';
	const list = [...(apps[key] || [])];
	const idx = list.findIndex((item) => item.name === app.name);
	const entry = {
		name: app.name,
		commandPath: app.commandPath ?? null,
		isCustom: !!app.isCustom,
		hidden: !!app.hidden,
		updatedAt: nowIso()
	};
	if (idx >= 0) {
		list[idx] = mergeAppEntry(list[idx], entry);
	} else {
		list.push(entry);
	}
	return writeApps({ [key]: list });
}

function removeApp(kind, name) {
	const apps = readApps(true);
	const key = kind === 'jetbrains' ? 'jetbrainsApps' : 'vscodeApps';
	const list = (apps[key] || []).filter((item) => item.name !== name);
	return writeApps({ [key]: list }, { replaceKeys: [key] });
}

function setHidden(kind, name, hidden) {
	const apps = readApps(true);
	const key = kind === 'jetbrains' ? 'jetbrainsApps' : 'vscodeApps';
	const list = [...(apps[key] || [])];
	const idx = list.findIndex((item) => item.name === name);
	if (idx < 0) {
		return apps;
	}
	list[idx] = { ...list[idx], hidden: !!hidden, updatedAt: nowIso() };
	return writeApps({ [key]: list });
}

function replaceIdeConfigurations(list) {
	return writeApps({
		jetbrainsApps: list.map((item) => ({
			name: item.name,
			commandPath: item.commandPath ?? null,
			isCustom: !!item.isCustom,
			hidden: !!item.hidden,
			updatedAt: nowIso()
		}))
	}, { replaceKeys: ['jetbrainsApps'] });
}

function replaceVscodeAppConfigurations(list) {
	return writeApps({
		vscodeApps: list.map((item) => ({
			name: item.name,
			commandPath: item.commandPath ?? null,
			isCustom: !!item.isCustom,
			hidden: !!item.hidden,
			updatedAt: nowIso()
		}))
	}, { replaceKeys: ['vscodeApps'] });
}

function notifyChangeListeners() {
	changeListeners.forEach((fn) => {
		try {
			fn();
		} catch (e) {
			console.warn('globalConfigStore listener error:', e.message);
		}
	});
}

function watchSharedApps(onChange) {
	if (onChange) {
		changeListeners.push(onChange);
	}
	if (watcher) {
		return;
	}
	ensureCacheDir();
	const filePath = getSharedAppsPath();
	const trigger = () => {
		invalidateCache();
		notifyChangeListeners();
	};
	try {
		if (!fs.existsSync(filePath)) {
			readApps(true);
		}
		watcher = fs.watch(getCacheRootDir(), (eventType, filename) => {
			if (filename && String(filename).includes('shared-apps.json')) {
				trigger();
			}
		});
	} catch (e) {
		console.warn('globalConfigStore: fs.watch failed', e.message);
	}
}

function disposeWatcher() {
	if (watcher) {
		watcher.close();
		watcher = null;
	}
	changeListeners = [];
}

module.exports = {
	readApps,
	writeApps,
	getIdeConfigurations,
	getVscodeAppConfigurations,
	setCommandPath,
	upsertApp,
	removeApp,
	setHidden,
	replaceIdeConfigurations,
	replaceVscodeAppConfigurations,
	watchSharedApps,
	disposeWatcher,
	invalidateCache,
	migrateFromLegacyUserSettings,
	importLegacyUserSettings,
	createDefaultApps,
	ensureDefaultJetbrainsApps
};
