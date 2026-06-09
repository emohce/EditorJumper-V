const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
	isBlockedProjectFile,
	validateRootProjectPath,
	getFileExtension
} = require('../src/rootProjectPathUtil');

assert.strictEqual(getFileExtension('/tmp/MyApp.sln'), 'sln');
assert.strictEqual(getFileExtension('/tmp/project.IPR'), 'ipr');
assert.strictEqual(isBlockedProjectFile('/tmp/photo.png'), true);
assert.strictEqual(isBlockedProjectFile('/tmp/report.pdf'), true);
assert.strictEqual(isBlockedProjectFile('/tmp/MyApp.sln'), false);
assert.strictEqual(isBlockedProjectFile('/tmp/CMakeLists.txt'), false);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jumper-root-'));
assert.strictEqual(validateRootProjectPath(dir).ok, true);
assert.strictEqual(validateRootProjectPath('').ok, true);
assert.strictEqual(validateRootProjectPath('/no/such/path').ok, false);

const sln = path.join(dir, 'demo.sln');
fs.writeFileSync(sln, '');
assert.strictEqual(validateRootProjectPath(sln).ok, true);

const pdf = path.join(dir, 'doc.pdf');
fs.writeFileSync(pdf, '');
assert.strictEqual(validateRootProjectPath(pdf).ok, false);

fs.rmSync(dir, { recursive: true, force: true });
console.log('rootProjectPathUtil tests passed');
