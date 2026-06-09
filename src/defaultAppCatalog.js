const DEFAULT_JETBRAINS_APPS = [
	{ name: 'IDEA', commandPath: null, isCustom: false, hidden: false },
	{ name: 'WebStorm', commandPath: null, isCustom: false, hidden: false },
	{ name: 'PyCharm', commandPath: null, isCustom: false, hidden: false },
	{ name: 'GoLand', commandPath: null, isCustom: false, hidden: false },
	{ name: 'CLion', commandPath: null, isCustom: false, hidden: false },
	{ name: 'PhpStorm', commandPath: null, isCustom: false, hidden: false },
	{ name: 'RubyMine', commandPath: null, isCustom: false, hidden: false },
	{ name: 'Rider', commandPath: null, isCustom: false, hidden: false },
	{ name: 'Android Studio', commandPath: null, isCustom: false, hidden: false }
];

const DEFAULT_VSCODE_APPS = [
	{ name: 'Visual Studio Code', commandPath: null, isCustom: false, hidden: false },
	{ name: 'Cursor', commandPath: null, isCustom: false, hidden: false },
	{ name: 'Windsurf', commandPath: null, isCustom: false, hidden: false },
	{ name: 'Trae', commandPath: null, isCustom: false, hidden: false },
	{ name: 'Void', commandPath: null, isCustom: false, hidden: false },
	{ name: 'Kiro', commandPath: null, isCustom: false, hidden: false },
	{ name: 'Qoder', commandPath: null, isCustom: false, hidden: false },
	{ name: 'CatPawAI', commandPath: null, isCustom: false, hidden: false },
	{ name: 'Antigravity', commandPath: null, isCustom: false, hidden: false }
];

function toAppEntries(list) {
	return list.map((item) => ({
		name: item.name,
		commandPath: item.commandPath ?? null,
		isCustom: !!item.isCustom,
		hidden: !!item.hidden,
		updatedAt: null
	}));
}

function defaultJetbrainsApps() {
	return toAppEntries(DEFAULT_JETBRAINS_APPS);
}

function defaultVscodeApps() {
	return toAppEntries(DEFAULT_VSCODE_APPS);
}

module.exports = {
	DEFAULT_JETBRAINS_APPS,
	DEFAULT_VSCODE_APPS,
	defaultJetbrainsApps,
	defaultVscodeApps,
	toAppEntries
};
