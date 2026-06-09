const vscode = require('vscode');
const globalConfigStore = require('./globalConfigStore');
const projectConfigStore = require('./projectConfigStore');

const LEGACY_GLOBAL_KEYS = ['ideConfigurations', 'vscodeAppConfigurations'];
const LEGACY_WORKSPACE_KEYS = ['slotTargets', 'jetBrainsRootProjectPath', 'jumpBackSource', 'selectedIDE'];

function inspectHasValue(inspected) {
	if (!inspected) {
		return false;
	}
	return inspected.globalValue !== undefined
		|| inspected.workspaceValue !== undefined
		|| inspected.workspaceFolderValue !== undefined;
}

function hasLegacyGlobalSettings() {
	const config = vscode.workspace.getConfiguration('editorjumper');
	return LEGACY_GLOBAL_KEYS.some((key) => inspectHasValue(config.inspect(key)));
}

function hasLegacyWorkspaceSettings() {
	const config = vscode.workspace.getConfiguration('editorjumper');
	return LEGACY_WORKSPACE_KEYS.some((key) => inspectHasValue(config.inspect(key)));
}

async function clearConfigKey(key, targets) {
	const config = vscode.workspace.getConfiguration('editorjumper');
	for (const target of targets) {
		if (target === vscode.ConfigurationTarget.WorkspaceFolder && vscode.workspace.workspaceFolders) {
			for (const folder of vscode.workspace.workspaceFolders) {
				await config.update(key, undefined, target, folder);
			}
			continue;
		}
		await config.update(key, undefined, target);
	}
}

async function clearLegacyGlobalSettings() {
	const targets = [vscode.ConfigurationTarget.Global, vscode.ConfigurationTarget.Workspace];
	for (const key of LEGACY_GLOBAL_KEYS) {
		await clearConfigKey(key, targets);
	}
	await clearConfigKey('selectedIDE', targets);
}

async function clearLegacyWorkspaceSettings() {
	const targets = [vscode.ConfigurationTarget.Workspace, vscode.ConfigurationTarget.WorkspaceFolder];
	for (const key of LEGACY_WORKSPACE_KEYS) {
		await clearConfigKey(key, targets);
	}
}

async function runLegacyConfigMigration() {
	let migrated = false;
	if (hasLegacyGlobalSettings()) {
		if (globalConfigStore.importLegacyUserSettings()) {
			migrated = true;
		}
		await clearLegacyGlobalSettings();
	}
	if (hasLegacyWorkspaceSettings()) {
		if (projectConfigStore.importLegacyWorkspaceSettings()) {
			migrated = true;
		}
		await clearLegacyWorkspaceSettings();
	}
	return migrated;
}

module.exports = {
	runLegacyConfigMigration,
	hasLegacyGlobalSettings,
	hasLegacyWorkspaceSettings
};
