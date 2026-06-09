const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { normalizeAnchorPath } = require('./pathKeyUtil');
const { parseCodeWorkspaceFolderPaths } = require('./codeWorkspaceUtil');

function resolveRouteFilePath(uri) {
	if (uri && uri.scheme === 'file' && uri.fsPath) {
		return uri.fsPath;
	}
	const editor = vscode.window.activeTextEditor;
	if (editor && editor.document.uri.scheme === 'file') {
		return editor.document.uri.fsPath;
	}
	return null;
}

function listWorkspaceFolderPaths() {
	if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
		return vscode.workspace.workspaceFolders.map((folder) => folder.uri.fsPath);
	}
	const wf = vscode.workspace.workspaceFile;
	if (wf && wf.scheme === 'file' && wf.fsPath.endsWith('.code-workspace')) {
		return parseCodeWorkspaceFolderPaths(wf.fsPath).filter((p) => fs.existsSync(p));
	}
	return [];
}

function resolvePhysicalWorkspaceFolderOnly(filePath) {
	if (filePath) {
		const fileUri = vscode.Uri.file(filePath);
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
		if (workspaceFolder) {
			return workspaceFolder.uri.fsPath;
		}
	}
	return null;
}

function resolveConfigAnchorPath(filePath) {
	const folder = resolvePhysicalWorkspaceFolderOnly(filePath);
	if (folder) {
		return normalizeAnchorPath(folder);
	}
	const folders = listWorkspaceFolderPaths();
	if (folders.length > 0) {
		return normalizeAnchorPath(folders[0]);
	}
	return null;
}

function resolveRouteContext(uri) {
	const filePath = resolveRouteFilePath(uri);
	const workspaceFolderPath = resolvePhysicalWorkspaceFolderOnly(filePath)
		|| listWorkspaceFolderPaths()[0]
		|| null;
	const anchorPath = workspaceFolderPath ? normalizeAnchorPath(workspaceFolderPath) : resolveConfigAnchorPath(filePath);
	return {
		filePath,
		workspaceFolderPath,
		anchorPath
	};
}

module.exports = {
	resolveRouteFilePath,
	listWorkspaceFolderPaths,
	resolvePhysicalWorkspaceFolderOnly,
	resolveConfigAnchorPath,
	resolveRouteContext
};
