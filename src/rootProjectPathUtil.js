const path = require('path');
const fs = require('fs');

const BLOCKED_FILE_EXTENSIONS = new Set([
	'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'tif', 'heic', 'heif', 'avif',
	'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf',
	'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'jar', 'war',
	'mp3', 'mp4', 'm4a', 'avi', 'mov', 'mkv', 'wav', 'flac', 'aac', 'wmv', 'webm',
	'exe', 'dll', 'so', 'dylib', 'dmg', 'pkg', 'deb', 'rpm', 'msi', 'iso',
	'ttf', 'otf', 'woff', 'woff2',
	'psd', 'ai', 'sketch'
]);

function getFileExtension(filePath) {
	const base = path.basename(filePath);
	const dot = base.lastIndexOf('.');
	if (dot <= 0) {
		return '';
	}
	return base.slice(dot + 1).toLowerCase();
}

function isBlockedProjectFile(filePath) {
	const ext = getFileExtension(filePath);
	return ext !== '' && BLOCKED_FILE_EXTENSIONS.has(ext);
}

function validateRootProjectPath(filePath) {
	if (filePath == null || String(filePath).trim() === '') {
		return { ok: true };
	}
	const trimmed = String(filePath).trim();
	if (!fs.existsSync(trimmed)) {
		return { ok: false, message: 'Path does not exist.' };
	}
	let stat;
	try {
		stat = fs.statSync(trimmed);
	} catch (_) {
		return { ok: false, message: 'Path is not accessible.' };
	}
	if (stat.isDirectory()) {
		return { ok: true };
	}
	if (isBlockedProjectFile(trimmed)) {
		const ext = getFileExtension(trimmed);
		return { ok: false, message: `File type .${ext} is not a project path (images, documents, archives, etc. are excluded).` };
	}
	return { ok: true };
}

function getRootProjectOpenDialogOptions() {
	return {
		canSelectFiles: true,
		canSelectFolders: true,
		canSelectMany: false,
		openLabel: 'Select Path',
		title: 'Select JetBrains Root Project Path (folder or project file)'
	};
}

module.exports = {
	BLOCKED_FILE_EXTENSIONS,
	getFileExtension,
	isBlockedProjectFile,
	validateRootProjectPath,
	getRootProjectOpenDialogOptions
};
