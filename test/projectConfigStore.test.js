const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const vscodeStubPath = path.join(__dirname, '.vscode-stub-project.js');
fs.writeFileSync(vscodeStubPath, `
module.exports = {
	workspace: {
		workspaceFolders: null,
		workspaceFile: undefined,
		getWorkspaceFolder() { return undefined; },
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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jumper-project-'));
const anchorPath = path.join(tmpDir, 'demo-project');
fs.mkdirSync(anchorPath, { recursive: true });

const cachePathsPath = require.resolve('../src/cachePaths');
delete require.cache[cachePathsPath];
const cachePaths = require('../src/cachePaths');
cachePaths.getCacheRootDir = () => tmpDir;

const workspaceRouteUtilPath = require.resolve('../src/workspaceRouteUtil');
delete require.cache[workspaceRouteUtilPath];
const workspaceRouteUtil = require('../src/workspaceRouteUtil');
workspaceRouteUtil.resolveConfigAnchorPath = () => anchorPath;
workspaceRouteUtil.resolveRouteFilePath = () => path.join(anchorPath, 'file.ts');
workspaceRouteUtil.listWorkspaceFolderPaths = () => [anchorPath];
workspaceRouteUtil.resolvePhysicalWorkspaceFolderOnly = () => anchorPath;

const projectConfigStorePath = require.resolve('../src/projectConfigStore');
delete require.cache[projectConfigStorePath];
const projectConfigStore = require('../src/projectConfigStore');

const routeFile = path.join(anchorPath, 'file.ts');

assert.strictEqual(projectConfigStore.projectCacheFileExists(routeFile), false);

projectConfigStore.setSlotTargets([
	{ slot: 1, type: 'jetbrains', target: 'WebStorm' },
	{ slot: 2, type: 'vscode-app', target: 'Cursor' },
	{ slot: 3, type: 'vscode-app', target: 'Windsurf' }
], routeFile);

assert.strictEqual(projectConfigStore.projectCacheFileExists(routeFile), true);

const fresh = projectConfigStore.readProjectFresh(routeFile);
assert.strictEqual(fresh.slotTargets[0].target, 'WebStorm');

let watchFired = false;
projectConfigStore.watchProjectCache(() => {
	watchFired = true;
});

projectConfigStore.setSlotTargets([
	{ slot: 1, type: 'jetbrains', target: 'IDEA' },
	{ slot: 2, type: 'vscode-app', target: 'Cursor' },
	{ slot: 3, type: 'vscode-app', target: 'Windsurf' }
], routeFile);

setTimeout(() => {
	assert.strictEqual(watchFired, true, 'watchProjectCache should notify on file change');
	projectConfigStore.disposeProjectWatcher();
	fs.rmSync(tmpDir, { recursive: true, force: true });
	fs.unlinkSync(vscodeStubPath);
	console.log('projectConfigStore tests passed');
}, 100);
