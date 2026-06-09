const fs = require('fs');
const path = require('path');

function parseCodeWorkspaceFolderPaths(wsFilePath) {
	let text;
	try {
		text = fs.readFileSync(wsFilePath, 'utf8');
	} catch (_) {
		return [];
	}
	const base = path.dirname(path.resolve(wsFilePath));
	const paths = [];
	const re = /"path"\s*:\s*"([^"]+)"/g;
	let m;
	while ((m = re.exec(text)) !== null) {
		let p = m[1].trim();
		if (!p) {
			continue;
		}
		if (!path.isAbsolute(p)) {
			p = path.join(base, p);
		}
		paths.push(path.normalize(p));
	}
	return paths;
}

module.exports = {
	parseCodeWorkspaceFolderPaths
};
