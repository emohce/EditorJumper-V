const vscode = require('vscode');
const { exec, execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const defaultIDEPaths = require('./defaultIDEPaths');
const { ideConfigs, vscodeAppConfigs, smartPeerMap } = require('./defaultIDEPaths');
const { normalizeVscodeAppName } = require('./defaultIDEPaths');
let configPanel = require('./configPanel');

let statusBarItem;
let slotStatusBarItem;

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
				// which命令失败，继续使用原始命令
				console.log(`Could not find absolute path for ${command}: ${e.message}`);
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

	// 在activate函数中加载configPanel模块，避免循环引用
	configPanel = require('./configPanel');

	const config = vscode.workspace.getConfiguration('editorjumper');
	const currentIDE = config.get('selectedIDE');
	const ideConfigurations = config.get('ideConfigurations');

	if (!currentIDE || !ideConfigurations.find(ide => ide.name === currentIDE)) {
		if (ideConfigurations.length > 0) {
			await config.update('selectedIDE', ideConfigurations[0].name, false);
		}
	}

	// 确保在ideConfigurations中包含Xcode的配置，仅在macOS上
	if (process.platform === 'darwin') {
		const config = vscode.workspace.getConfiguration('editorjumper');
		let ideConfigurations = config.get('ideConfigurations');

		// 如果Xcode配置不存在，则添加
		if (!ideConfigurations.find(ide => ide.name === 'Xcode')) {
			ideConfigurations.push({
				name: 'Xcode',
				commandPath: null, // 设置为null
				isCustom: false,
				hidden: false
			});
			config.update('ideConfigurations', ideConfigurations, true);
		}
	}

	// 智能初始化 Slot 2 目标：根据当前编辑器自动设置对等编辑器
	const currentAppName = getCurrentVscodeAppName();
	const slotTargets = config.get('slotTargets');
	if (slotTargets && slotTargets.length >= 2 && !slotTargets[1].target) {
		const peer = smartPeerMap[currentAppName] || 'Cursor';
		slotTargets[1].target = peer;
		await config.update('slotTargets', slotTargets, true);
	}

	// 创建状态栏项 - 用于选择IDE
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.command = 'editorjumper.selectJetBrainsIDE';
	context.subscriptions.push(statusBarItem);

	// 创建状态栏项 - 用于 Slot 2 (对等编辑器)
	slotStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
	slotStatusBarItem.command = 'editorjumper.configureSlot';
	context.subscriptions.push(slotStatusBarItem);

	updateStatusBar();

	// 注册命令：选择IDE
	let selectIDECommand = vscode.commands.registerCommand('editorjumper.selectJetBrainsIDE', async () => {
		const config = vscode.workspace.getConfiguration('editorjumper');
		const ideConfigurations = config.get('ideConfigurations');
		
		// 创建IDE选项列表
		const items = ideConfigurations
			.filter(ide => !ide.hidden) // 只显示未隐藏的IDE
			.map(ide => ({
				label: ide.name,
				description: ide.isCustom ? '(Custom)' : '',
				name: ide.name
			}));
		
		// 添加配置选项
		items.push({
			label: '$(gear) Configure Ez-EditorJumper',
			description: 'Open configuration panel',
			name: 'configure'
		});

		const selected = await vscode.window.showQuickPick(items, {
			placeHolder: 'Select JetBrains IDE or Configure'
		});

		if (selected) {
			if (selected.name === 'configure') {
				// 打开配置界面
				vscode.commands.executeCommand('editorjumper.configureIDE');
			} else {
				// 选择IDE
				await config.update('selectedIDE', selected.name, false);
				updateStatusBar();
			}
		}
	});

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
		const config = vscode.workspace.getConfiguration('editorjumper');
		const selectedIDE = targetOverride || config.get('selectedIDE');
		const ideConfigurations = config.get('ideConfigurations');
		const ideConfig = ideConfigurations.find(ide => ide.name === selectedIDE);

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
		const jetBrainsRootInspect = config.inspect('jetBrainsRootProjectPath');
		const jetBrainsRoot = (jetBrainsRootInspect && typeof jetBrainsRootInspect.workspaceValue === 'string')
			? jetBrainsRootInspect.workspaceValue
			: '';
		if (jetBrainsRoot && typeof jetBrainsRoot === 'string' && jetBrainsRoot.trim() !== '') {
			// 已配置 JetBrains 根项目路径时，统一使用该路径（多模块/多工作目录场景）
			projectPath = path.normalize(jetBrainsRoot.trim());
		} else {
			// 未配置时保持原有逻辑：以工作区目录为 projectPath
			if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
				// 如果有工作区文件夹，使用第一个工作区文件夹的路径
				projectPath = vscode.workspace.workspaceFolders[0].uri.fsPath;

				// 如果有多个工作区文件夹，并且有选中的文件，尝试找到包含该文件的工作区文件夹
				if (vscode.workspace.workspaceFolders.length > 1 && filePath) {
					const fileUri = vscode.Uri.file(filePath);
					const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
					if (workspaceFolder) {
						projectPath = workspaceFolder.uri.fsPath;
					}
				}
			} else {
				// 如果没有工作区文件夹，提示用户并返回
				vscode.window.showErrorMessage('No workspace folder is open. Please open a project first.');
				return;
			}
		}

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
		if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
			return vscode.workspace.workspaceFolders[0].uri.fsPath;
		}
		return null;
	}

	function getBuiltinVscodeAppConfig(targetAppName) {
		const normalizedName = normalizeVscodeAppName(targetAppName);
		return vscodeAppConfigs[targetAppName] || vscodeAppConfigs[normalizedName] || null;
	}

	function canUseMacOpenFallback(commandPath, commandPathIsFilePath, builtinConf) {
		if (process.platform !== 'darwin' || !builtinConf || !builtinConf.macAppName) {
			return false;
		}

		if (commandPathIsFilePath) {
			return !fs.existsSync(commandPath);
		}

		const resolvedPath = findCommandPath(commandPath);
		return resolvedPath === commandPath;
	}

	function buildMacOpenCommandForVscodeApp(builtinConf, projectPath, filePath, lineNumber, columnNumber) {
		const appName = builtinConf.macAppName;
		if (filePath) {
			const gotoArg = `${filePath}:${lineNumber}:${columnNumber}`;
			return `open -a "${appName}" --args --goto "${gotoArg}"`;
		}

		return `open -a "${appName}" "${projectPath}"`;
	}

	/**
	 * 在 VSCode-rooted app 中打开文件
	 */
	async function openInVscodeAppInternal(uri, targetAppName) {
		if (!targetAppName) {
			vscode.window.showErrorMessage('No target editor configured for this slot. Please configure it first.');
			return;
		}

		const config = vscode.workspace.getConfiguration('editorjumper');
		const vscodeAppConfs = config.get('vscodeAppConfigurations');
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
				commandPath = fullPath;
			}
		}

		const { filePath, lineNumber, columnNumber } = resolveFileContext(uri);

		// 获取项目路径
		let projectPath = resolveProjectPath();
		if (!projectPath) {
			vscode.window.showErrorMessage('No workspace folder is open. Please open a project first.');
			return;
		}

		// 多工作区时，尝试找到包含文件的工作区
		if (vscode.workspace.workspaceFolders.length > 1 && filePath) {
			const fileUri = vscode.Uri.file(filePath);
			const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
			if (workspaceFolder) {
				projectPath = workspaceFolder.uri.fsPath;
			}
		}

		// 写入 jumpBackSource 信号
		try {
			await config.update('jumpBackSource', getCurrentVscodeAppName(), vscode.ConfigurationTarget.Workspace);
		} catch (e) {
			console.warn('Could not write jumpBackSource:', e.message);
		}

		// 构建命令
		let fullCommand = '';
		const useMacOpenFallback = canUseMacOpenFallback(commandPath, commandPathIsFilePath, builtinConf);
		let fileArg = '';
		if (useMacOpenFallback) {
			fullCommand = buildMacOpenCommandForVscodeApp(builtinConf, projectPath, filePath, lineNumber, columnNumber);
		} else if (filePath) {
			// When using --goto, VSCode-based editors will auto-detect the workspace from the file path
			// Don't pass projectPath separately as it can interfere with workspace detection
			fileArg = `--goto "${filePath}:${lineNumber}:${columnNumber}"`;
			if (platform === 'win32' && !commandPathIsFilePath) {
				fullCommand = `cmd /c ${commandPath} ${fileArg}`;
			} else {
				fullCommand = `"${commandPath}" ${fileArg}`;
			}
		} else {
			// Opening folder without specific file
			if (platform === 'win32' && !commandPathIsFilePath) {
				fullCommand = `cmd /c ${commandPath} "${projectPath}"`;
			} else {
				fullCommand = `"${commandPath}" "${projectPath}"`;
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
		const config = vscode.workspace.getConfiguration('editorjumper');
		const slotTargets = config.get('slotTargets');

		if (!slotTargets || slotTargets.length <= slotIndex) {
			vscode.window.showErrorMessage(`Slot ${slotIndex + 1} is not configured.`);
			return;
		}

		const slot = slotTargets[slotIndex];

		if (!slot.target && slot.type === 'jetbrains') {
			// Slot 1 默认使用 selectedIDE
			await openInJetBrainsInternal(uri, false, null);
			return;
		}

		if (!slot.target) {
			vscode.window.showErrorMessage(`Slot ${slotIndex + 1} has no target editor. Please configure it via "Ez-EditorJumper: Configure Slot Target".`);
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
		const config = vscode.workspace.getConfiguration('editorjumper');
		const jumpBackSourceInspect = config.inspect('jumpBackSource');
		const jumpBackSource = (jumpBackSourceInspect && typeof jumpBackSourceInspect.workspaceValue === 'string')
			? normalizeVscodeAppName(jumpBackSourceInspect.workspaceValue)
			: '';

		if (!jumpBackSource) {
			vscode.window.showInformationMessage('No source editor to jump back to.');
			return;
		}

		// 判断 source 类型
		const isVscodeApp = !!getBuiltinVscodeAppConfig(jumpBackSource);
		const sourceType = isVscodeApp ? 'vscode-app' : 'jetbrains';

		await openInEditorInternal(undefined, sourceType, jumpBackSource);

		// 清除 jumpBackSource
		try {
			await config.update('jumpBackSource', '', vscode.ConfigurationTarget.Workspace);
		} catch (e) {
			console.warn('Could not clear jumpBackSource:', e.message);
		}
	});

	// 注册 Configure Slot 命令
	let configureSlotCommand = vscode.commands.registerCommand('editorjumper.configureSlot', async () => {
		const config = vscode.workspace.getConfiguration('editorjumper');
		const slotTargets = config.get('slotTargets') || [];

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
			const ideConfs = config.get('ideConfigurations') || [];
			editorItems = ideConfs
				.filter(ide => !ide.hidden)
				.map(ide => ({ label: ide.name, name: ide.name }));
		} else {
			const vscodeConfs = config.get('vscodeAppConfigurations') || [];
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

		await config.update('slotTargets', slotTargets, true);
		updateStatusBar();
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

	context.subscriptions.push(selectIDECommand);
	context.subscriptions.push(openInJetBrainsCommand);
	context.subscriptions.push(openInJetBrainsFastCommand);
	context.subscriptions.push(configureIDECommand);
	context.subscriptions.push(updateStatusBarCommand);
	context.subscriptions.push(openSlot1Command);
	context.subscriptions.push(openSlot2Command);
	context.subscriptions.push(openSlot3Command);
	context.subscriptions.push(openInEditorCommand);
	context.subscriptions.push(jumpBackCommand);
	context.subscriptions.push(configureSlotCommand);

	// 监听配置变化
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('editorjumper')) {
			updateStatusBar();
		}
	}));

	// 初始显示状态栏
	statusBarItem.show();
	slotStatusBarItem.show();
}

function updateStatusBar() {
	const config = vscode.workspace.getConfiguration('editorjumper');
	const selectedIDE = config.get('selectedIDE');
	const ideConfigurations = config.get('ideConfigurations');
	const currentIDE = ideConfigurations.find(ide => ide.name === selectedIDE);

	if (currentIDE) {
		statusBarItem.text = `$(link-external) ${currentIDE.name}`;
		statusBarItem.tooltip = `Click to select JetBrains IDE (Current: ${currentIDE.name})`;
	} else {
		statusBarItem.text = '$(link-external) Select IDE';
		statusBarItem.tooltip = 'Click to select JetBrains IDE';
	}

	// 更新 Slot 2 状态栏
	const slotTargets = config.get('slotTargets');
	if (slotStatusBarItem && slotTargets && slotTargets.length >= 2) {
		const slot2 = slotTargets[1];
		if (slot2.target) {
			slotStatusBarItem.text = `$(arrow-swap) ${slot2.target}`;
			slotStatusBarItem.tooltip = `Slot 2: ${slot2.type} → ${slot2.target} (Click to configure slots)`;
		} else {
			slotStatusBarItem.text = '$(arrow-swap) Set Peer';
			slotStatusBarItem.tooltip = 'Click to configure shortcut slots';
		}
	}
}

// This method is called when your extension is deactivated
function deactivate() {
	if (statusBarItem) {
		statusBarItem.dispose();
	}
	if (slotStatusBarItem) {
		slotStatusBarItem.dispose();
	}
}

module.exports = {
	activate,
	deactivate,
	findCommandPath
}
