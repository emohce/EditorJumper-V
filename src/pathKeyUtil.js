const crypto = require('crypto');
const path = require('path');

function normalizeAnchorPath(anchorPath) {
	if (!anchorPath || typeof anchorPath !== 'string') {
		return '';
	}
	let resolved = path.resolve(anchorPath.trim());
	resolved = resolved.replace(/\\/g, '/');
	if (process.platform === 'win32' && /^[a-zA-Z]:/.test(resolved)) {
		resolved = resolved.charAt(0).toLowerCase() + resolved.slice(1);
	}
	return resolved;
}

function computeConfigKey(anchorPath) {
	const normalized = normalizeAnchorPath(anchorPath);
	if (!normalized) {
		return '';
	}
	return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex').substring(0, 16);
}

function buildProjectCacheFileName(configKey, anchorPath, pluginSuffix) {
	const base = path.basename(anchorPath) || 'project';
	const safeBase = base.replace(/[^a-zA-Z0-9._-]+/g, '_');
	return `${configKey}_${safeBase}_${pluginSuffix}.json`;
}

module.exports = {
	normalizeAnchorPath,
	computeConfigKey,
	buildProjectCacheFileName
};
