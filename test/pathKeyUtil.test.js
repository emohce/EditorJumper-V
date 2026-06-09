const assert = require('assert');
const { normalizeAnchorPath, computeConfigKey, buildProjectCacheFileName } = require('../src/pathKeyUtil');

const path = '/Users/test/myproject';
assert.strictEqual(normalizeAnchorPath(path), '/Users/test/myproject');
assert.strictEqual(computeConfigKey(path), computeConfigKey(path));
assert.ok(buildProjectCacheFileName(computeConfigKey(path), path, 'jumper-v').endsWith('_jumper-v.json'));
console.log('pathKeyUtil tests passed');
