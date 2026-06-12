const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { getCacheRootDir } = require('./cachePaths');
const { normalizeAnchorPath, computeConfigKey, buildProjectCacheFileName } = require('./pathKeyUtil');
const {
	resolveRouteFilePath,
	listWorkspaceFolderPaths,
	resolvePhysicalWorkspaceFolderOnly,
	resolveConfigAnchorPath
} = require('./workspaceRouteUtil');

const PLUGIN_SUFFIX = 'jumper-v';
let projectWatcher = null;
let projectChangeListeners = [];

function defaultSlotTargets() {
	return [
		{ slot: 1, type: 'jetbrains', target: 'IDEA' },
		{ slot: 2, type: 'vscode-app', target: 'Cursor' },
		{ slot: 3, type: 'vscode-app', target: 'Windsurf' }
	];
}

function defaultProjectConfig(anchorPath) {
	return {
		version: 2,
		anchorPath: anchorPath || '',
		jetBrainsRootProjectPath: '',
		slotTargets: defaultSlotTargets(),
		jumpBackSource: ''
	};
}

function readProjectCacheFromDisk(filePath) {
	try {
		if (!fs.existsSync(filePath)) {
			return null;
		}
		return JSON.parse(fs.readFileSync(filePath, 'utf8'));
	} catch (e) {
		console.warn('projectConfigStore: read failed', filePath, e.message);
		return null;
	}
}

function writeProjectCacheToDisk(filePath, data) {
	const dir = getCacheRootDir();
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	const tmp = `${filePath}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
	fs.renameSync(tmp, filePath);
}

function getProjectCacheFilePath(anchorPath) {
	const normalized = normalizeAnchorPath(anchorPath);
	const key = computeConfigKey(normalized);
	if (!key) {
		return null;
	}
	return path.join(getCacheRootDir(), buildProjectCacheFileName(key, normalized, PLUGIN_SUFFIX));
}

function readLegacyString(config, key) {
	const inspected = config.inspect(key);
	if (inspected) {
		if (typeof inspected.workspaceFolderValue === 'string' && inspected.workspaceFolderValue.trim()) {
			return inspected.workspaceFolderValue.trim();
		}
		if (typeof inspected.workspaceValue === 'string' && inspected.workspaceValue.trim()) {
			return inspected.workspaceValue.trim();
		}
		if (typeof inspected.globalValue === 'string' && inspected.globalValue.trim()) {
			return inspected.globalValue.trim();
		}
	}
	const val = config.get(key);
	return typeof val === 'string' ? val.trim() : '';
}

function readLegacySlotTargets(config) {
	const inspected = config.inspect('slotTargets');
	let val = null;
	if (inspected) {
		val = inspected.workspaceFolderValue || inspected.workspaceValue || inspected.globalValue;
	}
	if (!val) {
		val = config.get('slotTargets');
	}
	return Array.isArray(val) ? val : null;
}

function tryInheritWorkspaceFileCache(folderAnchorPath) {
	const wf = vscode.workspace.workspaceFile;
	if (!wf || wf.scheme !== 'file' || !wf.fsPath.endsWith('.code-workspace')) {
		return null;
	}
	const wsCacheFile = getProjectCacheFilePath(wf.fsPath);
	const wsData = wsCacheFile ? readProjectCacheFromDisk(wsCacheFile) : null;
	if (!wsData) {
		return null;
	}
	return {
		...defaultProjectConfig(folderAnchorPath),
		anchorPath: folderAnchorPath,
		jetBrainsRootProjectPath: wsData.jetBrainsRootProjectPath || '',
		slotTargets: wsData.slotTargets || defaultSlotTargets(),
		jumpBackSource: wsData.jumpBackSource || ''
	};
}

function migrateFromLegacyWorkspace(folderAnchorPath) {
	const config = vscode.workspace.getConfiguration('editorjumper');
	const slotTargets = readLegacySlotTargets(config);
	const jetBrainsRoot = readLegacyString(config, 'jetBrainsRootProjectPath');
	const jumpBackSource = readLegacyString(config, 'jumpBackSource');
	const mergedSlots = defaultSlotTargets();
	if (Array.isArray(slotTargets) && slotTargets.length >= 3) {
		for (let i = 0; i < 3; i++) {
			if (slotTargets[i]) {
				mergedSlots[i] = {
					slot: i + 1,
					type: slotTargets[i].type || mergedSlots[i].type,
					target: slotTargets[i].target || mergedSlots[i].target
				};
			}
		}
	}
	const slot1Target = readLegacyString(config, 'selectedIDE');
	if ((!mergedSlots[0].target || mergedSlots[0].target === '') && slot1Target) {
		mergedSlots[0] = { slot: 1, type: 'jetbrains', target: slot1Target };
	}
	return {
		version: 2,
		anchorPath: folderAnchorPath || '',
		jetBrainsRootProjectPath: jetBrainsRoot || '',
		slotTargets: mergedSlots,
		jumpBackSource: jumpBackSource || ''
	};
}

function ensureProjectCache(routeFilePath) {
	const anchorPath = resolveConfigAnchorPath(routeFilePath);
	if (!anchorPath) {
		return migrateFromLegacyWorkspace('');
	}
	const cacheFile = getProjectCacheFilePath(anchorPath);
	let data = cacheFile ? readProjectCacheFromDisk(cacheFile) : null;
	if (data) {
		if (!data.version) {
			data.version = 2;
		}
		if (!data.anchorPath) {
			data.anchorPath = anchorPath;
		}
		return data;
	}
	data = tryInheritWorkspaceFileCache(anchorPath);
	if (!data) {
		data = migrateFromLegacyWorkspace(anchorPath);
	}
	data.anchorPath = anchorPath;
	if (cacheFile) {
		writeProjectCacheToDisk(cacheFile, data);
		console.log('projectConfigStore: initialized cache for', anchorPath);
	}
	return data;
}

function importLegacyWorkspaceSettings() {
	const config = vscode.workspace.getConfiguration('editorjumper');
	const hasLegacy = ['slotTargets', 'jetBrainsRootProjectPath', 'jumpBackSource', 'selectedIDE'].some((key) => {
		const inspected = config.inspect(key);
		return inspected && (
			inspected.globalValue !== undefined
			|| inspected.workspaceValue !== undefined
			|| inspected.workspaceFolderValue !== undefined
		);
	});
	if (!hasLegacy) {
		return false;
	}
	const folders = listWorkspaceFolderPaths();
	if (folders.length === 0) {
		return false;
	}
	const legacyData = migrateFromLegacyWorkspace('');
	for (const folder of folders) {
		const anchorPath = normalizeAnchorPath(folder);
		const cacheFile = getProjectCacheFilePath(anchorPath);
		if (!cacheFile) {
			continue;
		}
		writeProjectCacheToDisk(cacheFile, {
			...legacyData,
			anchorPath
		});
	}
	console.log('projectConfigStore: imported legacy workspace settings');
	return true;
}

function readProject(routeFilePath) {
	return ensureProjectCache(routeFilePath);
}

function readProjectFresh(routeFilePath) {
	const anchorPath = resolveConfigAnchorPath(routeFilePath);
	if (!anchorPath) {
		return migrateFromLegacyWorkspace('');
	}
	const cacheFile = getProjectCacheFilePath(anchorPath);
	const data = cacheFile ? readProjectCacheFromDisk(cacheFile) : null;
	if (data) {
		if (!data.version) {
			data.version = 2;
		}
		if (!data.anchorPath) {
			data.anchorPath = anchorPath;
		}
		return data;
	}
	return ensureProjectCache(routeFilePath);
}

function projectCacheFileExists(routeFilePath) {
	const anchorPath = resolveConfigAnchorPath(routeFilePath);
	if (!anchorPath) {
		return false;
	}
	const cacheFile = getProjectCacheFilePath(anchorPath);
	return !!(cacheFile && fs.existsSync(cacheFile));
}

function writeProject(patch, routeFilePath) {
	const anchorPath = patch.anchorPath
		? normalizeAnchorPath(patch.anchorPath)
		: resolveConfigAnchorPath(routeFilePath);
	if (!anchorPath) {
		return defaultProjectConfig('');
	}
	const current = ensureProjectCache(routeFilePath);
	const next = {
		version: 2,
		anchorPath,
		jetBrainsRootProjectPath: patch.jetBrainsRootProjectPath !== undefined
			? patch.jetBrainsRootProjectPath
			: current.jetBrainsRootProjectPath,
		slotTargets: patch.slotTargets || current.slotTargets || defaultSlotTargets(),
		jumpBackSource: patch.jumpBackSource !== undefined ? patch.jumpBackSource : current.jumpBackSource
	};
	const cacheFile = getProjectCacheFilePath(anchorPath);
	if (cacheFile) {
		writeProjectCacheToDisk(cacheFile, next);
	}
	return next;
}

function getSlotTargets(routeFilePath) {
	const project = readProject(routeFilePath);
	return project.slotTargets || defaultSlotTargets();
}

function setSlotTargets(slotTargets, routeFilePath) {
	return writeProject({ slotTargets }, routeFilePath);
}

function getJetBrainsRootProjectPath(routeFilePath) {
	return readProject(routeFilePath).jetBrainsRootProjectPath || '';
}

function setJetBrainsRootProjectPath(rootPath, routeFilePath, folderAnchorPath) {
	const anchorPath = folderAnchorPath
		? normalizeAnchorPath(folderAnchorPath)
		: resolveConfigAnchorPath(routeFilePath);
	if (!anchorPath) {
		return defaultProjectConfig('');
	}
	const cacheFile = getProjectCacheFilePath(anchorPath);
	const current = (cacheFile && readProjectCacheFromDisk(cacheFile)) || defaultProjectConfig(anchorPath);
	const next = {
		...current,
		version: 2,
		anchorPath,
		jetBrainsRootProjectPath: rootPath || ''
	};
	if (cacheFile) {
		writeProjectCacheToDisk(cacheFile, next);
	}
	return next;
}

function getJumpBackSource(routeFilePath) {
	return readProject(routeFilePath).jumpBackSource || '';
}

function setJumpBackSource(source, routeFilePath) {
	return writeProject({ jumpBackSource: source || '' }, routeFilePath);
}

function getSlot1Target(routeFilePath) {
	const slots = getSlotTargets(routeFilePath);
	const slot1 = slots[0];
	if (slot1 && slot1.type === 'jetbrains' && slot1.target) {
		return slot1.target;
	}
	return 'IDEA';
}

function resolveJetBrainsProjectPath(routeFilePath) {
	const configured = getJetBrainsRootProjectPath(routeFilePath);
	if (configured && fs.existsSync(configured)) {
		return path.normalize(configured);
	}
	const folder = resolvePhysicalWorkspaceFolderOnly(routeFilePath)
		|| listWorkspaceFolderPaths()[0]
		|| null;
	return folder ? path.normalize(folder) : null;
}

function notifyProjectChangeListeners() {
	projectChangeListeners.forEach((fn) => {
		try {
			fn();
		} catch (e) {
			console.warn('projectConfigStore listener error:', e.message);
		}
	});
}

function watchProjectCache(onChange) {
	if (onChange) {
		projectChangeListeners.push(onChange);
	}
	if (projectWatcher) {
		return;
	}
	const dir = getCacheRootDir();
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	try {
		projectWatcher = fs.watch(dir, (eventType, filename) => {
			if (filename && String(filename).includes(`_${PLUGIN_SUFFIX}.json`)) {
				notifyProjectChangeListeners();
			}
		});
	} catch (e) {
		console.warn('projectConfigStore: fs.watch failed', e.message);
	}
}

function disposeProjectWatcher() {
	if (projectWatcher) {
		projectWatcher.close();
		projectWatcher = null;
	}
	projectChangeListeners = [];
}

function listFolderRouteConfigs(routeFilePath) {
	const folders = listWorkspaceFolderPaths();
	if (folders.length === 0) {
		const anchorPath = resolveConfigAnchorPath(routeFilePath);
		if (!anchorPath) {
			return [];
		}
		return [{
			anchorPath,
			folderPath: anchorPath,
			folderName: path.basename(anchorPath),
			jetBrainsRootProjectPath: getJetBrainsRootProjectPath(routeFilePath)
		}];
	}
	return folders.map((folderPath) => {
		const anchorPath = normalizeAnchorPath(folderPath);
		return {
			anchorPath,
			folderPath,
			folderName: path.basename(folderPath),
			jetBrainsRootProjectPath: getJetBrainsRootProjectPath(folderPath)
		};
	});
}

module.exports = {
	readProject,
	readProjectFresh,
	projectCacheFileExists,
	writeProject,
	resolveConfigAnchorPath,
	resolveDefaultJetBrainsProjectPath: resolveJetBrainsProjectPath,
	resolveJetBrainsProjectPath,
	resolvePhysicalWorkspaceFolderOnly,
	listFolderRouteConfigs,
	getSlotTargets,
	setSlotTargets,
	getJetBrainsRootProjectPath,
	setJetBrainsRootProjectPath,
	getJumpBackSource,
	setJumpBackSource,
	getSlot1Target,
	defaultSlotTargets,
	migrateFromLegacyWorkspace,
	importLegacyWorkspaceSettings,
	watchProjectCache,
	disposeProjectWatcher
};
