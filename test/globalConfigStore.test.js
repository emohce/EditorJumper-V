const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const vscodeStubPath = path.join(__dirname, '.vscode-stub.js');
fs.writeFileSync(vscodeStubPath, `
module.exports = {
	workspace: {
		getConfiguration() {
			return {
				inspect() { return undefined; },
				get() { return undefined; }
			};
		}
	}
};
`);
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
	if (request === 'vscode') {
		return vscodeStubPath;
	}
	return originalResolveFilename.call(this, request, parent, isMain, options);
};

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jumper-apps-'));
const appsFile = path.join(tmpDir, 'shared-apps.json');

const cachePathsPath = require.resolve('../src/cachePaths');
delete require.cache[cachePathsPath];
const cachePaths = require('../src/cachePaths');
const originalGetCacheRootDir = cachePaths.getCacheRootDir;
const originalGetSharedAppsPath = cachePaths.getSharedAppsPath;
cachePaths.getCacheRootDir = () => tmpDir;
cachePaths.getSharedAppsPath = () => appsFile;

const globalConfigStorePath = require.resolve('../src/globalConfigStore');
delete require.cache[globalConfigStorePath];
const globalConfigStore = require('../src/globalConfigStore');

function resetApps(data) {
	fs.writeFileSync(appsFile, JSON.stringify(data, null, 2), 'utf8');
	globalConfigStore.invalidateCache();
}

resetApps({
	version: 1,
	revision: 0,
	jetbrainsApps: [
		{ name: 'IDEA', commandPath: null, isCustom: false, hidden: false, updatedAt: null },
		{ name: 'CustomJB', commandPath: '/jb', isCustom: true, hidden: false, updatedAt: null }
	],
	vscodeApps: [
		{ name: 'Cursor', commandPath: null, isCustom: false, hidden: false, updatedAt: null },
		{ name: 'CustomVS', commandPath: '/vs', isCustom: true, hidden: false, updatedAt: null }
	],
	jumperExtras: {
		shortcutSlot1: '',
		shortcutSlot2: '',
		shortcutSlot3: '',
		selectedEditorType: ''
	}
});

globalConfigStore.removeApp('jetbrains', 'CustomJB');
let apps = globalConfigStore.readApps(true);
assert.strictEqual(apps.jetbrainsApps.some((item) => item.name === 'CustomJB'), false);
assert.strictEqual(apps.jetbrainsApps.some((item) => item.name === 'IDEA'), true);
assert.strictEqual(apps.vscodeApps.some((item) => item.name === 'CustomVS'), true);

globalConfigStore.removeApp('vscode', 'CustomVS');
apps = globalConfigStore.readApps(true);
assert.strictEqual(apps.vscodeApps.some((item) => item.name === 'CustomVS'), false);
assert.strictEqual(apps.jetbrainsApps.some((item) => item.name === 'IDEA'), true);

globalConfigStore.upsertApp('jetbrains', {
	name: 'OnlyJetBrains',
	commandPath: '/only-jb',
	isCustom: true,
	hidden: false
});
apps = globalConfigStore.readApps(true);
assert.strictEqual(apps.jetbrainsApps.some((item) => item.name === 'OnlyJetBrains'), true);
assert.strictEqual(apps.vscodeApps.some((item) => item.name === 'OnlyJetBrains'), false);

cachePaths.getCacheRootDir = originalGetCacheRootDir;
cachePaths.getSharedAppsPath = originalGetSharedAppsPath;
Module._resolveFilename = originalResolveFilename;
fs.rmSync(tmpDir, { recursive: true, force: true });
fs.rmSync(vscodeStubPath, { force: true });
console.log('globalConfigStore tests passed');
