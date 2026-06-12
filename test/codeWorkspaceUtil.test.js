const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseCodeWorkspaceFolderPaths } = require('../src/codeWorkspaceUtil');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jumper-ws-'));
const wsFile = path.join(dir, 'demo.code-workspace');
fs.writeFileSync(wsFile, JSON.stringify({
	folders: [
		{ path: 'project-a' },
		{ path: '/abs/project-b' }
	]
}, null, 2));
fs.mkdirSync(path.join(dir, 'project-a'));

const folders = parseCodeWorkspaceFolderPaths(wsFile);
assert.strictEqual(folders.length, 2);
assert.strictEqual(folders[0], path.normalize(path.join(dir, 'project-a')));
assert.strictEqual(folders[1], path.normalize('/abs/project-b'));

fs.rmSync(dir, { recursive: true, force: true });
console.log('codeWorkspaceUtil tests passed');
