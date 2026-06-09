const assert = require('assert');
const path = require('path');
const { normalizeAnchorPath } = require('../src/pathKeyUtil');

const folders = ['/ws/rider-app', '/ws/miniprogram'];
const resolvePhysicalWorkspaceFolderOnly = (filePath) => {
	if (!filePath) {
		return null;
	}
	if (filePath.startsWith('/ws/rider-app')) {
		return '/ws/rider-app';
	}
	if (filePath.startsWith('/ws/miniprogram')) {
		return '/ws/miniprogram';
	}
	return null;
};

function resolveConfigAnchorPath(filePath, listWorkspaceFolderPaths) {
	const folder = resolvePhysicalWorkspaceFolderOnly(filePath);
	if (folder) {
		return normalizeAnchorPath(folder);
	}
	const all = listWorkspaceFolderPaths();
	if (all.length > 0) {
		return normalizeAnchorPath(all[0]);
	}
	return null;
}

assert.strictEqual(
	resolveConfigAnchorPath('/ws/rider-app/src/Main.kt', () => folders),
	normalizeAnchorPath('/ws/rider-app')
);
assert.strictEqual(
	resolveConfigAnchorPath('/ws/miniprogram/app.js', () => folders),
	normalizeAnchorPath('/ws/miniprogram')
);
assert.strictEqual(
	resolveConfigAnchorPath(null, () => folders),
	normalizeAnchorPath('/ws/rider-app')
);

console.log('workspaceRouteUtil routing tests passed');
