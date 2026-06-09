const os = require('os');
const path = require('path');

function getCacheRootDir() {
	const platform = process.platform;
	if (platform === 'darwin') {
		return path.join(os.homedir(), 'Library', 'Caches', 'EzEditorJumper');
	}
	if (platform === 'win32') {
		const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
		return path.join(localAppData, 'EzEditorJumper', 'cache');
	}
	const xdg = process.env.XDG_CACHE_HOME;
	const base = xdg && xdg.trim() ? xdg : path.join(os.homedir(), '.cache');
	return path.join(base, 'EzEditorJumper');
}

function getSharedAppsPath() {
	return path.join(getCacheRootDir(), 'shared-apps.json');
}

module.exports = {
	getCacheRootDir,
	getSharedAppsPath
};
