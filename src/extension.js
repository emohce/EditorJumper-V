const vscode = require('vscode');
const { exec, execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const defaultIDEPaths = require('./defaultIDEPaths');
const { ideConfigs, vscodeAppConfigs, smartPeerMap } = require('./defaultIDEPaths');
const { normalizeVscodeAppName } = require('./defaultIDEPaths');
const globalConfigStore = require('./globalConfigStore');
const projectConfigStore = require('./projectConfigStore');
const slotPickerView = require('./slotPickerView');
const { runLegacyConfigMigration } = require('./legacyConfigMigration');
let configPanel = require('./configPanel');

let statusBarItem;
let extensionContext;

function normalizeSlotMenuTargetName(targetName) {
	if (!targetName || typeof targetName !== 'string') {
		return 'generic';
	}
	const normalized = normalizeVscodeAppName(targetName);
	if (normalized === 'Cursor') {
		return 'cursor';
	}
	if (normalized === 'Windsurf') {
		return 'windsurf';
	}
	if (normalized === 'Visual Studio Code') {
		return 'vscode';
	}
	return 'generic';
}

async function updateSlotMenuContexts() {
	const slotTargets = projectConfigStore.getSlotTargets();
	const slot2 = slotTargets[1] || {};
	const slot3 = slotTargets[2] || {};
	await vscode.commands.executeCommand('setContext', 'editorjumper.slot2MenuTarget', normalizeSlotMenuTargetName(slot2.target));
	await vscode.commands.executeCommand('setContext', 'editorjumper.slot3MenuTarget', normalizeSlotMenuTargetName(slot3.target));
}

function ensureDefaultSlotTargets() {
	const slots = projectConfigStore.getSlotTargets();
	let changed = false;
	const next = [...slots];
	if (!next[1] || !next[1].target) {
		next[1] = { slot: 2, type: 'vscode-app', target: 'Cursor' };
		changed = true;
	}
	if (!next[2] || !next[2].target) {
		next[2] = { slot: 3, type: 'vscode-app', target: 'Windsurf' };
		changed = true;
	}
	if (!next[0] || !next[0].target) {
		next[0] = { slot: 1, type: 'jetbrains', target: 'IDEA' };
		changed = true;
	}
	if (changed) {
		projectConfigStore.setSlotTargets(next);
	}
}

function getCurrentVscodeAppName() {
	return normalizeVscodeAppName(vscode.env.appName);
}

// 添加Xcode的默认路径
if (!defaultIDEPaths['Xcode']) {
	defaultIDEPaths['Xcode'] = {
		darwin: '/Applications/Xcode.app/Contents/MacOS/Xcode'
	};
}

/**
 * 检测当前工作区应该使用的 VSCode-based app
 * @returns {string} 推荐的 VSCode app 名称
 */
function detectPreferredVscodeApp() {
	const currentAppName = getCurrentVscodeAppName();
	
	// 如果当前就是 VSCode-based app，优先返回对等编辑器
	if (smartPeerMap[currentAppName]) {
		return smartPeerMap[currentAppName];
	}
	
	// 默认返回 Cursor
	return 'Cursor';
}

/**
 * 自动检测项目类型并返回推荐的 JetBrains IDE
 * @param {string} projectPath 项目路径
 * @returns {string|null} 推荐的 IDE 名称，如果无法检测则返回 null
 */
function detectProjectType(projectPath) {
	if (!projectPath || !fs.existsSync(projectPath)) {
		return null;
	}

	const filesToCheck = [
		// Java/IDEA
		{ files: ['pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'], ide: 'IDEA' },
		// Python/PyCharm
		{ files: ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile', 'poetry.lock', 'tox.ini'], ide: 'PyCharm' },
		// Go/GoLand
		{ files: ['go.mod', 'go.sum'], ide: 'GoLand' },
		// JavaScript/TypeScript/WebStorm
		{ files: ['package.json', 'tsconfig.json', 'angular.json', 'vue.config.js', 'vite.config.ts'], ide: 'WebStorm' },
		// PHP/PhpStorm
		{ files: ['composer.json', 'phpunit.xml', '.phpcs.xml'], ide: 'PhpStorm' },
		// Ruby/RubyMine
		{ files: ['Gemfile', 'Rakefile', 'config.ru'], ide: 'RubyMine' },
		// C/C++/CLion
		{ files: ['CMakeLists.txt', 'Makefile', 'configure.ac', 'meson.build'], ide: 'CLion' },
		// .NET/Rider
		{ files: ['*.csproj', '*.sln', 'project.json', 'global.json'], ide: 'Rider' },
		// Android/Android Studio
		{ files: ['AndroidManifest.xml', 'build.gradle', 'app/build.gradle'], ide: 'Android Studio' }
	];

	for (const { files, ide } of filesToCheck) {
		for (const file of files) {
			// Handle glob patterns
			if (file.includes('*')) {
				try {
					const dirContents = fs.readdirSync(projectPath);
					const regex = new RegExp('^' + file.replace('*', '.*'));
					if (dirContents.some(f => regex.test(f))) {
						console.log(`Detected project type: ${ide} (found ${file})`);
						return ide;
					}
				} catch (e) {
					// Ignore errors
				}
			} else {
				const filePath = path.join(projectPath, file);
				if (fs.existsSync(filePath)) {
					console.log(`Detected project type: ${ide} (found ${file})`);
					return ide;
				}
			}
		}
	}

	return null;
}

/**
 * 查找命令的完整路径
 * @param {string} command 命令名称
 * @returns {string} 命令的完整路径，如果找不到则返回原命令
 */
function findCommandPath(command) {
	try {
		// 如果命令已经是绝对路径，直接返回
		if (path.isAbsolute(command) && fs.existsSync(command)) {
			return command;
		}
		
		// 尝试使用which命令查找绝对路径
		if (process.platform === 'darwin' || process.platform === 'linux') {
			try {
				const whichOutput = execSync(`which ${command}`, { encoding: 'utf8' }).trim();
				if (whichOutput && fs.existsSync(whichOutput)) {
					console.log(`Found absolute path for ${command}: ${whichOutput}`);
					return whichOutput;
				}
			} catch (e) {
				// which命令失败，继续使用原始命令（静默失败，因为我们会搜索常见路径）
				// console.log(`Could not find absolute path for ${command}: ${e.message}`);
			}
		}
		
		// 常见的IDE命令路径
		const commonPaths = [
			'/usr/local/bin',
			'/usr/bin',
			'/opt/homebrew/bin',
			`${os.homedir()}/bin`,
			'/Applications/JetBrains Toolbox',
			`${os.homedir()}/Applications/JetBrains Toolbox`,
			`${os.homedir()}/Library/Application Support/JetBrains/Toolbox/scripts`
		];
		
		// 在每个路径中查找命令
		for (const dir of commonPaths) {
			if (!fs.existsSync(dir)) continue;
			
			const possiblePath = path.join(dir, command);
			if (fs.existsSync(possiblePath)) {
				console.log(`Found command at: ${possiblePath}`);
				return possiblePath;
			}
		}
		
		// 如果找不到，返回原命令
		return command;
	} catch (error) {
		console.error('Error finding command path:', error);
		return command;
	}
}

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
	console.log('Congratulations, your extension "editorjumper" is now active!');
	extensionContext = context;

	// 在activate函数中加载configPanel模块，避免循环引用
	configPanel = require('./configPanel');

	// 状态栏入口：点击弹出 Slot 选择菜单
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.command = 'editorjumper.pickSlotToJump';
	context.subscriptions.push(statusBarItem);

	updateStatusBar();

	// 注册命令：在JetBrains中打开
	let openInJetBrainsCommand = vscode.commands.registerCommand('editorjumper.openInJetBrains', async (uri) => {
		await openInJetBrainsInternal(uri, false);
	});

	// 注册命令：在JetBrains中打开（快速模式）
	let openInJetBrainsFastCommand = vscode.commands.registerCommand('editorjumper.openInJetBrainsFast', async (uri) => {
		await openInJetBrainsInternal(uri, true);
	});

	/**
	 * 获取IDE配置信息
	 * @param {string} ideName IDE名称
	 * @returns {object|null} IDE配置对象，如果不支持则返回null
	 */
	function getIDEConfig(ideName) {
		return ideConfigs[ideName] || null;
	}

	/**
	 * 获取IDE对应的URL scheme
	 * @param {string} ideName IDE名称
	 * @returns {string|null} URL scheme，如果不支持则返回null
	 */
	function getUrlSchemeForIDE(ideName) {
		const config = getIDEConfig(ideName);
		return config ? config.urlScheme : null;
	}

	/**
	 * 获取IDE在macOS系统中的第一个已安装的应用程序名称
	 * @param {string} ideName IDE名称
	 * @returns {string} macOS应用程序名称
	 */
	function getMacAppNameForIDE(ideName) {
		const config = getIDEConfig(ideName);
		if (config && config.macAppNames && config.macAppNames.length > 0) {
			// 定义常见的应用程序安装路径
			const commonBasePaths = [
				'/Applications',
				`${os.homedir()}/Applications`
			];
			
			// 检查每个应用程序名称，返回第一个已安装的
			for (const appName of config.macAppNames) {
				for (const basePath of commonBasePaths) {
					try {
						// 构建完整的应用程序路径
						const appPath = path.join(basePath, appName);
						// 检查应用程序是否存在
						if (fs.existsSync(appPath)) {
							console.log(`Found installed app at: ${appPath}`);
							// 返回应用程序名称，去掉.app后缀
							return appName.replace('.app', '');
						}
					} catch (error) {
						console.log(`Error checking app ${appName} at ${basePath}:`, error);
					}
				}
			}
			// 如果没有找到已安装的应用，返回第一个应用程序名称（作为降级方案）
			console.log(`No installed app found for ${ideName}, using first option: ${config.macAppNames[0]}`);
			return config.macAppNames[0].replace('.app', '');
		}
		// 对于未知的IDE，返回原名称
		return ideName;
	}

	/**
	 * 检查IDE是否支持快速模式
	 * @param {string} ideName IDE名称
	 * @returns {boolean} 是否支持快速模式
	 */
	function isFastModeSupported(ideName) {
		const config = getIDEConfig(ideName);
		return config ? config.supportsFastMode : false;
	}

	// 内部函数：在JetBrains中打开的实际逻辑
	async function openInJetBrainsInternal(uri, fastMode = false, targetOverride = null) {
		const ideConfigurations = globalConfigStore.getIdeConfigurations();
		let slot1Target = targetOverride || projectConfigStore.getSlot1Target();
		let ideConfig = ideConfigurations.find(ide => ide.name === slot1Target);

		// 如果 slot1 未配置，尝试自动检测项目类型
		if (!ideConfig) {
			const projectPath = resolveProjectPath();
			if (projectPath) {
				const detectedIDE = detectProjectType(projectPath);
				if (detectedIDE) {
					const detectedConfig = ideConfigurations.find(ide => ide.name === detectedIDE);
					if (detectedConfig) {
						slot1Target = detectedIDE;
						ideConfig = detectedConfig;
						const slots = projectConfigStore.getSlotTargets();
						slots[0] = { slot: 1, type: 'jetbrains', target: detectedIDE };
						projectConfigStore.setSlotTargets(slots);
						updateStatusBar();
						vscode.window.showInformationMessage(`Auto-detected project type: ${detectedIDE}`);
					}
				}
			}
		}

		if (!ideConfig) {
			vscode.window.showErrorMessage('Please select a JetBrains IDE first');
			return;
		}

		let filePath;
		let lineNumber = 1;
		let columnNumber = 1;
		const editor = vscode.window.activeTextEditor;

		if (uri) {
			filePath = uri.fsPath;
			if (editor && editor.document.uri.fsPath === filePath) {
				lineNumber = editor.selection.active.line + 1;
				columnNumber = editor.selection.active.character
			}
		} else if (editor) {
			filePath = editor.document.uri.fsPath;
			lineNumber = editor.selection.active.line + 1;
			columnNumber = editor.selection.active.character
		}

		// 获取项目根目录
		let projectPath;
		const jetBrainsRoot = projectConfigStore.getJetBrainsRootProjectPath(filePath);
		if (jetBrainsRoot && typeof jetBrainsRoot === 'string' && jetBrainsRoot.trim() !== '') {
			// 已配置 JetBrains 根项目路径时，统一使用该路径（多模块/多工作目录场景）
			projectPath = path.normalize(jetBrainsRoot.trim());
		} else {
			projectPath = projectConfigStore.resolveDefaultJetBrainsProjectPath(filePath);
			if (!projectPath) {
				vscode.window.showErrorMessage('No workspace folder is open. Please open a project first.');
				return;
			}
		}

		projectConfigStore.setJumpBackSource(getCurrentVscodeAppName(), filePath);

		// 获取命令路径
		let commandPath = '';
		const platform = process.platform;
		// 获取命令路径，优先使用用户配置的路径，否则使用默认路径
		commandPath = ideConfig.commandPath || defaultIDEPaths[ideConfig.name]?.[platform];

		// 如果没有找到命令路径，提示用户配置
		if (!commandPath) {
			const result = await vscode.window.showErrorMessage(
				`Path for ${ideConfig.name} is not configured. Would you like to configure it now?`,
				'Configure', 'Cancel'
			);

			if (result === 'Configure') {
				configPanel.createConfigurationPanel(context);
				// 高亮显示需要配置的IDE
				configPanel.highlightIDE(ideConfig.name);
			}
			return;
		}

		// 判断命令路径是否为文件路径
		const commandPathIsFilePath = commandPath.includes('/') || commandPath.includes('\\');
		const fileExists = commandPathIsFilePath && fs.existsSync(commandPath);
		
		// 如果命令不是绝对路径，尝试查找绝对路径
		if (!commandPathIsFilePath && platform !== 'win32') {
			// 使用findCommandPath函数查找命令的完整路径
			const fullPath = findCommandPath(commandPath);
			if (fullPath !== commandPath) {
				console.log(`Found command path: ${fullPath}`);
				commandPath = fullPath;
			}
		}

		// 执行命令
		executeCommand(commandPath, projectPath, filePath, lineNumber, columnNumber, ideConfig, platform, commandPathIsFilePath, fastMode);
	}

	/**
	 * 统一的命令执行方法
	 */
	function executeCommand(commandPath, projectPath, filePath, lineNumber, columnNumber, ideConfig, platform, commandPathIsFilePath, fastMode) {
		console.log('Executing command with path:', commandPath, 'Fast mode:', fastMode);
		
		try {
			// 判断是否使用快速模式（macOS上的快速模式且IDE支持快速模式）
			const urlScheme = getUrlSchemeForIDE(ideConfig.name);
			const supportsFast = isFastModeSupported(ideConfig.name);
			const useFastMode = fastMode && platform === 'darwin' && supportsFast;
			
			if (fastMode && platform === 'darwin' && !supportsFast) {
				console.log(`IDE "${ideConfig.name}" does not support fast mode, falling back to standard mode`);
			}
			
		if (useFastMode) {
			// macOS快速模式：使用 open -a 命令
			executeFastMode(commandPath, filePath, lineNumber, columnNumber, ideConfig, projectPath, urlScheme);
		} else if (ideConfig.name === 'Xcode' && platform === 'darwin') {
			// Xcode特殊处理
			executeXcodeCommand(projectPath, filePath, lineNumber);
		} else {
			// 标准模式：打开项目+文件
			executeStandardMode(commandPath, projectPath, filePath, lineNumber, columnNumber, ideConfig, platform, commandPathIsFilePath);
		}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to start IDE process: ${error.message}`);
		}
	}

	/**
	 * 快速模式：macOS 使用 open -a 命令
	 */
	function executeFastMode(commandPath, filePath, lineNumber, columnNumber, ideConfig, projectPath, urlScheme) {
		// 获取macOS系统中的应用程序名称
		const macAppName = getMacAppNameForIDE(ideConfig.name);
		
		// 如果没有指定文件，直接打开项目
		if (!filePath) {
			const fullCommand = `open -a "${macAppName}" "${projectPath}"`;
			console.log('Fast mode command (macOS - project):', fullCommand);
			
			exec(fullCommand, { shell: true }, (error, stdout, stderr) => {
				handleCommandResult(error, stdout, stderr, 'Failed to launch IDE in fast mode');
			});
			return;
		}
		
		// 有指定文件时，使用URL scheme
		// 构建URL：scheme://open?file=path&line=line&column=column
		let fileUrl = `${urlScheme}://open?file=${encodeURIComponent(filePath)}`;
		if (lineNumber > 0) {
			fileUrl += `&line=${lineNumber}`;
			if (columnNumber > 0) {
				fileUrl += `&column=${columnNumber}`;
			}
		}
		
		// 使用open -a命令打开文件
		// 在macOS上使用 'open' 命令而不是直接使用IDE命令可以避免在dock中临时显示两个IDE图标的问题
		const fullCommand = `open -a "${macAppName}" "${fileUrl}"`;
		
		console.log('Fast mode command (macOS - file):', fullCommand);
		
		exec(fullCommand, { shell: true }, (error, stdout, stderr) => {
			handleCommandResult(error, stdout, stderr, 'Failed to launch IDE in fast mode');
		});
	}

	/**
	 * 标准模式：打开项目+文件（JetBrains IDEs）
	 */
	function executeStandardMode(commandPath, projectPath, filePath, lineNumber, columnNumber, ideConfig, platform, commandPathIsFilePath) {
		// 构建文件路径参数部分
		let filePathArgs = '';
		if (filePath) {
			if (lineNumber > 0 || columnNumber > 0) {
				filePathArgs = `--line ${lineNumber} --column ${columnNumber} "${filePath}"`;
			} else {
				filePathArgs = `"${filePath}"`;
			}
		}
		
		executeRegularIDECommand(commandPath, projectPath, filePathArgs, platform, commandPathIsFilePath);
	}

	/**
	 * Xcode特殊处理
	 */
	function executeXcodeCommand(projectPath, filePath, lineNumber) {
		// 检查Xcode是否已经运行
		exec('ps aux | grep -v grep | grep "Xcode.app/Contents/MacOS/Xcode"', (error, stdout, stderr) => {
			const isXcodeRunning = stdout.trim().length > 0;
			const fullCommand = `open -a "Xcode" "${projectPath}"`;
			
			console.log('Opening Xcode project:', fullCommand);
			
			exec(fullCommand, { shell: true }, (error, stdout, stderr) => {
				if (error) {
					handleCommandResult(error, stdout, stderr, 'Failed to launch Xcode');
					return;
				}
				
				// 如果有文件需要打开
				if (filePath) {
					const delay = isXcodeRunning ? 0 : 5000;
					setTimeout(() => {
						const openFileCommand = `xed -l ${lineNumber} "${filePath}"`;
						console.log('Opening file in Xcode:', openFileCommand);
						
						exec(openFileCommand, { shell: true }, (error, stdout, stderr) => {
							handleCommandResult(error, stdout, stderr, 'Failed to open file in Xcode');
						});
					}, delay);
				}
			});
		});
	}

	/**
	 * 常规IDE命令执行
	 */
	function executeRegularIDECommand(commandPath, projectPath, filePathArgs, platform, commandPathIsFilePath) {
		let fullCommand = '';
		
		if (platform === 'win32' && !commandPathIsFilePath) {
			fullCommand = `cmd /c ${commandPath} "${projectPath}" ${filePathArgs}`;
		} else {
			fullCommand = `"${commandPath}" "${projectPath}" ${filePathArgs}`;
		}
		
		console.log('Full command:', fullCommand);
		
		exec(fullCommand, { shell: true }, (error, stdout, stderr) => {
			handleCommandResult(error, stdout, stderr, 'Failed to launch IDE');
		});
	}

	/**
	 * 统一的命令结果处理
	 */
	function handleCommandResult(error, stdout, stderr, errorMessage) {
		if (error) {
			console.error('Command execution error:', error);
			vscode.window.showErrorMessage(`${errorMessage}: ${error.message}`);
			return;
		}
		if (stdout) {
			console.warn('stdout:', stdout);
		}
		if (stderr) {
			console.warn('stderr:', stderr);
		}
	}

	// ========== VSCode-rooted app 跳转逻辑 ==========

	/**
	 * 获取当前文件路径和光标位置（复用逻辑）
	 */
	function resolveFileContext(uri) {
		let filePath;
		let lineNumber = 1;
		let columnNumber = 1;
		const editor = vscode.window.activeTextEditor;

		if (uri) {
			filePath = uri.fsPath;
			if (editor && editor.document.uri.fsPath === filePath) {
				lineNumber = editor.selection.active.line + 1;
				columnNumber = editor.selection.active.character;
			}
		} else if (editor) {
			filePath = editor.document.uri.fsPath;
			lineNumber = editor.selection.active.line + 1;
			columnNumber = editor.selection.active.character;
		}

		return { filePath, lineNumber, columnNumber };
	}

	/**
	 * 获取工作区项目路径（复用逻辑）
	 */
	function resolveProjectPath() {
		return projectConfigStore.resolveDefaultJetBrainsProjectPath();
	}

	/**
	 * Workspace-level JetBrains root (directory containing .idea), same source as openInJetBrainsInternal.
	 */
	function getWorkspaceJetBrainsRootProjectPath(filePath) {
		const raw = projectConfigStore.getJetBrainsRootProjectPath(filePath);
		if (!raw || typeof raw !== 'string' || raw.trim() === '') {
			return null;
		}
		const normalized = path.normalize(raw.trim());
		try {
			if (fs.existsSync(normalized)) {
				return normalized;
			}
		} catch (e) {
			console.warn('getWorkspaceJetBrainsRootProjectPath:', e.message);
		}
		return null;
	}

	/**
	 * Folder root for IDEA .idea lookup and CLI fallback (JetBrains root if configured, else first folder or file's folder when multi-root).
	 */
	function resolveFolderProjectPath(filePath) {
		const jetRoot = getWorkspaceJetBrainsRootProjectPath(filePath);
		if (jetRoot) {
			return jetRoot;
		}
		return resolvePhysicalWorkspaceFolderOnly(filePath);
	}

	/**
	 * VS workspace folder(s) only (ignores JetBrains root override). Used to match .code-workspace "folders" entries.
	 */
	function resolvePhysicalWorkspaceFolderOnly(filePath) {
		return projectConfigStore.resolvePhysicalWorkspaceFolderOnly(filePath);
	}

	function readIdeaVsCodeWorkspacePath(projectRootCandidate) {
		const xmlPath = path.join(projectRootCandidate, '.idea', 'editorJumperProjectSettings.xml');
		try {
			if (!fs.existsSync(xmlPath)) {
				return null;
			}
			const text = fs.readFileSync(xmlPath, 'utf8');
			let m = text.match(/<option[^>]*name="vsCodeWorkspacePath"[^>]*value="([^"]*)"[^>]*\/?>/);
			if (!m) {
				m = text.match(/<option[^>]*value="([^"]*)"[^>]*name="vsCodeWorkspacePath"[^>]*\/?>/);
			}
			if (!m || !m[1]) {
				return null;
			}
			const p = m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
			return p || null;
		} catch (e) {
			console.warn('readIdeaVsCodeWorkspacePath:', e.message);
			return null;
		}
	}

	/**
	 * 从 .idea 配置中读取 VSCode app 名称
	 * @param {string} projectRootCandidate 项目根目录候选
	 * @returns {string|null} VSCode app 名称，如果找不到则返回 null
	 */
	function readIdeaVsCodeAppName(projectRootCandidate) {
		const xmlPath = path.join(projectRootCandidate, '.idea', 'editorJumperProjectSettings.xml');
		try {
			if (!fs.existsSync(xmlPath)) {
				return null;
			}
			const text = fs.readFileSync(xmlPath, 'utf8');
			let m = text.match(/<option[^>]*name="vsCodeAppName"[^>]*value="([^"]*)"[^>]*\/?>/);
			if (!m) {
				m = text.match(/<option[^>]*value="([^"]*)"[^>]*name="vsCodeAppName"[^>]*\/?>/);
			}
			if (!m || !m[1]) {
				return null;
			}
			const appName = m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
			return appName || null;
		} catch (e) {
			console.warn('readIdeaVsCodeAppName:', e.message);
			return null;
		}
	}

	/**
	 * 写入 VSCode app 偏好到 .idea 配置，供 JetBrains 插件读取
	 * @param {string} projectRoot 项目根目录
	 * @param {string} vscodeAppName VSCode app 名称
	 * @param {string} workspacePath workspace 路径
	 */
	function writeIdeaVsCodeAppPreference(projectRoot, vscodeAppName, workspacePath) {
		if (!projectRoot || !vscodeAppName) {
			return;
		}
		
		const ideaDir = path.join(projectRoot, '.idea');
		try {
			// 确保 .idea 目录存在
			if (!fs.existsSync(ideaDir)) {
				fs.mkdirSync(ideaDir, { recursive: true });
			}
			
			const xmlPath = path.join(ideaDir, 'editorJumperProjectSettings.xml');
			let content = '';
			
			// 读取现有配置
			if (fs.existsSync(xmlPath)) {
				content = fs.readFileSync(xmlPath, 'utf8');
			}
			
			// 转义 XML 特殊字符
			const escapeXml = (str) => {
				if (!str) return '';
				return str.replace(/&/g, '&amp;')
						.replace(/</g, '&lt;')
						.replace(/>/g, '&gt;')
						.replace(/"/g, '&quot;')
						.replace(/'/g, '&apos;');
			};
			
			// 更新或添加 vsCodeAppName 配置
			const appNameOption = `<option name="vsCodeAppName" value="${escapeXml(vscodeAppName)}" />`;
			if (content.includes('name="vsCodeAppName"')) {
				content = content.replace(/<option[^>]*name="vsCodeAppName"[^>]*\/?>/g, appNameOption);
			} else {
				content = content.replace('</component>', `${appNameOption}\n</component>`).replace('</project>', `${appNameOption}\n</project>`);
				if (!content.includes('<component') && !content.includes('</project>')) {
					content = `<?xml version="1.0" encoding="UTF-8"?>\n<project>\n${appNameOption}\n</project>`;
				}
			}
			
			// 更新或添加 vsCodeWorkspacePath 配置
			if (workspacePath) {
				const wsPathOption = `<option name="vsCodeWorkspacePath" value="${escapeXml(workspacePath)}" />`;
				if (content.includes('name="vsCodeWorkspacePath"')) {
					content = content.replace(/<option[^>]*name="vsCodeWorkspacePath"[^>]*\/?>/g, wsPathOption);
				} else {
					content = content.replace('</component>', `${wsPathOption}\n</component>`).replace('</project>', `${wsPathOption}\n</project>`);
					if (!content.includes('<component') && !content.includes('</project>')) {
						content = `<?xml version="1.0" encoding="UTF-8"?>\n<project>\n${wsPathOption}\n</project>`;
					}
				}
			}
			
			// 写入文件
			fs.writeFileSync(xmlPath, content, 'utf8');
			console.log('Wrote VSCode app preference to IDEA config:', vscodeAppName, workspacePath);
		} catch (e) {
			console.warn('Failed to write IDEA VSCode preference:', e.message);
		}
	}

	/**
	 * Walk ancestors from startDir to find JetBrains project root (.idea) and return configured VSCode app name if valid.
	 */
	function walkUpFindIdeaVsCodeAppName(startDir) {
		let dir = path.resolve(startDir);
		const root = path.parse(dir).root;
		let depth = 0;
		const maxDepth = 48;
		while (dir && depth < maxDepth) {
			const candidate = readIdeaVsCodeAppName(dir);
			if (candidate) {
				console.log('Found VSCode app name from IDEA config:', candidate);
				return candidate;
			}
			if (dir === root) {
				break;
			}
			const parent = path.dirname(dir);
			if (parent === dir) {
				break;
			}
			dir = parent;
			depth++;
		}
		return null;
	}

	/**
	 * Walk ancestors from startDir to find JetBrains project root (.idea) and return configured .code-workspace path if valid.
	 * Matches cases where VS/Cursor opened a subfolder but IntelliJ project (and EditorJumper setting) live at repo root.
	 */
	function walkUpFindIdeaVsCodeWorkspacePath(startDir) {
		let dir = path.resolve(startDir);
		const root = path.parse(dir).root;
		let depth = 0;
		const maxDepth = 48;
		while (dir && depth < maxDepth) {
			const candidate = readIdeaVsCodeWorkspacePath(dir);
			if (candidate && fs.existsSync(candidate)) {
				return candidate;
			}
			if (dir === root) {
				break;
			}
			const parent = path.dirname(dir);
			if (parent === dir) {
				break;
			}
			dir = parent;
			depth++;
		}
		return null;
	}

	/**
	 * Classify project from host workspace API (Cursor/Windsurf/VS Code). No filesystem crawl for type or primary path.
	 */
	function describeHostWorkspace(filePath) {
		const addUnique = (arr, p) => {
			if (p && !arr.includes(p)) {
				arr.push(p);
			}
		};
		const wf = vscode.workspace.workspaceFile;
		if (wf && wf.scheme === 'file') {
			const fsPath = wf.fsPath;
			if (fs.existsSync(fsPath)) {
				const scanRoots = [];
				if (vscode.workspace.workspaceFolders) {
					for (const f of vscode.workspace.workspaceFolders) {
						addUnique(scanRoots, f.uri.fsPath);
					}
				}
				return { mode: 'codeWorkspaceWindow', openPath: fsPath, scanRoots };
			}
		}
		const jetRoot = getWorkspaceJetBrainsRootProjectPath(filePath);
		const folders = vscode.workspace.workspaceFolders;
		if (!folders || folders.length === 0) {
			if (jetRoot) {
				return { mode: 'jetbrainsRootOnly', openPath: jetRoot, scanRoots: [jetRoot] };
			}
			return null;
		}
		const scanRoots = [];
		addUnique(scanRoots, jetRoot);
		if (folders.length === 1) {
			const p = folders[0].uri.fsPath;
			addUnique(scanRoots, p);
			return { mode: 'singleFolder', openPath: jetRoot || p, scanRoots };
		}
		let primary = folders[0].uri.fsPath;
		if (filePath) {
			const hit = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
			if (hit) {
				primary = hit.uri.fsPath;
			}
		}
		addUnique(scanRoots, primary);
		for (const f of folders) {
			addUnique(scanRoots, f.uri.fsPath);
		}
		return { mode: 'multiRootFolder', openPath: jetRoot || primary, scanRoots };
	}

	function parseCodeWorkspaceFolderPathsAbs(wsFilePath) {
		let text;
		try {
			text = fs.readFileSync(wsFilePath, 'utf8');
		} catch (e) {
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

	function pathMatchesWorkspaceRoot(wfPath, entries) {
		const n = path.normalize(wfPath);
		for (const e of entries) {
			if (n === e || n.startsWith(e + path.sep) || e.startsWith(n + path.sep)) {
				return true;
			}
		}
		return false;
	}

	function codeWorkspaceCoversAllWindowFolders(wsFilePath) {
		const entries = parseCodeWorkspaceFolderPathsAbs(wsFilePath);
		if (entries.length === 0) {
			return false;
		}
		const folders = vscode.workspace.workspaceFolders;
		if (!folders || folders.length === 0) {
			return false;
		}
		return folders.every(f => pathMatchesWorkspaceRoot(f.uri.fsPath, entries));
	}

	function walkUpFindMatchingCodeWorkspaceFile(startDir) {
		let dir = path.resolve(startDir);
		const root = path.parse(dir).root;
		let depth = 0;
		const maxDepth = 48;
		while (dir && depth < maxDepth) {
			let names;
			try {
				names = fs.readdirSync(dir, { withFileTypes: true });
			} catch (e) {
				names = [];
			}
			const wsFiles = names
				.filter(d => d.isFile() && d.name.endsWith('.code-workspace'))
				.map(d => d.name)
				.sort();
			for (const name of wsFiles) {
				const full = path.join(dir, name);
				if (fs.existsSync(full) && codeWorkspaceCoversAllWindowFolders(full)) {
					return full;
				}
			}
			if (dir === root) {
				break;
			}
			const parent = path.dirname(dir);
			if (parent === dir) {
				break;
			}
			dir = parent;
			depth++;
		}
		return null;
	}

	function findAutoDetectedCodeWorkspaceFile(filePath) {
		const roots = [];
		const add = (p) => {
			if (p && !roots.includes(p)) {
				roots.push(p);
			}
		};
		add(resolvePhysicalWorkspaceFolderOnly(filePath));
		add(getWorkspaceJetBrainsRootProjectPath(filePath));
		if (vscode.workspace.workspaceFolders) {
			for (const wf of vscode.workspace.workspaceFolders) {
				add(wf.uri.fsPath);
			}
		}
		for (const r of roots) {
			const found = walkUpFindMatchingCodeWorkspaceFile(r);
			if (found) {
				return found;
			}
		}
		return null;
	}

	/**
	 * Path to pass before --goto: host workspace file, IDEA .code-workspace, auto-detected workspace file, or folder.
	 */
	function resolveVscodeOpenPath(filePath) {
		const host = describeHostWorkspace(filePath);
		if (!host) {
			return null;
		}
		if (host.mode === 'codeWorkspaceWindow') {
			return host.openPath;
		}
		// 自动检测 .code-workspace 文件
		const autoWs = findAutoDetectedCodeWorkspaceFile(filePath);
		if (autoWs) {
			console.log('Using auto-detected .code-workspace:', autoWs);
			return autoWs;
		}
		// 降级到项目根路径
		console.log('Using project root path:', host.openPath);
		return host.openPath;
	}

	function getBuiltinVscodeAppConfig(targetAppName) {
		const normalizedName = normalizeVscodeAppName(targetAppName);
		return vscodeAppConfigs[targetAppName] || vscodeAppConfigs[normalizedName] || null;
	}

	function canUseMacOpenFallback(commandPath, commandPathIsFilePath, builtinConf) {
		// VSCode-based apps should always use their command-line tools directly, not open -a
		// According to docs/core-commands.md, the correct format is:
		// /Applications/App.app/Contents/Resources/app/bin/app "projectPath" --goto "filePath:line:column"
		return false;
	}

	function buildMacOpenCommandForVscodeApp(builtinConf, openPath, filePath, lineNumber, columnNumber) {
		// This function is no longer used since canUseMacOpenFallback always returns false
		// Kept for backward compatibility
		const appName = builtinConf.macAppName;
		if (filePath) {
			const gotoArg = `${filePath}:${lineNumber}:${columnNumber}`;
			return `open -a "${appName}" --args "${openPath}" --goto "${gotoArg}"`;
		}

		return `open -a "${appName}" "${openPath}"`;
	}

	/**
	 * 在 VSCode-rooted app 中打开文件
	 */
	async function openInVscodeAppInternal(uri, targetAppName) {
		if (!targetAppName) {
			vscode.window.showErrorMessage('No target editor configured for this slot. Please configure it first.');
			return;
		}

		const vscodeAppConfs = globalConfigStore.getVscodeAppConfigurations();
		const normalizedTargetAppName = normalizeVscodeAppName(targetAppName);
		const appConf = vscodeAppConfs
			? vscodeAppConfs.find(a => normalizeVscodeAppName(a.name) === normalizedTargetAppName)
			: null;
		const builtinConf = getBuiltinVscodeAppConfig(targetAppName);

		const platform = process.platform;
		let commandPath = '';

		// 优先使用用户配置的路径
		if (appConf && appConf.commandPath) {
			commandPath = appConf.commandPath;
		} else if (builtinConf && builtinConf.command[platform]) {
			commandPath = builtinConf.command[platform];
		}

		if (!commandPath) {
			const result = await vscode.window.showErrorMessage(
				`Command path for ${normalizedTargetAppName || targetAppName} is not configured. Would you like to configure it now?`,
				'Configure', 'Cancel'
			);
			if (result === 'Configure') {
				configPanel.createConfigurationPanel(context);
			}
			return;
		}

		// 如果命令不是绝对路径，尝试查找绝对路径
		const commandPathIsFilePath = commandPath.includes('/') || commandPath.includes('\\');
		if (!commandPathIsFilePath && platform !== 'win32') {
			const fullPath = findCommandPath(commandPath);
			if (fullPath !== commandPath) {
				console.log(`Resolved command path: ${commandPath} -> ${fullPath}`);
				commandPath = fullPath;
				commandPathIsFilePath = true;
			}
		}

		console.log('Final command path:', commandPath, 'Is file path:', commandPathIsFilePath);

		const { filePath, lineNumber, columnNumber } = resolveFileContext(uri);

		const openPath = resolveVscodeOpenPath(filePath);
		if (!openPath) {
			vscode.window.showErrorMessage('No workspace folder is open. Please open a project first.');
			return;
		}

		projectConfigStore.setJumpBackSource(getCurrentVscodeAppName(), filePath);

		// 构建命令
		let fullCommand = '';
		const useMacOpenFallback = canUseMacOpenFallback(commandPath, commandPathIsFilePath, builtinConf);
		let fileArg = '';
		if (useMacOpenFallback) {
			fullCommand = buildMacOpenCommandForVscodeApp(builtinConf, openPath, filePath, lineNumber, columnNumber);
		} else if (filePath) {
			fileArg = `"${openPath}" --goto "${filePath}:${lineNumber}:${columnNumber}"`;
			if (platform === 'win32' && !commandPathIsFilePath) {
				fullCommand = `cmd /c ${commandPath} ${fileArg}`;
			} else {
				fullCommand = `"${commandPath}" ${fileArg}`;
			}
		} else {
			// Opening folder without specific file
			if (platform === 'win32' && !commandPathIsFilePath) {
				fullCommand = `cmd /c ${commandPath} "${openPath}"`;
			} else {
				fullCommand = `"${commandPath}" "${openPath}"`;
			}
		}

		console.log('VSCode app command:', fullCommand);

		exec(fullCommand, { shell: true }, (error, stdout, stderr) => {
			handleCommandResult(error, stdout, stderr, `Failed to launch ${normalizedTargetAppName || targetAppName}`);
		});
	}

	/**
	 * 统一的编辑器打开分发器
	 */
	async function openInEditorInternal(uri, type, targetName) {
		if (type === 'jetbrains') {
			await openInJetBrainsInternal(uri, false, targetName || null);
		} else if (type === 'vscode-app') {
			await openInVscodeAppInternal(uri, targetName);
		} else {
			vscode.window.showErrorMessage(`Unknown editor type: ${type}`);
		}
	}

	/**
	 * 执行 Slot 命令
	 */
	async function executeSlot(uri, slotIndex) {
		const slotTargets = projectConfigStore.getSlotTargets();

		if (!slotTargets || slotTargets.length <= slotIndex) {
			vscode.window.showErrorMessage(`Slot ${slotIndex + 1} is not configured.`);
			return;
		}

		const slot = slotTargets[slotIndex];

		if (!slot.target && slot.type === 'jetbrains') {
			await openInJetBrainsInternal(uri, false, projectConfigStore.getSlot1Target());
			return;
		}

		if (!slot.target) {
			vscode.window.showErrorMessage(`Slot ${slotIndex + 1} has no target editor. Please configure it via "Ez-EditorJumper-V: Configure Slot Target".`);
			return;
		}

		await openInEditorInternal(uri, slot.type, slot.target);
	}

	// 注册 Slot 命令
	let openSlot1Command = vscode.commands.registerCommand('editorjumper.openSlot1', async (uri) => {
		await executeSlot(uri, 0);
	});

	let openSlot2Command = vscode.commands.registerCommand('editorjumper.openSlot2', async (uri) => {
		await executeSlot(uri, 1);
	});

	let openSlot3Command = vscode.commands.registerCommand('editorjumper.openSlot3', async (uri) => {
		await executeSlot(uri, 2);
	});
	let openSlot2CursorCommand = vscode.commands.registerCommand('editorjumper.openSlot2Cursor', async (uri) => {
		await executeSlot(uri, 1);
	});
	let openSlot2WindsurfCommand = vscode.commands.registerCommand('editorjumper.openSlot2Windsurf', async (uri) => {
		await executeSlot(uri, 1);
	});
	let openSlot2VSCodeCommand = vscode.commands.registerCommand('editorjumper.openSlot2VSCode', async (uri) => {
		await executeSlot(uri, 1);
	});
	let openSlot3CursorCommand = vscode.commands.registerCommand('editorjumper.openSlot3Cursor', async (uri) => {
		await executeSlot(uri, 2);
	});
	let openSlot3WindsurfCommand = vscode.commands.registerCommand('editorjumper.openSlot3Windsurf', async (uri) => {
		await executeSlot(uri, 2);
	});
	let openSlot3VSCodeCommand = vscode.commands.registerCommand('editorjumper.openSlot3VSCode', async (uri) => {
		await executeSlot(uri, 2);
	});

	// 注册通用 openInEditor 命令（支持 args.target + args.type）
	let openInEditorCommand = vscode.commands.registerCommand('editorjumper.openInEditor', async (args) => {
		if (!args || !args.target || !args.type) {
			vscode.window.showErrorMessage('Usage: editorjumper.openInEditor requires args.target and args.type');
			return;
		}
		await openInEditorInternal(undefined, args.type, args.target);
	});

	// 注册 Jump Back 命令
	let jumpBackCommand = vscode.commands.registerCommand('editorjumper.jumpBack', async () => {
		let jumpBackSource = normalizeVscodeAppName(projectConfigStore.getJumpBackSource());

		if (!jumpBackSource) {
			vscode.window.showInformationMessage('No source editor to jump back to.');
			return;
		}

		const isVscodeApp = !!getBuiltinVscodeAppConfig(jumpBackSource);
		const sourceType = isVscodeApp ? 'vscode-app' : 'jetbrains';

		await openInEditorInternal(undefined, sourceType, jumpBackSource);

		projectConfigStore.setJumpBackSource('');
	});

	// 注册 Open in Peer VSCode App 命令
	let openInPeerVscodeAppCommand = vscode.commands.registerCommand('editorjumper.openInPeerVscodeApp', async (uri) => {
		const currentAppName = getCurrentVscodeAppName();
		const peerAppName = smartPeerMap[currentAppName] || 'Cursor';
		console.log(`Opening in peer VSCode app: ${currentAppName} -> ${peerAppName}`);
		await openInVscodeAppInternal(uri, peerAppName);
	});

	let pickSlotToJumpCommand = vscode.commands.registerCommand('editorjumper.pickSlotToJump', async () => {
		await slotPickerView.show();
	});

	slotPickerView.register(context, async (uri, index) => {
		await executeSlot(uri, index);
	});

	// 注册 Configure Slot 命令
	let configureSlotCommand = vscode.commands.registerCommand('editorjumper.configureSlot', async () => {
		const slotTargets = projectConfigStore.getSlotTargets();

		// 选择要配置的 Slot
		const slotItems = slotTargets.map((s, i) => ({
			label: `Slot ${s.slot}`,
			description: s.target ? `${s.type} → ${s.target}` : '(not configured)',
			index: i
		}));

		const selectedSlot = await vscode.window.showQuickPick(slotItems, {
			placeHolder: 'Select a slot to configure'
		});
		if (!selectedSlot) return;

		// 选择编辑器类型
		const typeItems = [
			{ label: 'JetBrains IDE', description: 'IDEA, WebStorm, PyCharm, etc.', type: 'jetbrains' },
			{ label: 'VSCode-Rooted App', description: 'Cursor, Windsurf, VS Code, etc.', type: 'vscode-app' }
		];

		const selectedType = await vscode.window.showQuickPick(typeItems, {
			placeHolder: 'Select editor type'
		});
		if (!selectedType) return;

		// 根据类型列出可选编辑器
		let editorItems = [];
		if (selectedType.type === 'jetbrains') {
			const ideConfs = globalConfigStore.getIdeConfigurations();
			editorItems = ideConfs
				.filter(ide => !ide.hidden)
				.map(ide => ({ label: ide.name, name: ide.name }));
		} else {
			const vscodeConfs = globalConfigStore.getVscodeAppConfigurations();
			editorItems = vscodeConfs
				.filter(app => !app.hidden && normalizeVscodeAppName(app.name) !== currentAppName)
				.map(app => ({ label: app.name, name: app.name }));
		}

		if (editorItems.length === 0) {
			vscode.window.showInformationMessage('No editors available for this type.');
			return;
		}

		const selectedEditor = await vscode.window.showQuickPick(editorItems, {
			placeHolder: 'Select target editor'
		});
		if (!selectedEditor) return;

		// 更新 slotTargets
		slotTargets[selectedSlot.index] = {
			slot: selectedSlot.index + 1,
			type: selectedType.type,
			target: selectedEditor.name
		};

		projectConfigStore.setSlotTargets(slotTargets);

		updateStatusBar();
		updateSlotMenuContexts();
		vscode.window.showInformationMessage(`Slot ${selectedSlot.index + 1} → ${selectedEditor.name} (${selectedType.type})`);
	});

	// 注册新的配置命令
	let configureIDECommand = vscode.commands.registerCommand('editorjumper.configureIDE', () => {
		configPanel.createConfigurationPanel(context);
	});

	// 注册更新状态栏命令
	let updateStatusBarCommand = vscode.commands.registerCommand('editorjumper.updateStatusBar', () => {
		updateStatusBar();
	});

	context.subscriptions.push(openInJetBrainsCommand);
	context.subscriptions.push(openInJetBrainsFastCommand);
	context.subscriptions.push(configureIDECommand);
	context.subscriptions.push(updateStatusBarCommand);
	context.subscriptions.push(openSlot1Command);
	context.subscriptions.push(openSlot2Command);
	context.subscriptions.push(openSlot3Command);
	context.subscriptions.push(openSlot2CursorCommand);
	context.subscriptions.push(openSlot2WindsurfCommand);
	context.subscriptions.push(openSlot2VSCodeCommand);
	context.subscriptions.push(openSlot3CursorCommand);
	context.subscriptions.push(openSlot3WindsurfCommand);
	context.subscriptions.push(openSlot3VSCodeCommand);
	context.subscriptions.push(openInEditorCommand);
	context.subscriptions.push(jumpBackCommand);
	context.subscriptions.push(openInPeerVscodeAppCommand);
	context.subscriptions.push(configureSlotCommand);
	context.subscriptions.push(pickSlotToJumpCommand);

	try {
		await runLegacyConfigMigration();
		globalConfigStore.readApps(true);
		projectConfigStore.readProject();
		ensureDefaultSlotTargets();
		globalConfigStore.ensureDefaultJetbrainsApps();

		if (process.platform === 'darwin') {
			const ideConfigurations = globalConfigStore.getIdeConfigurations();
			if (!ideConfigurations.find(ide => ide.name === 'Xcode')) {
				globalConfigStore.upsertApp('jetbrains', {
					name: 'Xcode',
					commandPath: null,
					isCustom: false,
					hidden: false
				});
			}
		}

		globalConfigStore.watchSharedApps(() => {
			updateStatusBar();
			updateSlotMenuContexts();
			configPanel.refreshConfigurationPanel();
		});
		context.subscriptions.push({ dispose: () => globalConfigStore.disposeWatcher() });

		updateStatusBar();
	} catch (error) {
		console.error('EzEditorJumper-V activate init failed:', error);
		vscode.window.showErrorMessage(`EzEditorJumper-V init failed: ${error.message}`);
	}

	// 监听配置变化
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('editorjumper')) {
			updateStatusBar();
			updateSlotMenuContexts();
			// 自动刷新配置面板（如果已打开）
			configPanel.refreshConfigurationPanel();
		}
	}));

	updateSlotMenuContexts();

	// 初始显示状态栏
	statusBarItem.show();
}

function updateStatusBar() {
	if (!statusBarItem) {
		return;
	}
	const slotTargets = projectConfigStore.getSlotTargets();
	const slot1 = slotTargets[0] || { target: 'IDEA' };
	const slot1Name = slot1.target || 'IDEA';
	statusBarItem.text = `$(link-external) ${slot1Name}`;
	statusBarItem.tooltip = `Slot 1: ${slot1.type || 'jetbrains'} → ${slot1Name} (Click to open slot menu above status bar)`;
	slotPickerView.refresh();
}

// This method is called when your extension is deactivated
function deactivate() {
	if (statusBarItem) {
		statusBarItem.dispose();
	}
	globalConfigStore.disposeWatcher();
}

module.exports = {
	activate,
	deactivate,
	findCommandPath
}
