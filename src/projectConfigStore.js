const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { getCacheRootDir } = require('./cachePaths');
const { normalizeAnchorPath, computeConfigKey, buildProjectCacheFileName } = require('./pathKeyUtil');
const { parseCodeWorkspaceFolderPaths } = require('./codeWorkspaceUtil');

const PLUGIN_SUFFIX = 'jumper-v';

function defaultSlotTargets() {
	return [
		{ slot: 1, type: 'jetbrains', target: 'IDEA' },
		{ slot: 2, type: 'vscode-app', target: 'Cursor' },
		{ slot: 3, type: 'vscode-app', target: 'Windsurf' }
	];
}

function resolvePhysicalWorkspaceFolderOnly(filePath) {
	if (filePath) {
		const fileUri = vscode.Uri.file(filePath);
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
		if (workspaceFolder) {
			return workspaceFolder.uri.fsPath;
		}
	}
	if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
		return vscode.workspace.workspaceFolders[0].uri.fsPath;
	}
	const wf = vscode.workspace.workspaceFile;
	if (wf && wf.scheme === 'file' && fs.existsSync(wf.fsPath) && wf.fsPath.endsWith('.code-workspace')) {
		const folders = parseCodeWorkspaceFolderPaths(wf.fsPath);
		if (folders.length > 0 && fs.existsSync(folders[0])) {
			return folders[0];
		}
	}
	return null;
}

function resolveDefaultJetBrainsProjectPath(filePath) {
	return resolvePhysicalWorkspaceFolderOnly(filePath);
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

function readJetBrainsRootOverride(filePath) {
	const config = vscode.workspace.getConfiguration('editorjumper');
	const legacy = readLegacyString(config, 'jetBrainsRootProjectPath');
	if (legacy && fs.existsSync(legacy)) {
		return legacy;
	}
	const tentative = resolvePhysicalWorkspaceFolderOnly(filePath);
	if (!tentative) {
		const wf = vscode.workspace.workspaceFile;
		if (wf && wf.scheme === 'file') {
			const cacheFile = getProjectCacheFilePath(wf.fsPath);
			const cached = cacheFile ? readProjectCacheFromDisk(cacheFile) : null;
			if (cached && cached.jetBrainsRootProjectPath && fs.existsSync(cached.jetBrainsRootProjectPath)) {
				return cached.jetBrainsRootProjectPath;
			}
		}
		return '';
	}
	const cacheFile = getProjectCacheFilePath(tentative);
	const cached = cacheFile ? readProjectCacheFromDisk(cacheFile) : null;
	if (cached && cached.jetBrainsRootProjectPath && fs.existsSync(cached.jetBrainsRootProjectPath)) {
		return cached.jetBrainsRootProjectPath;
	}
	return '';
}

function resolveAnchorPath(filePath) {
	const jetRoot = readJetBrainsRootOverride(filePath);
	if (jetRoot) {
		return jetRoot;
	}
	const wf = vscode.workspace.workspaceFile;
	if (wf && wf.scheme === 'file' && fs.existsSync(wf.fsPath)) {
		return wf.fsPath;
	}
	const folder = resolvePhysicalWorkspaceFolderOnly(filePath);
	return folder || null;
}

function migrateFromLegacyWorkspace() {
	const config = vscode.workspace.getConfiguration('editorjumper');
	const slotTargets = readLegacySlotTargets(config);
	const jetBrainsRoot = readLegacyString(config, 'jetBrainsRootProjectPath');
	const jumpBackSource = readLegacyString(config, 'jumpBackSource');
	const anchorPath = resolveAnchorPath();
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
		version: 1,
		anchorPath: anchorPath ? normalizeAnchorPath(anchorPath) : '',
		jetBrainsRootProjectPath: jetBrainsRoot || '',
		slotTargets: mergedSlots,
		jumpBackSource: jumpBackSource || ''
	};
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
	const anchorPath = resolveAnchorPath();
	if (!anchorPath) {
		return false;
	}
	const data = migrateFromLegacyWorkspace();
	data.anchorPath = normalizeAnchorPath(anchorPath);
	const cacheFile = getProjectCacheFilePath(anchorPath);
	if (cacheFile) {
		writeProjectCacheToDisk(cacheFile, data);
		console.log('projectConfigStore: imported legacy workspace settings');
	}
	return true;
}

function readProject(filePath) {
	const anchorPath = resolveAnchorPath(filePath);
	if (!anchorPath) {
		return migrateFromLegacyWorkspace();
	}
	const cacheFile = getProjectCacheFilePath(anchorPath);
	let data = cacheFile ? readProjectCacheFromDisk(cacheFile) : null;
	if (!data) {
		data = migrateFromLegacyWorkspace();
		data.anchorPath = normalizeAnchorPath(anchorPath);
		if (cacheFile) {
			writeProjectCacheToDisk(cacheFile, data);
			console.log('projectConfigStore: migrated from legacy workspace settings');
		}
	}
	return data;
}

function writeProject(patch, filePath) {
	const current = readProject(filePath);
	const anchorPath = patch.anchorPath || current.anchorPath || normalizeAnchorPath(resolveAnchorPath(filePath) || '');
	const next = {
		version: 1,
		anchorPath,
		jetBrainsRootProjectPath: patch.jetBrainsRootProjectPath !== undefined ? patch.jetBrainsRootProjectPath : current.jetBrainsRootProjectPath,
		slotTargets: patch.slotTargets || current.slotTargets || defaultSlotTargets(),
		jumpBackSource: patch.jumpBackSource !== undefined ? patch.jumpBackSource : current.jumpBackSource
	};
	const cacheFile = getProjectCacheFilePath(anchorPath);
	if (cacheFile) {
		writeProjectCacheToDisk(cacheFile, next);
	}
	return next;
}

function getSlotTargets(filePath) {
	const project = readProject(filePath);
	return project.slotTargets || defaultSlotTargets();
}

function setSlotTargets(slotTargets, filePath) {
	return writeProject({ slotTargets }, filePath);
}

function getJetBrainsRootProjectPath(filePath) {
	return readProject(filePath).jetBrainsRootProjectPath || '';
}

function setJetBrainsRootProjectPath(rootPath, filePath) {
	return writeProject({ jetBrainsRootProjectPath: rootPath || '' }, filePath);
}

function getJumpBackSource(filePath) {
	return readProject(filePath).jumpBackSource || '';
}

function setJumpBackSource(source, filePath) {
	return writeProject({ jumpBackSource: source || '' }, filePath);
}

function getSlot1Target(filePath) {
	const slots = getSlotTargets(filePath);
	const slot1 = slots[0];
	if (slot1 && slot1.type === 'jetbrains' && slot1.target) {
		return slot1.target;
	}
	return 'IDEA';
}

module.exports = {
	readProject,
	writeProject,
	resolveAnchorPath,
	resolveDefaultJetBrainsProjectPath,
	resolvePhysicalWorkspaceFolderOnly,
	getSlotTargets,
	setSlotTargets,
	getJetBrainsRootProjectPath,
	setJetBrainsRootProjectPath,
	getJumpBackSource,
	setJumpBackSource,
	getSlot1Target,
	defaultSlotTargets,
	migrateFromLegacyWorkspace,
	importLegacyWorkspaceSettings
};
