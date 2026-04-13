const vscode = require('vscode');
const os = require('os');
const fs = require('fs');
// 避免循环引用
// const extension = require('./extension');

let configPanel = undefined;

/**
 * 刷新配置面板（如果面板已打开）
 */
function refreshConfigurationPanel() {
    if (configPanel) {
        const config = vscode.workspace.getConfiguration('editorjumper');
        const collapsedSections = config.get('collapsedSections') || { 'jetbrains-section': true, 'vscode-section': true };
        configPanel.webview.html = getWebviewContent(config.get('ideConfigurations'), collapsedSections);
    }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function encodeDomId(prefix, value) {
    return `${prefix}-${Buffer.from(String(value ?? ''), 'utf8').toString('base64url')}`;
}

/**
 * 创建配置面板
 * @param {vscode.ExtensionContext} context 扩展上下文
 * @returns {vscode.WebviewPanel} 配置面板
 */
function createConfigurationPanel(context) {
    if (configPanel) {
        configPanel.dispose(); // 先销毁旧的面板
    }

    configPanel = vscode.window.createWebviewPanel(
        'ideConfiguration',
        'Ez-EditorJumper Configuration',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: false, // 不保留隐藏时的上下文
            enableFindWidget: true
        }
    );

    // 强制重新加载配置
    const config = vscode.workspace.getConfiguration('editorjumper');
    const collapsedSections = config.get('collapsedSections') || { 'jetbrains-section': true, 'vscode-section': true };
    configPanel.webview.html = getWebviewContent(config.get('ideConfigurations'), collapsedSections);

    configPanel.webview.onDidReceiveMessage(
        async message => {
            const config = vscode.workspace.getConfiguration('editorjumper');
            const ideConfigurations = config.get('ideConfigurations');
            
            console.log('Received message from webview:', message.command, message);
            
            try {
                switch (message.command) {
                    case 'addIDE':
                        const newIDE = message.ide;
                        console.log('Adding new IDE:', newIDE);
                        
                        // 检查是否存在相同名称的非自定义IDE
                        const existingIDE = ideConfigurations.find(ide => ide.name === newIDE.name);
                        
                        // 只有在添加新IDE（非编辑现有IDE）且名称已存在时才提示错误
                        if (newIDE.isCustom === false && 
                            ideConfigurations.some(ide => 
                                ide.isCustom === false && 
                                ide.name === newIDE.name && 
                                // 如果是编辑现有IDE，则不检查自身
                                (!existingIDE || ide !== existingIDE)
                            )) {
                            vscode.window.showErrorMessage(`IDE ${newIDE.name} already exists`);
                            return;
                        }
                        
                        // 如果是编辑现有IDE，保留其他平台的命令路径
                        let updatedIDE = {
                            ...newIDE,
                            isCustom: newIDE.isCustom === true,
                            hidden: newIDE.hidden === true
                        };
                        
                        if (existingIDE) {
                            // 更新现有IDE
                            const updatedConfigurations = ideConfigurations.map(ide => 
                                ide.name === newIDE.name ? updatedIDE : ide
                            );
                            await config.update('ideConfigurations', updatedConfigurations, true);
                        } else {
                            // 添加新IDE
                            await config.update('ideConfigurations', [...ideConfigurations, updatedIDE], true);
                        }
                        
                        vscode.window.showInformationMessage(`IDE configuration saved: ${newIDE.name}`);
                        
                        // 重新获取最新配置并更新WebView
                        const addUpdatedConfig = vscode.workspace.getConfiguration('editorjumper');
                        const addCollapsedSections = addUpdatedConfig.get('collapsedSections') || { 'jetbrains-section': true, 'vscode-section': true };
                        configPanel.webview.html = getWebviewContent(addUpdatedConfig.get('ideConfigurations'), addCollapsedSections);
                        // 通知主模块更新状态栏
                        vscode.commands.executeCommand('editorjumper.updateStatusBar');
                        break;
                    case 'updateIDE':
                        console.log('Updating IDE:', message.ide);
                        const updatedConfigurations = ideConfigurations.map(ide => 
                            ide.name === message.ide.name ? {
                                ...ide,
                                ...message.ide,
                                isCustom: message.ide.isCustom === true,
                                hidden: message.ide.hidden === true
                            } : ide
                        );
                        await config.update('ideConfigurations', updatedConfigurations, true);
                        
                        // 如果当前选中的IDE被隐藏了，自动选择第一个未隐藏的IDE
                        const selectedIDEForUpdate = config.get('selectedIDE');
                        if (message.ide.name === selectedIDEForUpdate && message.ide.hidden === true) {
                            const firstVisibleIDE = updatedConfigurations.find(ide => !ide.hidden);
                            if (firstVisibleIDE) {
                                await config.update('selectedIDE', firstVisibleIDE.name, true);
                            }
                        }
                        
                        // 重新获取最新配置并更新WebView
                        const updateUpdatedConfig = vscode.workspace.getConfiguration('editorjumper');
                        const updateCollapsedSections = updateUpdatedConfig.get('collapsedSections') || { 'jetbrains-section': true, 'vscode-section': true };
                        configPanel.webview.html = getWebviewContent(updateUpdatedConfig.get('ideConfigurations'), updateCollapsedSections);
                        // 通知主模块更新状态栏
                        vscode.commands.executeCommand('editorjumper.updateStatusBar');
                        break;
                    case 'removeIDE':
                        console.log('Removing IDE:', message.ideName);
                        const selectedIDEForRemove = config.get('selectedIDE');
                        if (message.ideName === selectedIDEForRemove) {
                            console.log('Cannot remove currently selected IDE');
                            vscode.window.showErrorMessage('Cannot remove currently selected IDE. Please select another IDE first');
                            return;
                        }
                        const filteredConfigurations = ideConfigurations.filter(ide => ide.name !== message.ideName);
                        console.log('Filtered configurations:', filteredConfigurations);
                        console.log('Original configurations:', ideConfigurations);
                        console.log('IDE to remove:', message.ideName);
                        await config.update('ideConfigurations', filteredConfigurations, true);
                        vscode.window.showInformationMessage('IDE configuration removed');
                        
                        // 重新获取最新配置并更新WebView
                        const updatedConfig = vscode.workspace.getConfiguration('editorjumper');
                        const removeCollapsedSections = updatedConfig.get('collapsedSections') || { 'jetbrains-section': true, 'vscode-section': true };
                        configPanel.webview.html = getWebviewContent(updatedConfig.get('ideConfigurations'), removeCollapsedSections);
                        // 通知主模块更新状态栏
                        vscode.commands.executeCommand('editorjumper.updateStatusBar');
                        break;
                    case 'selectPath':
                        const options = {
                            canSelectFiles: true,
                            canSelectFolders: false,
                            canSelectMany: false,
                            openLabel: 'Select',
                            filters: {}
                        };

                        if (process.platform === 'darwin') {
                            options.canSelectFiles = true;
                            options.canSelectFolders = false; // 不再允许选择文件夹，因为不支持.app路径
                            options.title = 'Select JetBrains IDE Command';
                            options.openLabel = 'Select';
                        }

                        const result = await vscode.window.showOpenDialog(options);
                        if (result && result[0]) {
                            let selectedPath = result[0].fsPath;
                            
                            configPanel.webview.postMessage({
                                command: 'setPath',
                                path: selectedPath
                            });
                        }
                        break;
                    case 'selectPathForRootProject':
                        const folderOptions = {
                            canSelectFiles: false,
                            canSelectFolders: true,
                            canSelectMany: false,
                            openLabel: 'Select Folder',
                            title: 'Select JetBrains Root Project Path (directory containing .idea)'
                        };
                        const folderResult = await vscode.window.showOpenDialog(folderOptions);
                        if (folderResult && folderResult[0]) {
                            await config.update('jetBrainsRootProjectPath', folderResult[0].fsPath, vscode.ConfigurationTarget.Workspace);
                            const rootUpdatedConfig = vscode.workspace.getConfiguration('editorjumper');
                            const rootCollapsedSections = rootUpdatedConfig.get('collapsedSections') || { 'jetbrains-section': true, 'vscode-section': true };
                            configPanel.webview.html = getWebviewContent(rootUpdatedConfig.get('ideConfigurations'), rootCollapsedSections);
                        }
                        break;
                    case 'saveRootProjectPath':
                        const pathToSave = (message.path != null && message.path !== undefined) ? String(message.path) : '';
                        await config.update('jetBrainsRootProjectPath', pathToSave, vscode.ConfigurationTarget.Workspace);
                        vscode.window.showInformationMessage('JetBrains root project path saved.');
                        const saveUpdatedConfig = vscode.workspace.getConfiguration('editorjumper');
                        const saveCollapsedSections = saveUpdatedConfig.get('collapsedSections') || { 'jetbrains-section': true, 'vscode-section': true };
                        configPanel.webview.html = getWebviewContent(saveUpdatedConfig.get('ideConfigurations'), saveCollapsedSections);
                        break;
                    case 'updateSlot':
                        const slotTargets = config.get('slotTargets') || [];
                        const mergedSlotTargets = [
                            slotTargets[0] || { slot: 1, type: 'jetbrains', target: '' },
                            slotTargets[1] || { slot: 2, type: 'vscode-app', target: 'Cursor' },
                            slotTargets[2] || { slot: 3, type: 'vscode-app', target: 'Windsurf' }
                        ];
                        const slotIdx = message.slotIndex;
                        if (slotIdx >= 0 && slotIdx < mergedSlotTargets.length) {
                            let slotTarget = message.slotTarget;
                            if (slotIdx === 1 && !slotTarget) {
                                slotTarget = 'Cursor';
                            }
                            if (slotIdx === 2 && !slotTarget) {
                                slotTarget = 'Windsurf';
                            }
                            mergedSlotTargets[slotIdx] = {
                                slot: slotIdx + 1,
                                type: message.slotType,
                                target: slotTarget
                            };
                            await config.update('slotTargets', mergedSlotTargets, vscode.ConfigurationTarget.Workspace);
                            
                            // 如果是 Slot 1 且类型是 JetBrains，同时更新全局 selectedIDE
                            if (slotIdx === 0 && message.slotType === 'jetbrains' && message.slotTarget) {
                                await config.update('selectedIDE', message.slotTarget, true);
                            }
                            
                            vscode.window.showInformationMessage(`Slot ${slotIdx + 1} → ${message.slotTarget} (${message.slotType}) - saved for this project`);
                        }
                        const slotUpdatedConfig = vscode.workspace.getConfiguration('editorjumper');
                        const slotCollapsedSections = slotUpdatedConfig.get('collapsedSections') || { 'jetbrains-section': true, 'vscode-section': true };
                        configPanel.webview.html = getWebviewContent(slotUpdatedConfig.get('ideConfigurations'), slotCollapsedSections);
                        vscode.commands.executeCommand('editorjumper.updateStatusBar');
                        break;

                    case 'addVscodeApp':
                        const newApp = message.app;
                        const vscodeApps = config.get('vscodeAppConfigurations') || [];
                        const existingApp = vscodeApps.find(a => a.name === newApp.name);
                        
                        let updatedApp = {
                            ...newApp,
                            isCustom: newApp.isCustom === true,
                            hidden: newApp.hidden === true
                        };
                        
                        if (existingApp) {
                            const updatedApps = vscodeApps.map(a => a.name === newApp.name ? updatedApp : a);
                            await config.update('vscodeAppConfigurations', updatedApps, true);
                        } else {
                            await config.update('vscodeAppConfigurations', [...vscodeApps, updatedApp], true);
                        }
                        
                        vscode.window.showInformationMessage(`VSCode app configuration saved: ${newApp.name}`);
                        const appAddConfig = vscode.workspace.getConfiguration('editorjumper');
                        const appAddCollapsedSections = appAddConfig.get('collapsedSections') || { 'jetbrains-section': true, 'vscode-section': true };
                        configPanel.webview.html = getWebviewContent(appAddConfig.get('ideConfigurations'), appAddCollapsedSections);
                        vscode.commands.executeCommand('editorjumper.updateStatusBar');
                        break;

                    case 'updateVscodeApp':
                        const vscodeAppsForUpdate = config.get('vscodeAppConfigurations') || [];
                        const updatedVscodeApps = vscodeAppsForUpdate.map(a =>
                            a.name === message.app.name ? {
                                ...a,
                                ...message.app,
                                isCustom: message.app.isCustom === true,
                                hidden: message.app.hidden === true
                            } : a
                        );
                        await config.update('vscodeAppConfigurations', updatedVscodeApps, true);
                        const appUpdateConfig = vscode.workspace.getConfiguration('editorjumper');
                        const appUpdateCollapsedSections = appUpdateConfig.get('collapsedSections') || { 'jetbrains-section': true, 'vscode-section': true };
                        configPanel.webview.html = getWebviewContent(appUpdateConfig.get('ideConfigurations'), appUpdateCollapsedSections);
                        vscode.commands.executeCommand('editorjumper.updateStatusBar');
                        break;

                    case 'removeVscodeApp':
                        const vscodeAppsForRemove = config.get('vscodeAppConfigurations') || [];
                        const filteredApps = vscodeAppsForRemove.filter(a => a.name !== message.appName);
                        await config.update('vscodeAppConfigurations', filteredApps, true);
                        vscode.window.showInformationMessage('VSCode app configuration removed');
                        const appRemoveConfig = vscode.workspace.getConfiguration('editorjumper');
                        const appRemoveCollapsedSections = appRemoveConfig.get('collapsedSections') || { 'jetbrains-section': true, 'vscode-section': true };
                        configPanel.webview.html = getWebviewContent(appRemoveConfig.get('ideConfigurations'), appRemoveCollapsedSections);
                        vscode.commands.executeCommand('editorjumper.updateStatusBar');
                        break;

                    case 'selectVscodeAppPath':
                        const appPathOptions = {
                            canSelectFiles: true,
                            canSelectFolders: false,
                            canSelectMany: false,
                            openLabel: 'Select',
                            title: 'Select VSCode App Command'
                        };
                        const appPathResult = await vscode.window.showOpenDialog(appPathOptions);
                        if (appPathResult && appPathResult[0]) {
                            configPanel.webview.postMessage({
                                command: 'setVscodeAppPath',
                                path: appPathResult[0].fsPath
                            });
                        }
                        break;

                    case 'toggleSection':
                        const currentCollapsed = config.get('collapsedSections') || { 'jetbrains-section': true, 'vscode-section': true };
                        currentCollapsed[message.sectionId] = message.collapsed;
                        await config.update('collapsedSections', currentCollapsed, true);
                        break;
                }
            } catch (error) {
                console.error('Error handling message:', error);
                vscode.window.showErrorMessage('Error handling message: ' + error.message);
            }
        },
        undefined,
        context.subscriptions
    );

    configPanel.onDidDispose(
        () => {
            configPanel = undefined;
        },
        null,
        context.subscriptions
    );
    
    return configPanel;
}

/**
 * 获取WebView内容
 * @param {Array} ideConfigurations IDE配置列表
 * @param {Object} collapsedSections 折叠状态对象
 * @returns {string} WebView HTML内容
 */
function getWebviewContent(ideConfigurations, collapsedSections = { 'jetbrains-section': true, 'vscode-section': true }) {
    const ideTypes = ["IDEA", "WebStorm", "PyCharm", "GoLand", "CLion", "PhpStorm", "RubyMine", "Rider", "Android Studio"];
    const config = vscode.workspace.getConfiguration('editorjumper');
    const selectedIDE = config.get('selectedIDE');
    
    // 获取当前平台类型和对应的命令字段名
    const platform = process.platform;
    let commandLabel = 'Command Path';
    
    if (platform === 'darwin') {
        commandLabel = 'Command';
    }

    // 是否是macOS平台
    const isMac = platform === 'darwin';

    const rootProjectPathInspect = config.inspect('jetBrainsRootProjectPath');
    const jetBrainsRootProjectPathRaw = (rootProjectPathInspect && typeof rootProjectPathInspect.workspaceValue === 'string')
        ? rootProjectPathInspect.workspaceValue
        : '';
    const jetBrainsRootProjectPath = escapeHtml(jetBrainsRootProjectPathRaw || '');

    // Slot 和 VSCode App 数据
    const slotTargets = config.get('slotTargets') || [];
    const vscodeAppConfigurations = config.get('vscodeAppConfigurations') || [];
    const slotShortcuts = ['Shift+Alt+O / Shift+Alt+P', 'Shift+Alt+I', 'Shift+Alt+U'];

    // 构建所有可选编辑器列表（用于 Slot 下拉框）
    const jetbrainsOptions = ideConfigurations.filter(ide => !ide.hidden).map(ide => ide.name);
    const vscodeAppOptions = vscodeAppConfigurations.filter(app => !app.hidden).map(app => app.name);
    const slotItemsHtml = slotTargets.map((slot, idx) => {
        const options = slot.type === 'jetbrains' ? jetbrainsOptions : vscodeAppOptions;
        const optionHtml = options.map(name => `<option value="${escapeHtml(name)}" ${slot.target === name ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('');

        return `
                <div class="ide-item">
                    <div class="ide-info">
                        <div>
                            <strong>Slot ${slot.slot}</strong>
                            <span class="slot-shortcut">${escapeHtml(slotShortcuts[idx] || '')}</span>
                        </div>
                    </div>
                    <div class="ide-controls" style="gap: 6px;">
                        <select id="slotType-${idx}" onchange="onSlotTypeChange(${idx})" style="padding: 4px;">
                            <option value="jetbrains" ${slot.type === 'jetbrains' ? 'selected' : ''}>JetBrains</option>
                            <option value="vscode-app" ${slot.type === 'vscode-app' ? 'selected' : ''}>VSCode App</option>
                        </select>
                        <select id="slotTarget-${idx}" style="padding: 4px; min-width: 140px;">
                            ${!slot.target ? '<option value="" selected>(not set)</option>' : ''}
                            ${optionHtml}
                        </select>
                        <button onclick="saveSlot(${idx})">Save</button>
                    </div>
                </div>
            `;
    }).join('');
    const ideItemsHtml = ideConfigurations.map(ide => {
        const safeName = escapeHtml(ide.name);
        const rowId = encodeDomId('ide', ide.name);
        const hiddenId = encodeDomId('hidden', ide.name);
        const nameArg = JSON.stringify(ide.name);

        return `
                    <div id="${rowId}" class="ide-item ${ide.hidden ? 'hidden-ide' : ''}">
                        <div class="ide-info">
                            <div>
                                <strong>${safeName}</strong>
                                ${ide.isCustom ? ' (Custom)' : ''}
                            </div>
                        </div>
                        <div class="ide-controls">
                            <div class="checkbox-group">
                                <input type="checkbox" id="${hiddenId}"
                                    ${ide.hidden ? 'checked' : ''}
                                    onchange='toggleHidden(${nameArg}, ${JSON.stringify(hiddenId)})'>
                                <label for="${hiddenId}">Hidden</label>
                            </div>
                            <button onclick='editIDE(${nameArg})'>Edit</button>
                            ${ide.isCustom ? `
                                <button onclick='removeIDE(${nameArg})'
                                    ${ide.name === selectedIDE ? 'disabled title="Cannot remove currently selected IDE"' : ''}>
                                    Remove
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `;
    }).join('');
    const vscodeAppItemsHtml = vscodeAppConfigurations.map(app => {
        const safeName = escapeHtml(app.name);
        const hiddenId = encodeDomId('vscapp-hidden', app.name);
        const nameArg = JSON.stringify(app.name);

        return `
                    <div class="ide-item ${app.hidden ? 'hidden-ide' : ''}">
                        <div class="ide-info">
                            <div>
                                <strong>${safeName}</strong>
                                ${app.isCustom ? ' (Custom)' : ''}
                            </div>
                        </div>
                        <div class="ide-controls">
                            <div class="checkbox-group">
                                <input type="checkbox" id="${hiddenId}"
                                    ${app.hidden ? 'checked' : ''}
                                    onchange='toggleVscodeAppHidden(${nameArg}, ${JSON.stringify(hiddenId)})'>
                                <label for="${hiddenId}">Hidden</label>
                            </div>
                            <button onclick='editVscodeApp(${nameArg})'>Edit</button>
                            ${app.isCustom ? `<button onclick='removeVscodeApp(${nameArg})'>Remove</button>` : ''}
                        </div>
                    </div>
                `;
    }).join('');

    return `<!DOCTYPE html>
    <html>
    <head>
        <style>
            body { padding: 15px; }
            h2 { margin: 15px 0 10px 0; }
            h3 { margin: 10px 0; }
            .ide-list { 
                margin: 8px 0;
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }
            .slot-list {
                margin: 8px 0;
            }
            .slot-list .ide-item {
                margin-bottom: 16px;
            }
            .collapsible-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: pointer;
                padding: 6px 10px;
                background: var(--vscode-editor-background);
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
                margin: 6px 0;
            }
            .collapsible-header:hover {
                background: var(--vscode-list-hoverBackground);
            }
            .collapsible-content {
                display: block;
            }
            .collapsible-content.collapsed {
                display: none;
            }
            .ide-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 4px 10px;
                margin: 1px 0;
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
            }
            .ide-info {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .ide-controls {
                display: flex;
                gap: 10px;
            }
            .selected-indicator {
                color: var(--vscode-terminal-ansiGreen);
            }
            .form-group {
                margin: 10px 0;
            }
            .form-group label {
                display: block;
                margin-bottom: 5px;
            }
            .form-group input[type="text"],
            .form-group select {
                width: 100%;
                padding: 5px;
            }
            .form-actions {
                margin-top: 20px;
                display: flex;
                gap: 10px;
            }
            .command-group {
                margin-top: 20px;
            }
            .custom-ide-group {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .action-buttons {
                margin-bottom: 20px;
            }
            button {
                padding: 4px 8px;
                cursor: pointer;
            }
            button:disabled {
                cursor: not-allowed;
                opacity: 0.6;
            }
            .hidden-ide {
                opacity: 0.6;
            }
            .checkbox-group {
                display: none;
                align-items: center;
                gap: 10px;
            }
            .checkbox-group input[type="checkbox"] {
                margin: 0;
            }
            .note {
                margin-top: 5px;
                font-size: 0.9em;
                color: var(--vscode-descriptionForeground);
            }
            .highlight {
                background-color: var(--vscode-editor-selectionBackground);
                border-left: 3px solid var(--vscode-terminal-ansiGreen);
            }
            .slot-shortcut {
                color: var(--vscode-descriptionForeground);
                margin-left: 8px;
            }
        </style>
    </head>
    <body>
        <h2>Ez-EditorJumper Configurations</h2>

        <!-- ========== Shortcut Slots (Primary Section) ========== -->
        <h2>Shortcut Slots</h2>
        <div class="note" style="margin-bottom: 16px;">Each slot is bound to a keyboard shortcut. You can assign any JetBrains IDE or VSCode-rooted editor as the target.</div>
        <div class="slot-list">
            ${slotItemsHtml}
        </div>

        <!-- ========== JetBrains Root Project Path ========== -->
        <div class="form-group command-group" style="margin-bottom: 16px; margin-top: 20px;">
            <label for="rootProjectPath">JetBrains 根项目路径（可选）:</label>
            <div style="display: flex; gap: 10px; align-items: center;">
                <input type="text" id="rootProjectPath" style="flex: 1;" value="${jetBrainsRootProjectPath}" placeholder="Directory containing .idea (multi-module / multi-root)">
                <button onclick="selectPathForRootProject()">浏览目录</button>
                <button onclick="saveRootProjectPath()">Save</button>
            </div>
            <div class="note">Leave empty to use workspace folder as project path.</div>
        </div>

        <hr style="margin: 30px 0;">

        <!-- ========== JetBrains IDE Configuration (Collapsible) ========== -->
        <div class="collapsible-header" onclick="toggleCollapsible('jetbrains-section')">
            <div>
                <strong>JetBrains IDE Configuration</strong>
                <span class="slot-shortcut">Click to expand/collapse</span>
            </div>
            <span id="jetbrains-section-toggle">${collapsedSections['jetbrains-section'] ? '▶' : '▼'}</span>
        </div>
        <div id="jetbrains-section" class="collapsible-content ${collapsedSections['jetbrains-section'] ? 'collapsed' : ''}">
            <div class="action-buttons">
                <button onclick="showAddForm()">Add New IDE</button>
            </div>
            <div class="ide-list">
                ${ideItemsHtml}
            </div>
        </div>

        <div id="ideForm" style="display: none; margin-top: 20px;">
            <h3 id="formTitle">Add New IDE</h3>
            <div class="form-group custom-ide-group">
                <input type="checkbox" id="isCustom" onchange="toggleCustomIDE()">
                <label for="isCustom">Custom IDE</label>
            </div>
            <div class="form-group">
                <label for="ideName">IDE Name:</label>
                <select id="ideName">
                    ${ideTypes.map(type => `<option value="${type}">${type}</option>`).join('')}
                </select>
                <input type="text" id="customName" style="display: none;" placeholder="Enter IDE name">
            </div>
            <div class="form-group checkbox-group">
                <input type="checkbox" id="isHidden">
                <label for="isHidden">Hidden</label>
            </div>
            <div class="form-group command-group" id="commandGroup">
                <div style="flex: 1;">
                    <label for="command">${commandLabel}:</label>
                    <div style="display: flex; gap: 10px;">
                        <input type="text" id="command" style="flex: 1;">
                        <button id="browseButton" onclick="selectPath()">Browse...</button>
                    </div>
                    ${isMac ? `<div class="note">Note: Please provide the command name (e.g., idea, pycharm, webstorm). App paths (.app) are not supported.</div>` : 
                    `<div class="note">Note: If left empty, system default path will be used if available.</div>`}
                </div>
            </div>
            <div class="form-actions">
                <button onclick="saveIDE()">Save</button>
                <button onclick="cancelEdit()">Cancel</button>
            </div>
        </div>

        <hr style="margin: 30px 0;">

        <!-- ========== VSCode-Rooted Editors (Collapsible) ========== -->
        <div class="collapsible-header" onclick="toggleCollapsible('vscode-section')">
            <div>
                <strong>VSCode-Rooted Editors</strong>
                <span class="slot-shortcut">Click to expand/collapse</span>
            </div>
            <span id="vscode-section-toggle">${collapsedSections['vscode-section'] ? '▶' : '▼'}</span>
        </div>
        <div id="vscode-section" class="collapsible-content ${collapsedSections['vscode-section'] ? 'collapsed' : ''}">
            <div class="action-buttons">
                <button onclick="showAddVscodeAppForm()">Add New Editor</button>
            </div>
            <div class="ide-list">
                ${vscodeAppItemsHtml}
            </div>
        </div>

        <div id="vscodeAppForm" style="display: none; margin-top: 20px;">
            <h3 id="vscodeAppFormTitle">Add New Editor</h3>
            <div class="form-group">
                <label for="vscodeAppName">Editor Name:</label>
                <input type="text" id="vscodeAppName" placeholder="e.g. MyEditor">
            </div>
            <div class="form-group checkbox-group">
                <input type="checkbox" id="vscodeAppHidden">
                <label for="vscodeAppHidden">Hidden</label>
            </div>
            <div class="form-group command-group">
                <div style="flex: 1;">
                    <label for="vscodeAppCommand">Command Path:</label>
                    <div style="display: flex; gap: 10px;">
                        <input type="text" id="vscodeAppCommand" style="flex: 1;" placeholder="e.g. myeditor or /path/to/myeditor">
                        <button onclick="selectVscodeAppPath()">Browse...</button>
                    </div>
                    <div class="note">If left empty, the default command name will be used.</div>
                </div>
            </div>
            <div class="form-actions">
                <button onclick="saveVscodeApp()">Save</button>
                <button onclick="cancelVscodeAppEdit()">Cancel</button>
            </div>
        </div>

        <script>
            let vscode;
            try {
                vscode = acquireVsCodeApi();
            } catch (error) {
                console.error('Failed to acquire VS Code API:', error);
                alert('Failed to initialize VS Code API. Please reload the window.');
            }
            const configurations = ${JSON.stringify(ideConfigurations)};
            const selectedIDE = ${JSON.stringify(selectedIDE)};
            const platform = '${platform}';
            const commandLabel = '${commandLabel}';
            const isMac = ${isMac};
            // 跟踪当前正在编辑的IDE名称
            let currentEditingIDE = '';

            function toggleCollapsible(sectionId) {
                const section = document.getElementById(sectionId);
                const toggle = document.getElementById(sectionId + '-toggle');
                if (section.classList.contains('collapsed')) {
                    section.classList.remove('collapsed');
                    toggle.textContent = '▼';
                    vscode.postMessage({
                        command: 'toggleSection',
                        sectionId: sectionId,
                        collapsed: false
                    });
                } else {
                    section.classList.add('collapsed');
                    toggle.textContent = '▶';
                    vscode.postMessage({
                        command: 'toggleSection',
                        sectionId: sectionId,
                        collapsed: true
                    });
                }
            }

            function showAddForm() {
                document.getElementById('formTitle').textContent = 'Add New IDE';
                document.getElementById('ideForm').style.display = 'block';
                document.getElementById('isCustom').checked = false;
                document.getElementById('isCustom').disabled = false;
                document.getElementById('isHidden').checked = false;
                document.getElementById('ideName').disabled = false;
                document.getElementById('customName').disabled = false;
                toggleCustomIDE();
                document.getElementById('command').value = '';
                // 重置当前编辑的IDE
                currentEditingIDE = '';
                // 更新下拉选项的禁用状态
                updateSelectOptions();
            }

            function toggleCustomIDE() {
                const isCustom = document.getElementById('isCustom').checked === true;
                const nameSelect = document.getElementById('ideName');
                const customName = document.getElementById('customName');
                const commandGroup = document.getElementById('commandGroup');
                const browseButton = document.getElementById('browseButton');
                
                nameSelect.style.display = isCustom ? 'none' : 'block';
                customName.style.display = isCustom ? 'block' : 'none';
                
                // 更新下拉选项的禁用状态
                updateSelectOptions();
                
                // 在macOS上，只有自定义IDE才能配置路径
                if (isMac) {
                    commandGroup.style.display = isCustom ? 'block' : 'none';
                }
                
                if (isCustom) {
                    customName.value = '';
                    document.getElementById('command').value = '';
                } else {
                    // 更新下拉选项的禁用状态
                    updateSelectOptions();
                    const firstAvailableOption = Array.from(nameSelect.options).find(option => !option.disabled);
                    if (firstAvailableOption) {
                        nameSelect.value = firstAvailableOption.value;
                    }
                    
                    // 在macOS上，非自定义IDE不需要配置路径
                    if (isMac) {
                        document.getElementById('command').value = '';
                    }
                }
            }

            // 更新下拉选项的禁用状态
            function updateSelectOptions() {
                const nameSelect = document.getElementById('ideName');
                if (!nameSelect) return;
                
                Array.from(nameSelect.options).forEach(option => {
                    // 检查是否已存在同名非自定义IDE，但排除当前正在编辑的IDE
                    const isDisabled = configurations.some(ide => 
                        !ide.isCustom && 
                        ide.name === option.value && 
                        ide.name !== currentEditingIDE
                    );
                    option.disabled = isDisabled;
                    option.text = option.value + (isDisabled ? ' (Already exists)' : '');
                });
            }

            function editIDE(name) {
                const ide = configurations.find(i => i.name === name);
                if (!ide) return;

                // 设置当前正在编辑的IDE名称
                currentEditingIDE = name;
                
                document.getElementById('formTitle').textContent = 'Edit IDE';
                document.getElementById('ideForm').style.display = 'block';
                
                const nameSelect = document.getElementById('ideName');
                const customName = document.getElementById('customName');
                const isCustomCheckbox = document.getElementById('isCustom');
                const isHiddenCheckbox = document.getElementById('isHidden');
                const commandGroup = document.getElementById('commandGroup');
                
                isCustomCheckbox.checked = ide.isCustom === true;
                isCustomCheckbox.disabled = true;
                isHiddenCheckbox.checked = ide.hidden === true;
                nameSelect.style.display = ide.isCustom ? 'none' : 'block';
                customName.style.display = ide.isCustom ? 'block' : 'none';
                nameSelect.disabled = true;
                customName.disabled = true;
                
                // 更新下拉选项的禁用状态
                updateSelectOptions();
                
                // 在macOS上，只有自定义IDE才能配置路径
                if (isMac) {
                    commandGroup.style.display = ide.isCustom ? 'block' : 'none';
                }
                
                if (ide.isCustom) {
                    customName.value = ide.name;
                } else {
                    nameSelect.value = ide.name;
                }
                
                document.getElementById('command').value = ide.commandPath || '';
            }

            function saveIDE() {
                if (!vscode) {
                    alert('VS Code API not initialized. Please reload the window.');
                    return;
                }
                
                const isCustom = document.getElementById('isCustom').checked === true;
                const name = (isCustom ? 
                    document.getElementById('customName').value : 
                    document.getElementById('ideName').value).trim();
                let command = document.getElementById('command').value.trim();
                const isHidden = document.getElementById('isHidden').checked === true;

                // 在macOS上，非自定义IDE不需要命令路径
                if (isMac && !isCustom) {
                    command = '';
                } else if (!isCustom && !command) {
                    // 非macOS平台上，非自定义IDE可以有空命令路径，将使用默认路径
                } else if (isCustom && !command) {
                    alert('Please provide a command name or path');
                    return;
                }

                if (!name) {
                    alert('Please provide an IDE name');
                    return;
                }

                if (isCustom && !name.trim()) {
                    alert('Please enter an IDE name');
                    return;
                }

                // 创建IDE对象，根据当前平台设置命令路径
                const ide = {
                    name: name,
                    isCustom: isCustom,
                    hidden: isHidden,
                    commandPath: command
                };
                
                vscode.postMessage({
                    command: currentEditingIDE ? 'updateIDE' : 'addIDE',
                    ide
                });

                document.getElementById('ideForm').style.display = 'none';
                currentEditingIDE = '';
            }

            function toggleHidden(name, checkboxId) {
                const ide = configurations.find(i => i.name === name);
                if (!ide) return;

                const isHidden = document.getElementById(checkboxId).checked === true;
                
                vscode.postMessage({
                    command: 'updateIDE',
                    ide: {
                        ...ide,
                        hidden: isHidden
                    }
                });
            }

            function cancelEdit() {
                document.getElementById('ideForm').style.display = 'none';
                document.getElementById('isCustom').disabled = false;
                document.getElementById('ideName').disabled = false;
                document.getElementById('customName').disabled = false;
                // 重置当前编辑的IDE
                currentEditingIDE = '';
            }

            function removeIDE(name) {
                if (name === selectedIDE) {
                    return;
                }
                
                vscode.postMessage({
                    command: 'removeIDE',
                    ideName: name
                });
            }

            function selectIDE(name) {
                vscode.postMessage({
                    command: 'selectIDE',
                    ideName: name
                });
            }

            function selectPath() {
                if (!vscode) {
                    alert('VS Code API not initialized. Please reload the window.');
                    return;
                }
                
                const isCustom = document.getElementById('isCustom').checked === true;
                const ideName = isCustom ? 
                    document.getElementById('customName').value : 
                    document.getElementById('ideName').value;
                
                vscode.postMessage({
                    command: 'selectPath',
                    ideType: ideName.toLowerCase()
                });
            }

            function selectPathForRootProject() {
                if (!vscode) {
                    alert('VS Code API not initialized. Please reload the window.');
                    return;
                }
                vscode.postMessage({ command: 'selectPathForRootProject' });
            }

            function saveRootProjectPath() {
                if (!vscode) {
                    alert('VS Code API not initialized. Please reload the window.');
                    return;
                }
                const el = document.getElementById('rootProjectPath');
                const path = el ? el.value : '';
                vscode.postMessage({ command: 'saveRootProjectPath', path: path });
            }

            // ========== Slot 相关函数 ==========
            const jetbrainsOptions = ${JSON.stringify(jetbrainsOptions)};
            const vscodeAppOptions = ${JSON.stringify(vscodeAppOptions)};
            const slotTargetsData = ${JSON.stringify(slotTargets)};

            function onSlotTypeChange(idx) {
                const typeSelect = document.getElementById('slotType-' + idx);
                const targetSelect = document.getElementById('slotTarget-' + idx);
                if (!typeSelect || !targetSelect) return;

                const type = typeSelect.value;
                const options = type === 'jetbrains' ? jetbrainsOptions : vscodeAppOptions;
                const currentValue = targetSelect.value;
                targetSelect.innerHTML = '<option value="">(not set)</option>' + options
                    .map(name => '<option value="' + escapeHtmlText(name) + '">' + escapeHtmlText(name) + '</option>')
                    .join('');
                targetSelect.value = options.includes(currentValue) ? currentValue : '';
            }

            function saveSlot(idx) {
                const typeSelect = document.getElementById('slotType-' + idx);
                const targetSelect = document.getElementById('slotTarget-' + idx);
                if (!typeSelect || !targetSelect) return;

                vscode.postMessage({
                    command: 'updateSlot',
                    slotIndex: idx,
                    slotType: typeSelect.value,
                    slotTarget: targetSelect.value
                });
            }

            // ========== VSCode App 相关函数 ==========
            const vscodeAppConfigurations = ${JSON.stringify(vscodeAppConfigurations)};
            let currentEditingVscodeApp = '';

            function showAddVscodeAppForm() {
                document.getElementById('vscodeAppFormTitle').textContent = 'Add New Editor';
                document.getElementById('vscodeAppForm').style.display = 'block';
                document.getElementById('vscodeAppName').value = '';
                document.getElementById('vscodeAppName').disabled = false;
                document.getElementById('vscodeAppHidden').checked = false;
                document.getElementById('vscodeAppCommand').value = '';
                currentEditingVscodeApp = '';
            }

            function editVscodeApp(name) {
                const app = vscodeAppConfigurations.find(a => a.name === name);
                if (!app) return;

                currentEditingVscodeApp = name;
                document.getElementById('vscodeAppFormTitle').textContent = 'Edit Editor';
                document.getElementById('vscodeAppForm').style.display = 'block';
                document.getElementById('vscodeAppName').value = app.name;
                document.getElementById('vscodeAppName').disabled = true;
                document.getElementById('vscodeAppHidden').checked = app.hidden === true;
                document.getElementById('vscodeAppCommand').value = app.commandPath || '';
            }

            function saveVscodeApp() {
                if (!vscode) {
                    alert('VS Code API not initialized. Please reload the window.');
                    return;
                }

                const name = document.getElementById('vscodeAppName').value.trim();
                const isHidden = document.getElementById('vscodeAppHidden').checked === true;
                const commandPath = document.getElementById('vscodeAppCommand').value.trim();

                if (!name || !name.trim()) {
                    alert('Please provide an editor name');
                    return;
                }

                const isCustom = currentEditingVscodeApp
                    ? (vscodeAppConfigurations.find(a => a.name === currentEditingVscodeApp) || {}).isCustom === true
                    : true;

                vscode.postMessage({
                    command: currentEditingVscodeApp ? 'updateVscodeApp' : 'addVscodeApp',
                    app: {
                        name: name,
                        isCustom: isCustom,
                        hidden: isHidden,
                        commandPath: commandPath || null
                    }
                });

                document.getElementById('vscodeAppForm').style.display = 'none';
                currentEditingVscodeApp = '';
            }

            function cancelVscodeAppEdit() {
                document.getElementById('vscodeAppForm').style.display = 'none';
                document.getElementById('vscodeAppName').disabled = false;
                currentEditingVscodeApp = '';
            }

            function toggleVscodeAppHidden(name, checkboxId) {
                const app = vscodeAppConfigurations.find(a => a.name === name);
                if (!app) return;

                const isHidden = document.getElementById(checkboxId).checked === true;

                vscode.postMessage({
                    command: 'updateVscodeApp',
                    app: {
                        ...app,
                        hidden: isHidden
                    }
                });
            }

            function removeVscodeApp(name) {
                vscode.postMessage({
                    command: 'removeVscodeApp',
                    appName: name
                });
            }

            function selectVscodeAppPath() {
                if (!vscode) {
                    alert('VS Code API not initialized. Please reload the window.');
                    return;
                }
                vscode.postMessage({ command: 'selectVscodeAppPath' });
            }

            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.command) {
                    case 'setPath':
                        document.getElementById('command').value = message.path;
                        break;
                    case 'setRootProjectPath':
                        const rootEl = document.getElementById('rootProjectPath');
                        if (rootEl) rootEl.value = message.path || '';
                        break;
                    case 'highlightIDE':
                        const ideElement = document.getElementById(domId('ide', message.ideName));
                        if (ideElement) {
                            ideElement.classList.add('highlight');
                            ideElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            setTimeout(() => {
                                editIDE(message.ideName);
                            }, 500);
                        }
                        break;
                    case 'setVscodeAppPath':
                        const appCmdEl = document.getElementById('vscodeAppCommand');
                        if (appCmdEl) appCmdEl.value = message.path;
                        break;
                }
            });

            function domId(prefix, value) {
                return prefix + '-' + btoa(unescape(encodeURIComponent(String(value || ''))))
                    .replace(/\\+/g, '-')
                    .replace(/\\//g, '_')
                    .replace(/=+$/g, '');
            }

            function escapeHtmlText(value) {
                return String(value)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');
            }
        </script>
    </body>
    </html>
    `;
}

/**
 * 高亮显示指定IDE
 * @param {string} ideName IDE名称
 */
function highlightIDE(ideName) {
    if (configPanel) {
        configPanel.webview.postMessage({
            command: 'highlightIDE',
            ideName: ideName
        });
    }
}

module.exports = {
    createConfigurationPanel,
    highlightIDE,
    refreshConfigurationPanel
}; 
